import posthog from "posthog-js";
import "./style.css";
import { CATALOG } from "./catalog.ts";
import { AudioPlayer } from "./player/audio-player.ts";
import { initTelemetry } from "./player/telemetry.ts";

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

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="shell__header">
    <p class="shell__wordmark">Listen Up Lads</p>
    <p class="shell__tagline">Erotic audio stories, mastered for headphones.</p>
  </header>
  <main class="shell__main" id="player-root"></main>
  <footer class="shell__footer">
    <p>Adults only · 18+ · Cancel anytime</p>
  </footer>
`;

const player = new AudioPlayer(document.querySelector<HTMLElement>("#player-root")!, {
  catalog: CATALOG,
});

// Dev/testing handles (smoke tests drive playback and spy on telemetry through these).
Object.assign(window, {
  __player: player,
  __posthog: posthogToken && posthogHost ? posthog : undefined,
});
