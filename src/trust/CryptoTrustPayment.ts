/**
 * CryptoTrustPayment — Trust Architecture & State Machine for NOWPayments Checkout
 * Delivers risk reduction, transparent feedback, and privacy assurances for the
 * adult category subscription.
 *
 * 4-step mempool state machine: select_currency → awaiting_payment →
 * detected_mempool → confirmed_active.
 *
 * Honest-ledger rule (JGF-129): crypto rails have no card-style statement
 * descriptors, so this surface never claims them. Trust copy is zero-identity
 * wallet-to-wallet; the permanence disclosure lives on the CheckoutModal tab.
 *
 * Chrome modes: "modal" renders the standalone dialog shell (legacy/demo use);
 * "panel" renders only the state-machine body for embedding inside the
 * CheckoutModal crypto tab.
 */

import { t } from "../i18n.ts";

export type CryptoCurrency = "USDT" | "BTC" | "ETH" | "SOL" | "LTC";

export type PaymentState =
  | "select_currency"
  | "awaiting_payment"
  | "detected_mempool"
  | "confirmed_active";

export interface CryptoTrustOptions {
  planName?: string;
  usdPrice?: number;
  /** "modal" (default, standalone) or "panel" (embedded in CheckoutModal). */
  chrome?: "modal" | "panel";
  onPaymentComplete?: (txId: string) => void;
  onCancel?: () => void;
}

export interface CurrencyConfig {
  symbol: CryptoCurrency;
  network: string;
  rateUsd: number;
  sampleAddress: string;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  {
    symbol: "USDT",
    network: "TRC20 / ERC20",
    rateUsd: 1.0,
    sampleAddress: "TQn9Y2khEsLJW1ChVWFMSMeSTow5KaxnLz",
  },
  {
    symbol: "SOL",
    network: "Solana",
    rateUsd: 150.0,
    sampleAddress: "8k2pXfG7Z3bM9vK4sT6wQ1yL5hN8jP0rD",
  },
  {
    symbol: "BTC",
    network: "Bitcoin Native SegWit",
    rateUsd: 65000.0,
    sampleAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  },
  {
    symbol: "ETH",
    network: "Ethereum",
    rateUsd: 2600.0,
    sampleAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  },
  {
    symbol: "LTC",
    network: "Litecoin",
    rateUsd: 70.0,
    sampleAddress: "ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  },
];

export class CryptoTrustPayment {
  private container: HTMLElement | null = null;
  private currentState: PaymentState = "select_currency";
  private selectedCurrency: CurrencyConfig = SUPPORTED_CURRENCIES[0];
  private options: Required<CryptoTrustOptions>;

  constructor(options: CryptoTrustOptions = {}) {
    this.options = {
      planName: options.planName || "VIP Monthly Pass",
      usdPrice: options.usdPrice || 2.99,
      chrome: options.chrome || "modal",
      onPaymentComplete: options.onPaymentComplete || (() => {}),
      onCancel: options.onCancel || (() => {}),
    };
  }

  public getState(): PaymentState {
    return this.currentState;
  }

  public getSelectedCurrency(): CurrencyConfig {
    return this.selectedCurrency;
  }

  public setCurrency(symbol: CryptoCurrency): void {
    const found = SUPPORTED_CURRENCIES.find((c) => c.symbol === symbol);
    if (found) {
      this.selectedCurrency = found;
      this.render();
    }
  }

  public transitionTo(state: PaymentState): void {
    this.currentState = state;
    this.render();
    if (state === "confirmed_active") {
      this.options.onPaymentComplete("simulated_tx_" + Date.now());
    }
  }

  /**
   * Mounts the checkout surface. In "modal" chrome this appends a fixed
   * dialog wrapper to `target`; in "panel" chrome it appends the bare flow
   * container (the host supplies the dialog chrome).
   */
  public mount(target: HTMLElement = document.body): HTMLElement {
    const el = document.createElement("div");
    el.className =
      this.options.chrome === "panel"
        ? "listenuplads-checkout-panel"
        : "listenuplads-checkout-modal";
    if (this.options.chrome === "modal") {
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", "crypto-checkout-title");
    }

    this.container = el;
    target.appendChild(el);
    this.render();
    return el;
  }

  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  private render(): void {
    if (!this.container) return;

    const cryptoAmount = (this.options.usdPrice / this.selectedCurrency.rateUsd).toFixed(
      this.selectedCurrency.symbol === "BTC" ? 6 : this.selectedCurrency.symbol === "ETH" ? 4 : 2,
    );

    const body = this.renderStateContent(cryptoAmount);

    this.container.innerHTML =
      this.options.chrome === "panel"
        ? body
        : `
      <div class="checkout-backdrop" aria-hidden="true"></div>
      <div class="checkout-card">
        <header class="checkout-header">
          <div class="trust-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            ${t("crypto.privatePill")}
          </div>
          <h2 id="crypto-checkout-title" class="checkout-title">${this.options.planName}</h2>
          <div class="checkout-price">$${this.options.usdPrice.toFixed(2)} USD</div>
        </header>

        <div class="checkout-body">
          ${body}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private renderStateContent(cryptoAmount: string): string {
    switch (this.currentState) {
      case "select_currency":
        return `
          <div class="state-select-currency">
            <span class="section-label">${t("crypto.selectAsset")}</span>
            <div class="currency-grid">
              ${SUPPORTED_CURRENCIES.map(
                (c) => `
                <button type="button" class="currency-pill ${c.symbol === this.selectedCurrency.symbol ? "selected" : ""}" data-currency="${c.symbol}">
                  <strong>${c.symbol}</strong>
                  <small>${c.network}</small>
                </button>
              `,
              ).join("")}
            </div>

            <div class="conversion-summary">
              <span>Pay: <strong>${cryptoAmount} ${this.selectedCurrency.symbol}</strong></span>
              <small>${t("crypto.conversionNote")}</small>
            </div>

            <button type="button" class="checkout-btn checkout-btn-primary" id="btn-proceed-pay">
              ${t("crypto.proceed")}
            </button>
            <button type="button" class="checkout-btn checkout-btn-quiet" id="btn-cancel-checkout">
              ${t("crypto.cancel")}
            </button>
          </div>
        `;

      case "awaiting_payment":
        return `
          <div class="state-awaiting-payment">
            <div class="stepper">
              <span class="step done">${t("crypto.stepCurrency")}</span>
              <span class="step active">${t("crypto.stepDeposit")}</span>
              <span class="step">${t("crypto.stepConfirm")}</span>
            </div>

            <div class="qr-placeholder" aria-label="Deposit QR code">
              <div class="qr-box">[ QR Code: ${this.selectedCurrency.symbol} ]</div>
            </div>

            <div class="deposit-box">
              <label>${t("crypto.sendExactly")}</label>
              <div class="copy-row">
                <input type="text" readonly value="${cryptoAmount} ${this.selectedCurrency.symbol}" id="crypto-amount-field" />
                <button type="button" class="copy-btn" data-copy="${cryptoAmount}">${t("crypto.copy")}</button>
              </div>

              <label>${t("crypto.depositAddress", this.selectedCurrency.network)}</label>
              <div class="copy-row">
                <input type="text" readonly value="${this.selectedCurrency.sampleAddress}" id="crypto-address-field" />
                <button type="button" class="copy-btn" data-copy="${this.selectedCurrency.sampleAddress}">${t("crypto.copy")}</button>
              </div>
            </div>

            <div class="listener-status">
              <span class="pulse-indicator"></span>
              <span>${t("crypto.listening")}</span>
            </div>

            <div class="action-row">
              <button type="button" class="checkout-btn checkout-btn-simulate" id="btn-sim-detect">
                ${t("crypto.simBroadcast")}
              </button>
              <button type="button" class="checkout-btn checkout-btn-quiet" id="btn-back-currency">
                ${t("crypto.changeCurrency")}
              </button>
            </div>
          </div>
        `;

      case "detected_mempool":
        return `
          <div class="state-detected-mempool">
            <div class="detected-badge">${t("crypto.detectedBadge")}</div>
            <p class="detected-msg">${t("crypto.detectedBody")}</p>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill"></div>
            </div>
            <button type="button" class="checkout-btn checkout-btn-simulate" id="btn-sim-confirm">
              ${t("crypto.simConfirm")}
            </button>
          </div>
        `;

      case "confirmed_active":
        return `
          <div class="state-confirmed-active">
            <div class="success-icon">&check;</div>
            <h3 class="success-title">${t("crypto.successTitle")}</h3>
            <p class="success-body">${t("crypto.successBody")}</p>
            <button type="button" class="checkout-btn checkout-btn-primary" id="btn-close-success">
              ${t("crypto.startListening")}
            </button>
          </div>
        `;
    }
  }

  private attachEvents(): void {
    if (!this.container) return;

    this.container.querySelectorAll<HTMLButtonElement>("[data-currency]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cur = btn.dataset.currency as CryptoCurrency;
        if (cur) this.setCurrency(cur);
      });
    });

    const proceedBtn = this.container.querySelector<HTMLButtonElement>("#btn-proceed-pay");
    proceedBtn?.addEventListener("click", () => this.transitionTo("awaiting_payment"));

    const cancelBtn = this.container.querySelector<HTMLButtonElement>("#btn-cancel-checkout");
    cancelBtn?.addEventListener("click", () => {
      this.options.onCancel();
      this.unmount();
    });

    const backBtn = this.container.querySelector<HTMLButtonElement>("#btn-back-currency");
    backBtn?.addEventListener("click", () => this.transitionTo("select_currency"));

    const simDetectBtn = this.container.querySelector<HTMLButtonElement>("#btn-sim-detect");
    simDetectBtn?.addEventListener("click", () => this.transitionTo("detected_mempool"));

    const simConfirmBtn = this.container.querySelector<HTMLButtonElement>("#btn-sim-confirm");
    simConfirmBtn?.addEventListener("click", () => this.transitionTo("confirmed_active"));

    const closeSuccessBtn = this.container.querySelector<HTMLButtonElement>("#btn-close-success");
    closeSuccessBtn?.addEventListener("click", () => {
      this.unmount();
    });

    this.container.querySelectorAll<HTMLButtonElement>(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.dataset.copy;
        if (text) {
          void navigator.clipboard?.writeText(text);
          const orig = btn.textContent;
          btn.textContent = t("crypto.copied");
          setTimeout(() => {
            btn.textContent = orig;
          }, 1500);
        }
      });
    });
  }
}
