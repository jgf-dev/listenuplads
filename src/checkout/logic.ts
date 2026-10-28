/**
 * Pure checkout tab state machine — split by payment rail. No DOM access.
 *
 * Card is the primary launch rail (default tab); Crypto is the secondary
 * zero-identity rail. Kept tiny and explicit so the tab contract is testable
 * without rendering.
 */

export type CheckoutTab = "card" | "crypto";

export const CHECKOUT_TABS: readonly CheckoutTab[] = ["card", "crypto"];

export interface CheckoutState {
  tab: CheckoutTab;
}

/** Card is the primary launch rail (CCBill/Segpay/Epoch). */
export function initialCheckoutState(): CheckoutState {
  return { tab: "card" };
}

export function isCheckoutTab(value: unknown): value is CheckoutTab {
  return value === "card" || value === "crypto";
}

/** Switch tab; unknown ids are ignored (state returned unchanged). */
export function selectTab(state: CheckoutState, tab: CheckoutTab): CheckoutState {
  if (!isCheckoutTab(tab) || tab === state.tab) return state;
  return { tab };
}
