/** Shared player types and constants. */

export interface Track {
  /** Stable story id, e.g. "story-3-penthouse-elevator". Used in telemetry. */
  id: string;
  title: string;
  /** Collection label, e.g. "Pilot Season". */
  series: string;
  /** Content descriptor shown under the title, e.g. trope/tags from the QC summary. */
  trope: string;
  /** Duration in seconds from the mastering QC report (fallback: audio metadata). */
  durationSec: number;
  /** Audio URL (mastered mp3). */
  src: string;
  /** Cover art URL for the player surface and MediaSession lockscreen. */
  cover: string;
}

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export const SEEK_STEP_SEC = 15;

export const SLEEP_TIMER_OPTIONS = [
  { id: "off", label: "Off", minutes: null },
  { id: "m15", label: "15m", minutes: 15 },
  { id: "m30", label: "30m", minutes: 30 },
  { id: "m45", label: "45m", minutes: 45 },
  { id: "eot", label: "End of track", minutes: null },
] as const;
export type SleepTimerId = (typeof SLEEP_TIMER_OPTIONS)[number]["id"];

export type DropReason = "pause" | "track_switch" | "page_hide";

export interface TelemetryPort {
  capture(event: string, props: Record<string, string | number | boolean>): void;
}
