/**
 * CheckoutModal — split checkout by payment rail (JGF-129 scope 3).
 *
 * Two honest rails under one dialog:
 *  - Card (primary launch rail, CCBill/Segpay/Epoch): discreet-descriptor lock
 *    banner, SSL/PCI reassurance, one-click cancel note, handoff CTA. We never
 *    collect PAN ourselves — the CTA explains the secure-page handoff.
 *  - Crypto (secondary, NOWPayments): zero-identity banner + the existing
 *    CryptoTrustPayment 4-step mempool state machine (embedded, panel chrome).
 *    No card-style statement-descriptor claims — public ledgers have none.
 *
 * Trust at the money step: every panel states plainly what happens next.
 */

import { t, onLocaleChange } from "../i18n.ts";
import "./checkout.css";
import { CryptoTrustPayment, type PaymentState } from "../trust/CryptoTrustPayment.ts";
import { initialCheckoutState, selectTab, CHECKOUT_TABS, type CheckoutState } from "./logic.ts";

export interface CheckoutModalOptions {
  planName?: string;
  usdPrice?: number;
  onClose?: () => void;
  onMembershipActive?: (txId: string) => void;
}

const LOCK_ICON =
  "M6 10V7a6 6 0 1 1 12 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h8V7a4 4 0 1 0-8 0v3z";
const SHIELD_ICON = "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z";

export class CheckoutModal {
  private dialog: HTMLDialogElement | null = null;
  private state: CheckoutState = initialCheckoutState();
  private crypto: CryptoTrustPayment | null = null;
  private cryptoState: PaymentState = "select_currency";
  private readonly options: Required<CheckoutModalOptions>;
  private readonly unsubscribeLocale: () => void;

  constructor(options: CheckoutModalOptions = {}) {
    this.options = {
      planName: options.planName ?? "VIP Monthly Pass",
      usdPrice: options.usdPrice ?? 2.99,
      onClose: options.onClose ?? (() => {}),
      onMembershipActive: options.onMembershipActive ?? (() => {}),
    };
    this.unsubscribeLocale = onLocaleChange(() => {
      if (this.dialog?.open) this.render();
    });
  }

  public open(): void {
    if (!this.dialog) {
      this.dialog = document.createElement("dialog");
      this.dialog.className = "checkout-dialog";
      this.dialog.setAttribute("aria-labelledby", "checkout-title");
      this.dialog.addEventListener("cancel", () => this.close());
      this.dialog.addEventListener("click", (e) => {
        if (e.target === this.dialog) this.close();
      });
      document.body.appendChild(this.dialog);
    }
    this.render();
    this.dialog.showModal();
  }

  public close(): void {
    this.dialog?.close();
    this.options.onClose();
  }

  public destroy(): void {
    this.unsubscribeLocale();
    this.crypto?.unmount();
    this.dialog?.remove();
    this.dialog = null;
  }

  private render(): void {
    if (!this.dialog) return;
    const { tab } = this.state;

    this.dialog.innerHTML = `
      <div class="checkout-dialog__card" role="document">
        <header class="checkout-dialog__head">
          <div>
            <h2 class="checkout-dialog__title" id="checkout-title">${t("checkout.title")}</h2>
            <p class="checkout-dialog__price">${t("checkout.price")}</p>
          </div>
          <button type="button" class="discovery__close" data-close aria-label="${t("checkout.close")}">×</button>
        </header>

        <div class="checkout-tabs" role="tablist" aria-label="${t("checkout.title")}">
          ${CHECKOUT_TABS.map(
            (id) => `
            <button type="button" role="tab" class="checkout-tabs__tab"
                    id="checkout-tab-${id}" aria-controls="checkout-panel-${id}"
                    aria-selected="${id === tab}" tabindex="${id === tab ? "0" : "-1"}"
                    data-tab="${id}">
              ${t(id === "card" ? "checkout.tabCard" : "checkout.tabCrypto")}
            </button>`,
          ).join("")}
        </div>

        <section class="checkout-panel" role="tabpanel" id="checkout-panel-${tab}"
                 aria-labelledby="checkout-tab-${tab}">
          ${tab === "card" ? this.renderCardPanel() : '<div class="crypto-host"></div>'}
        </section>
      </div>
    `;

    this.dialog
      .querySelector<HTMLButtonElement>("[data-close]")
      ?.addEventListener("click", () => this.close());

    const tabs = Array.from(this.dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs.forEach((btn, i) => {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab ?? ""));
      btn.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(i + delta + tabs.length) % tabs.length];
        next.focus();
        this.switchTab(next.dataset.tab ?? "");
      });
    });

    if (tab === "card") {
      this.dialog
        .querySelector<HTMLButtonElement>("[data-card-cta]")
        ?.addEventListener("click", () => {
          const note = this.dialog?.querySelector<HTMLElement>("[data-card-note]");
          if (note) {
            note.hidden = false;
            note.textContent = t("checkout.cardCtaNote");
          }
        });
    } else {
      this.mountCryptoPanel();
    }
  }

  private switchTab(id: string): void {
    if (id !== "card" && id !== "crypto") return;
    // Preserve crypto progress across tab hops and locale switches.
    if (this.crypto) this.cryptoState = this.crypto.getState();
    this.state = selectTab(this.state, id);
    this.render();
  }

  private renderCardPanel(): string {
    return `
      <div class="checkout-trust-banner">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path d="${LOCK_ICON}" fill="currentColor"/>
        </svg>
        <div>
          <p class="checkout-trust-banner__title">${t("checkout.cardBannerTitle")}</p>
          <p class="checkout-trust-banner__body">${t("checkout.cardBannerBody")}</p>
        </div>
      </div>

      <ul class="checkout-facts">
        <li>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="${SHIELD_ICON}" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
          <span>${t("checkout.cardSsl")}</span>
        </li>
        <li>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="${SHIELD_ICON}" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
          <span>${t("checkout.cardHandoff")}</span>
        </li>
        <li>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="${SHIELD_ICON}" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
          <span>${t("checkout.cardCancel")}</span>
        </li>
      </ul>

      <button type="button" class="checkout-btn checkout-btn-primary" data-card-cta>
        ${t("checkout.cardCta")}
      </button>
      <p class="checkout-note" data-card-note hidden></p>
    `;
  }

  private mountCryptoPanel(): void {
    const host = this.dialog?.querySelector<HTMLElement>(".crypto-host");
    if (!host) return;

    const banner = document.createElement("div");
    banner.className = "checkout-trust-banner checkout-trust-banner--crypto";
    banner.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path d="${SHIELD_ICON}" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>
      <div>
        <p class="checkout-trust-banner__title">${t("checkout.cryptoBannerTitle")}</p>
        <p class="checkout-trust-banner__body">${t("checkout.cryptoBannerBody")}</p>
      </div>
    `;
    const ledger = document.createElement("p");
    ledger.className = "checkout-ledger-note";
    ledger.textContent = t("checkout.cryptoLedgerNote");

    host.appendChild(banner);
    host.appendChild(ledger);

    this.crypto = new CryptoTrustPayment({
      planName: this.options.planName,
      usdPrice: this.options.usdPrice,
      chrome: "panel",
      onCancel: () => this.close(),
      onPaymentComplete: (txId) => this.options.onMembershipActive(txId),
    });
    this.crypto.mount(host);
    if (this.cryptoState !== "select_currency") {
      this.crypto.transitionTo(this.cryptoState);
    }
  }
}
