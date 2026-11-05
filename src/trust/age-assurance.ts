/**
 * age-assurance — two-tier age assurance architecture for listenuplads.
 *
 * Tier 1 (baseline): the self-declaration 18+ dialog in AgeGateModal
 * (localStorage["listenuplads_age_confirmed_v1"]). Unchanged.
 *
 * Tier 2 (statutory — UK Online Safety Act, French ARCOM, mandated US states):
 * a provider-integration seam. A Veriff-class provider drops in by implementing
 * AgeAssuranceProvider; the app only ever sees an anonymous yes/no token:
 *
 *     verify() → AnonymousAgeToken → unlock
 *
 * No identity document, name, or birthdate ever touches this app — the token
 * is an opaque, expiring attestation. This module ships the architecture and a
 * clearly-labelled stub provider; no live provider spend is wired here.
 */

import { t } from "../i18n.ts";

/** Opaque, non-identifying attestation returned by a provider. */
export interface AnonymousAgeToken {
  /** Opaque provider-issued string. Must not encode name, DOB, or document data. */
  token: string;
  /** Epoch ms. */
  issuedAt: number;
  /** Epoch ms; the app re-verifies after expiry. */
  expiresAt: number;
}

/** The seam a Veriff-class provider implements. */
export interface AgeAssuranceProvider {
  readonly id: string;
  /** Begin verification; resolves to an anonymous token on success. */
  verify(ctx?: { signal?: AbortSignal }): Promise<AnonymousAgeToken>;
}

export type AgeAssuranceTier = "tier1_self_declaration" | "tier2_statutory";

/**
 * Regions where self-declaration is not legally sufficient.
 * GB: Online Safety Act. FR: ARCOM. US-*: state-level mandates
 * (TX, LA, UT, VA, AR, MT, NC, IN, …). Extended as counsel updates the map.
 */
export const STATUTORY_REGIONS: ReadonlySet<string> = new Set([
  "GB",
  "FR",
  "US-TX",
  "US-LA",
  "US-UT",
  "US-VA",
  "US-AR",
  "US-MT",
  "US-NC",
]);

export function requiredTierForRegion(region: string | null | undefined): AgeAssuranceTier {
  if (!region) return "tier1_self_declaration";
  return STATUTORY_REGIONS.has(region.trim().toUpperCase())
    ? "tier2_statutory"
    : "tier1_self_declaration";
}

export const AGE_TOKEN_STORAGE_KEY = "listenuplads_age_token_v1";

/** Pluggable storage so tests (and non-DOM contexts) can drive the service. */
export interface AgeTokenStore {
  get(): string | null;
  set(value: string): void;
  remove(): void;
}

export function localStorageAgeTokenStore(key: string = AGE_TOKEN_STORAGE_KEY): AgeTokenStore {
  return {
    get: () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // storage unavailable — unlock lasts for this session only
      }
    },
    remove: () => {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };
}

interface StoredToken {
  token: string;
  expiresAt: number;
}

/**
 * Coordinates Tier-2 verification: runs the provider, persists only the
 * anonymous token, and reports unlock state. Player/checkout read
 * isUnlocked(); they never touch provider specifics.
 */
export class AgeAssuranceService {
  private readonly provider: AgeAssuranceProvider;
  private readonly store: AgeTokenStore;
  private readonly now: () => number;

  constructor(options: {
    provider: AgeAssuranceProvider;
    store?: AgeTokenStore;
    now?: () => number;
  }) {
    this.provider = options.provider;
    this.store = options.store ?? localStorageAgeTokenStore();
    this.now = options.now ?? (() => Date.now());
  }

  /** True when an unexpired anonymous token is present. */
  public isUnlocked(): boolean {
    const raw = this.store.get();
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as StoredToken;
      return (
        typeof parsed.token === "string" &&
        parsed.token.length > 0 &&
        typeof parsed.expiresAt === "number" &&
        parsed.expiresAt > this.now()
      );
    } catch {
      return false;
    }
  }

  /**
   * verify → persist anonymous token → unlock. Throws (and stores nothing)
   * when the provider fails; the caller keeps the gate closed on rejection.
   */
  public async unlock(ctx?: { signal?: AbortSignal }): Promise<AnonymousAgeToken> {
    const token = await this.provider.verify(ctx);
    this.store.set(JSON.stringify({ token: token.token, expiresAt: token.expiresAt }));
    return token;
  }

  public clear(): void {
    this.store.remove();
  }
}

/**
 * StubAgeAssuranceProvider — stands in for the Veriff-class integration until
 * a provider contract is signed (no live spend on JGF-129). Issues an
 * obviously synthetic anonymous token after a short delay; `failWith` forces
 * the failure path for tests.
 */
export class StubAgeAssuranceProvider implements AgeAssuranceProvider {
  readonly id = "stub-age-assurance";
  private readonly failWith: Error | null;
  private readonly delayMs: number;

  constructor(options: { failWith?: Error; delayMs?: number } = {}) {
    this.failWith = options.failWith ?? null;
    this.delayMs = options.delayMs ?? 300;
  }

  verify(): Promise<AnonymousAgeToken> {
    if (this.failWith) return Promise.reject(this.failWith);
    const now = Date.now();
    return new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            token: `stub-anon-age-token-${now.toString(36)}`,
            issuedAt: now,
            expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
          }),
        this.delayMs,
      ),
    );
  }
}

/**
 * StatutoryAgeGate — the Tier-2 dialog. Same accessible <dialog> pattern as
 * the Tier-1 gate, but the primary action runs the provider seam instead of
 * self-declaration. Copy states plainly what happens next (no dark patterns).
 */
export class StatutoryAgeGate {
  private dialog: HTMLDialogElement | null = null;
  private busy = false;
  private readonly service: AgeAssuranceService;
  private readonly options: {
    onUnlocked?: () => void;
    onExit?: () => void;
    exitUrl?: string;
  };

  constructor(
    service: AgeAssuranceService,
    options: {
      onUnlocked?: () => void;
      onExit?: () => void;
      exitUrl?: string;
    } = {},
  ) {
    this.service = service;
    this.options = options;
  }

  public mount(container: HTMLElement = document.body): HTMLDialogElement {
    if (this.dialog && container.contains(this.dialog)) {
      this.dialog.showModal();
      return this.dialog;
    }

    const dialog = document.createElement("dialog");
    dialog.className = "listenuplads-agegate listenuplads-agegate--statutory";
    dialog.setAttribute("aria-labelledby", "ageverify-heading");
    dialog.setAttribute("aria-describedby", "ageverify-desc");

    dialog.innerHTML = `
      <div class="agegate-card">
        <div class="agegate-badge">${t("ageverify.badge")}</div>
        <h2 id="ageverify-heading" class="agegate-title">${t("ageverify.title")}</h2>
        <p id="ageverify-desc" class="agegate-body">${t("ageverify.body")}</p>
        <div class="agegate-actions">
          <button type="button" class="agegate-btn agegate-btn-primary" id="ageverify-go-btn">
            ${t("ageverify.cta")}
          </button>
          <button type="button" class="agegate-btn agegate-btn-secondary" id="ageverify-exit-btn">
            ${t("ageverify.exit")}
          </button>
        </div>
        <p class="agegate-status" role="status" aria-live="polite"></p>
      </div>
    `;

    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.handleExit();
    });

    dialog
      .querySelector<HTMLButtonElement>("#ageverify-go-btn")
      ?.addEventListener("click", () => void this.handleVerify());
    dialog
      .querySelector<HTMLButtonElement>("#ageverify-exit-btn")
      ?.addEventListener("click", () => this.handleExit());

    container.appendChild(dialog);
    this.dialog = dialog;
    dialog.showModal();
    return dialog;
  }

  private async handleVerify(): Promise<void> {
    if (this.busy || !this.dialog) return;
    this.busy = true;
    const status = this.dialog.querySelector<HTMLElement>(".agegate-status");
    const btn = this.dialog.querySelector<HTMLButtonElement>("#ageverify-go-btn");
    if (status) status.textContent = t("ageverify.verifying");
    if (btn) btn.disabled = true;
    try {
      await this.service.unlock();
      this.dialog.close();
      this.dialog.remove();
      this.dialog = null;
      this.options.onUnlocked?.();
    } catch {
      if (status) status.textContent = t("ageverify.failed");
      if (btn) btn.disabled = false;
    } finally {
      this.busy = false;
    }
  }

  private handleExit(): void {
    this.options.onExit?.();
    const exitUrl = this.options.exitUrl ?? "https://google.com";
    window.location.href = exitUrl;
  }
}
