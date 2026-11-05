/**
 * PostHog telemetry port for the player.
 *
 * No-op safe: when PostHog is not configured (missing env in dev) every event
 * drops silently instead of throwing inside the player. The init decision and
 * the loud dev warning live in main.ts; this module only forwards.
 */

import type { TelemetryPort } from "./types.ts";

type PostHogLike = { capture(event: string, props?: Record<string, unknown>): void } | null;

let client: PostHogLike = null;

export function initTelemetry(posthog: PostHogLike): void {
  client = posthog;
}

export const telemetry: TelemetryPort = {
  capture(event, props) {
    if (!client) return;
    try {
      client.capture(event, props);
    } catch {
      // Telemetry must never break playback.
    }
  },
};
