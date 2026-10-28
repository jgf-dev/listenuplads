// Unit and Behavioral tests for listenuplads Trust Surfaces & Tokens
// Run: node --test tests/test_trust_surfaces.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage and DOM environment for headless Node test
const storage = {};
globalThis.localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => {
    storage[k] = String(v);
  },
  removeItem: (k) => {
    delete storage[k];
  },
  clear: () => {
    for (const k in storage) delete storage[k];
  },
};

globalThis.document = {
  createElement: (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      attributes: {},
      innerHTML: "",
      className: "",
      dataset: {},
      style: {},
      children: [],
      setAttribute: (k, v) => {
        el.attributes[k] = String(v);
      },
      getAttribute: (k) => el.attributes[k] || null,
      appendChild: (c) => {
        el.children.push(c);
        return c;
      },
      remove: () => {},
      addEventListener: () => {},
      showModal: () => {},
      close: () => {},
      querySelector: () => ({ addEventListener: () => {} }),
      querySelectorAll: () => [],
    };
    return el;
  },
  body: {
    appendChild: () => {},
    contains: () => false,
  },
};

// Import TS sources via ts-node or dynamic import if transpilable,
// or test the logic and exported structures.
import { sharedTokens, listenupladsTheme, getThemeCssVariables } from "../src/tokens.ts";
import { AgeGateModal, AGE_GATE_STORAGE_KEY } from "../src/trust/AgeGateModal.ts";
import { CryptoTrustPayment, SUPPORTED_CURRENCIES } from "../src/trust/CryptoTrustPayment.ts";
import { GeoblockNotice } from "../src/trust/GeoblockNotice.ts";

test("Token definitions match JGF-15 design specifications", () => {
  assert.equal(sharedTokens.accessibility.touchTargetMin, "44px");
  assert.equal(listenupladsTheme.colors.bgApp, "#0A070F");
  assert.equal(listenupladsTheme.colors.bgCard, "#15101F");
  assert.equal(listenupladsTheme.colors.accentPrimary, "#D8B4FE");
  assert.equal(listenupladsTheme.colors.accentSecondary, "#FF6EA9");
  assert.equal(listenupladsTheme.colors.success, "#7EE2B8");

  const css = getThemeCssVariables();
  assert.match(css, /--token-bg-app: #0A070F/);
  assert.match(css, /--token-accent-primary: #D8B4FE/);
  assert.match(css, /--token-touch-min: 44px/);
});

test("AgeGateModal enforces 18+ statutory verification and persistence", () => {
  localStorage.clear();
  const gate = new AgeGateModal();
  assert.equal(gate.isConfirmed(), false);

  gate.handleConfirm();
  assert.equal(gate.isConfirmed(), true);
  assert.equal(localStorage.getItem(AGE_GATE_STORAGE_KEY), "true");

  AgeGateModal.reset();
  assert.equal(gate.isConfirmed(), false);
});

test("AgeGateModal DOM creation contains transparent, non-manipulative copy", () => {
  const gate = new AgeGateModal();
  const el = gate.mount();
  // Copy lives in src/i18n.ts (EN table) after the JGF-129 i18n migration;
  // wording follows the JGF-132 tone-gate verdict (single billing descriptor).
  assert.match(el.innerHTML, /Adult Erotic Audio/);
  assert.match(el.innerHTML, /18\+ Restricted Audience/);
  assert.match(el.innerHTML, /I am 18 or older/);
  assert.match(el.innerHTML, /LUL MEDIA QC/);
});

test("CryptoTrustPayment state machine and supported rails", () => {
  const checkout = new CryptoTrustPayment({ planName: "VIP Pass", usdPrice: 15.0 });
  assert.equal(checkout.getState(), "select_currency");

  assert.equal(SUPPORTED_CURRENCIES.length, 5);
  const symbols = SUPPORTED_CURRENCIES.map((c) => c.symbol);
  assert.deepEqual(symbols, ["USDT", "SOL", "BTC", "ETH", "LTC"]);

  checkout.setCurrency("BTC");
  assert.equal(checkout.getSelectedCurrency().symbol, "BTC");

  checkout.transitionTo("awaiting_payment");
  assert.equal(checkout.getState(), "awaiting_payment");

  checkout.transitionTo("detected_mempool");
  assert.equal(checkout.getState(), "detected_mempool");

  let completedTx = "";
  const activeCheckout = new CryptoTrustPayment({
    onPaymentComplete: (tx) => {
      completedTx = tx;
    },
  });
  activeCheckout.transitionTo("confirmed_active");
  assert.match(completedTx, /^simulated_tx_/);
});

test("GeoblockNotice formats country code and provides regulatory copy", () => {
  const notice = new GeoblockNotice({ countryCode: "gb" });
  const target = document.createElement("div");
  const el = notice.mount(target);

  assert.match(el.innerHTML, /Region Unavailable/);
  assert.match(el.innerHTML, /Regulatory Restriction \(GB\)/);
  assert.match(el.innerHTML, /JGF MEDIA Compliance/);
});
