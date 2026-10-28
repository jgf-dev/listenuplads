import posthog from "posthog-js";
import "./style.css";
import "./trust/trust.css";
import { getThemeCssVariables } from "./tokens.ts";
import {
  detectInitialLocale,
  getLocale,
  initLocale,
  onLocaleChange,
  setLocale,
  t,
} from "./i18n.ts";
import { CATALOG } from "./catalog.ts";
import { AudioPlayer } from "./player/audio-player.ts";
import { initTelemetry } from "./player/telemetry.ts";
import { DiscoveryFilters } from "./discovery/DiscoveryFilters.ts";
import { CheckoutModal } from "./checkout/CheckoutModal.ts";
import { AgeGateModal } from "./trust/AgeGateModal.ts";
import {
  AgeAssuranceService,
  StatutoryAgeGate,
  StubAgeAssuranceProvider,
  requiredTierForRegion,
} from "./trust/age-assurance.ts";

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_TOKEN;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

if (!posthogToken && import.meta.env.DEV) {
  throw new Error(
    "VITE_PUBLIC_POSTHOG_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_TOKEN is configured",
  );
}

if (!posthogHost && import.meta.env.DEV) {
  throw new Error(
    "VITE_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_HOST is configured",
  );
}

if (posthogToken && posthogHost) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-05-30",
    debug: import.meta.env.DEV,
  });
  initTelemetry(posthog);
}

// --- Design tokens: inject the canonical --token-* custom properties once,
// before first paint. Every surface reads var(--token-*) — no hardcoded hexes.
const themeStyle = document.createElement("style");
themeStyle.id = "lul-theme-tokens";
themeStyle.textContent = getThemeCssVariables();
document.head.appendChild(themeStyle);

// --- Locale: persisted choice wins; FR browser defaults to French.
initLocale(detectInitialLocale());

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="shell__header">
    <div class="shell__brand">
      <p class="shell__wordmark">Listen Up Lads</p>
      <p class="shell__tagline" data-shell="tagline"></p>
    </div>
    <div class="shell__header-actions">
      <span class="shell__age-pill" data-shell="age-pill"></span>
      <button type="button" class="shell__lang-toggle" data-shell="lang-toggle"></button>
    </div>
  </header>
  <main class="shell__main">
    <div id="discovery-root"></div>
    <div id="player-root"></div>
    <button type="button" class="shell__vip" data-shell="vip"></button>
  </main>
  <footer class="shell__footer">
    <p data-shell="footer"></p>
  </footer>
`;

// --- Two-tier age assurance (JGF-129 scope 4).
// Region hint seam: production geo-IP resolves at the edge; the PWA reads a
// `?region=` override (dev/testing) until then. Statutory regions (UK OSA,
// French ARCOM, mandated US states) get the Tier-2 provider seam; everywhere
// else keeps the Tier-1 self-declaration dialog. StubAgeAssuranceProvider
// stands in for the Veriff-class contract — no live provider spend here.
const regionHint = new URLSearchParams(window.location.search).get("region");
const assuranceService = new AgeAssuranceService({
  provider: new StubAgeAssuranceProvider(),
});

function ageSatisfied(): boolean {
  return requiredTierForRegion(regionHint) === "tier2_statutory"
    ? assuranceService.isUnlocked()
    : new AgeGateModal().isConfirmed();
}

function syncShellStrings(): void {
  const set = (slot: string, value: string) => {
    const el = app.querySelector<HTMLElement>(`[data-shell="${slot}"]`);
    if (el) el.textContent = value;
  };
  set("tagline", t("shell.tagline"));
  set("footer", t("shell.footer"));
  set("vip", t("shell.unlockVip"));
  set("lang-toggle", t("shell.langSwitchLabel"));
  set("age-pill", ageSatisfied() ? t("shell.ageVerified") : t("shell.agePending"));
}

if (requiredTierForRegion(regionHint) === "tier2_statutory") {
  if (!assuranceService.isUnlocked()) {
    const gate = new StatutoryAgeGate(assuranceService, {
      onUnlocked: () => syncShellStrings(),
    });
    gate.mount();
  }
} else {
  const gate = new AgeGateModal({ onConfirm: () => syncShellStrings() });
  gate.mountIfNeeded();
}

syncShellStrings();

// --- Discovery → player: filters apply via setCatalog (current track keeps
// playing when it survives the filter).
const player = new AudioPlayer(document.querySelector<HTMLElement>("#player-root")!, {
  catalog: CATALOG,
});

const discovery = new DiscoveryFilters(document.querySelector<HTMLElement>("#discovery-root")!, {
  stories: CATALOG,
  onApply: (filtered) => player.setCatalog(filtered),
});

// --- Split checkout modal (card rail primary, crypto rail secondary).
const checkout = new CheckoutModal();

app
  .querySelector<HTMLButtonElement>('[data-shell="vip"]')
  ?.addEventListener("click", () => checkout.open());

app
  .querySelector<HTMLButtonElement>('[data-shell="lang-toggle"]')
  ?.addEventListener("click", () => setLocale(getLocale() === "en" ? "fr" : "en"));

// Player and discovery self-refresh their strings; the shell syncs here.
onLocaleChange(() => syncShellStrings());

// Dev/testing handles (smoke tests drive playback and spy on telemetry through these).
Object.assign(window, {
  __player: player,
  __discovery: discovery,
  __checkout: checkout,
  __setLocale: setLocale,
  __posthog: posthogToken && posthogHost ? posthog : undefined,
});
