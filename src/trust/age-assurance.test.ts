import { describe, expect, it } from "vite-plus/test";
import {
  AGE_TOKEN_STORAGE_KEY,
  AgeAssuranceService,
  STATUTORY_REGIONS,
  StubAgeAssuranceProvider,
  requiredTierForRegion,
  type AgeTokenStore,
} from "./age-assurance.ts";

function memoryStore(): AgeTokenStore & { dump(): Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    get: () => data[AGE_TOKEN_STORAGE_KEY] ?? null,
    set: (v) => {
      data[AGE_TOKEN_STORAGE_KEY] = v;
    },
    remove: () => {
      delete data[AGE_TOKEN_STORAGE_KEY];
    },
    dump: () => ({ ...data }),
  };
}

describe("requiredTierForRegion", () => {
  it("statutory regions require tier 2 (UK OSA, FR ARCOM, mandated US states)", () => {
    for (const region of ["GB", "FR", "US-TX", "US-LA", "US-UT"]) {
      expect(requiredTierForRegion(region)).toBe("tier2_statutory");
      expect(STATUTORY_REGIONS.has(region)).toBe(true);
    }
  });

  it("normalizes case and whitespace", () => {
    expect(requiredTierForRegion(" gb ")).toBe("tier2_statutory");
    expect(requiredTierForRegion("fr")).toBe("tier2_statutory");
  });

  it("everywhere else keeps tier-1 self-declaration", () => {
    for (const region of [null, undefined, "", "CA", "DE", "US-NY"]) {
      expect(requiredTierForRegion(region)).toBe("tier1_self_declaration");
    }
  });
});

describe("AgeAssuranceService (verify → anonymous token → unlock seam)", () => {
  it("starts locked; unlock persists the token and unlocks", async () => {
    const store = memoryStore();
    const service = new AgeAssuranceService({
      provider: new StubAgeAssuranceProvider({ delayMs: 0 }),
      store,
    });
    expect(service.isUnlocked()).toBe(false);

    const token = await service.unlock();
    expect(token.token.length).toBeGreaterThan(0);
    expect(service.isUnlocked()).toBe(true);
  });

  it("persists only the anonymous attestation — never identity data", async () => {
    const store = memoryStore();
    const service = new AgeAssuranceService({
      provider: new StubAgeAssuranceProvider({ delayMs: 0 }),
      store,
    });
    await service.unlock();
    const stored = JSON.parse(store.dump()[AGE_TOKEN_STORAGE_KEY]);
    expect(Object.keys(stored).sort()).toEqual(["expiresAt", "token"]);
    expect(stored.token).not.toMatch(/name|dob|birth|document/i);
  });

  it("an expired token no longer unlocks", async () => {
    const store = memoryStore();
    let now = 1_000_000;
    const service = new AgeAssuranceService({
      provider: new StubAgeAssuranceProvider({ delayMs: 0 }),
      store,
      now: () => now,
    });
    await service.unlock();
    expect(service.isUnlocked()).toBe(true);

    now = Number.MAX_SAFE_INTEGER; // far past any expiry
    expect(service.isUnlocked()).toBe(false);
  });

  it("corrupt stored values fail closed (locked)", () => {
    const store = memoryStore();
    store.set("not-json");
    const service = new AgeAssuranceService({
      provider: new StubAgeAssuranceProvider({ delayMs: 0 }),
      store,
    });
    expect(service.isUnlocked()).toBe(false);

    store.set(JSON.stringify({ token: "", expiresAt: Date.now() + 1000 }));
    expect(service.isUnlocked()).toBe(false);
  });

  it("provider failure throws and stores nothing (gate stays closed)", async () => {
    const store = memoryStore();
    const service = new AgeAssuranceService({
      provider: new StubAgeAssuranceProvider({
        delayMs: 0,
        failWith: new Error("provider unavailable"),
      }),
      store,
    });
    await expect(service.unlock()).rejects.toThrow("provider unavailable");
    expect(store.dump()[AGE_TOKEN_STORAGE_KEY]).toBeUndefined();
    expect(service.isUnlocked()).toBe(false);
  });

  it("clear() revokes the unlock", async () => {
    const store = memoryStore();
    const service = new AgeAssuranceService({
      provider: new StubAgeAssuranceProvider({ delayMs: 0 }),
      store,
    });
    await service.unlock();
    service.clear();
    expect(service.isUnlocked()).toBe(false);
  });
});

describe("StubAgeAssuranceProvider contract", () => {
  it("issues an expiring anonymous token a Veriff-class provider can mirror", async () => {
    const provider = new StubAgeAssuranceProvider({ delayMs: 0 });
    expect(provider.id).toBe("stub-age-assurance");
    const token = await provider.verify();
    expect(typeof token.token).toBe("string");
    expect(typeof token.issuedAt).toBe("number");
    expect(typeof token.expiresAt).toBe("number");
    expect(token.expiresAt).toBeGreaterThan(token.issuedAt);
  });
});
