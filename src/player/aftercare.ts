/**
 * aftercare — pure logic for the dual-state "Switch to Aftercare / Warmth"
 * player toggle. DOM + audio wiring live in audio-player.ts; the pairing
 * rules and the crossfade curve are unit-tested here.
 *
 * Pairing is metadata on the story (Track.aftercare). Unpaired stories are a
 * first-class state: the toggle renders disabled with an explaining tooltip —
 * never hidden — so the affordance is discoverable and honest.
 */

import type { Track } from "./types.ts";

export type PlayerMode = "story" | "aftercare";

/** True when the story carries an aftercare pairing the toggle can crossfade to. */
export function canAftercare(track: Pick<Track, "aftercare"> | null | undefined): boolean {
  return (
    !!track?.aftercare && typeof track.aftercare.src === "string" && track.aftercare.src.length > 0
  );
}

/** Resolve the mode after a toggle request. Unpaired stories always stay on "story". */
export function resolveToggle(
  track: Track | null | undefined,
  current: PlayerMode,
): { mode: PlayerMode; changed: boolean; reason: "toggled" | "unpaired" } {
  if (!canAftercare(track)) {
    return { mode: "story", changed: false, reason: "unpaired" };
  }
  const mode: PlayerMode = current === "story" ? "aftercare" : "story";
  return { mode, changed: true, reason: "toggled" };
}

/**
 * Equal-power crossfade gains for t ∈ [0, 1]. Keeps perceived loudness flat
 * through the fade (cos/sin pair sums to constant power). t is clamped.
 */
export function crossfadeGains(t: number): { fadeOut: number; fadeIn: number } {
  const clamped = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : 0;
  const angle = clamped * (Math.PI / 2);
  return { fadeOut: Math.cos(angle), fadeIn: Math.sin(angle) };
}

/** Crossfade window (ms) — inside the 250–400ms spec band; mirrors --token-dur-slow. */
export const CROSSFADE_MS = 400;
