import { describe, expect, it } from "vite-plus/test";
import { CHECKOUT_TABS, initialCheckoutState, isCheckoutTab, selectTab } from "./logic.ts";

describe("checkout tab state machine", () => {
  it("card is the primary launch rail (default tab)", () => {
    expect(initialCheckoutState().tab).toBe("card");
    expect(CHECKOUT_TABS[0]).toBe("card");
    expect(CHECKOUT_TABS).toContain("crypto");
  });

  it("switches between rails", () => {
    const card = initialCheckoutState();
    const crypto = selectTab(card, "crypto");
    expect(crypto.tab).toBe("crypto");
    expect(card.tab).toBe("card"); // immutable
    expect(selectTab(crypto, "card").tab).toBe("card");
  });

  it("re-selecting the active tab is a no-op (same object)", () => {
    const card = initialCheckoutState();
    expect(selectTab(card, "card")).toBe(card);
  });

  it("unknown tab ids are ignored", () => {
    const card = initialCheckoutState();
    // @ts-expect-error runtime robustness against untrusted input
    expect(selectTab(card, "wire-transfer")).toBe(card);
    expect(isCheckoutTab("card")).toBe(true);
    expect(isCheckoutTab("crypto")).toBe(true);
    expect(isCheckoutTab("wire-transfer")).toBe(false);
    expect(isCheckoutTab(undefined)).toBe(false);
  });
});
