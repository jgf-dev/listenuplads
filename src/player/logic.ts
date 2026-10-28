/**
 * Pure player logic — no DOM access, unit-tested in logic.test.ts.
 */

import { SEEK_STEP_SEC, SLEEP_TIMER_OPTIONS, type SleepTimerId } from "./types.ts";

/** Format seconds as m:ss (or h:mm:ss past one hour). Negative/NaN clamp to 0:00. */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const whole = Math.floor(totalSeconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Clamp a seek target into [0, duration]. duration<=0 collapses to 0. */
export function clampTime(target: number, duration: number): number {
  if (!Number.isFinite(target) || target < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(target, duration);
}

/** Skip target for ±15s transport buttons (or a custom MediaSession offset). */
export function skipBy(
  current: number,
  direction: 1 | -1,
  duration: number,
  step = SEEK_STEP_SEC,
): number {
  return clampTime(current + direction * step, duration);
}

/** Progress as a 0–100 percentage; guards divide-by-zero and inversion. */
export function progressPct(current: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.round(Math.min(Math.max(current / duration, 0), 1) * 1000) / 10;
}

/** A play session at or beyond this fraction counts as complete, not a drop. */
export const COMPLETION_THRESHOLD = 0.95;

export function isComplete(current: number, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  return current / duration >= COMPLETION_THRESHOLD;
}

export interface SleepDeadline {
  /** "timed" pauses at `endsAt` epoch ms; "eot" pauses when the track ends. */
  kind: "timed" | "eot";
  endsAt: number | null;
}

/**
 * Resolve a sleep-timer selection to a deadline.
 * Returns null for "off" (or unknown ids, defensively).
 */
export function resolveSleepTimer(id: SleepTimerId, now: number): SleepDeadline | null {
  const option = SLEEP_TIMER_OPTIONS.find((o) => o.id === id);
  if (!option || option.id === "off") return null;
  if (option.minutes === null) return { kind: "eot", endsAt: null };
  return { kind: "timed", endsAt: now + option.minutes * 60_000 };
}

/** Remaining label for an active timed sleep deadline, e.g. "14:32 left". */
export function sleepRemainingLabel(endsAt: number, now: number): string {
  const remainingMs = Math.max(0, endsAt - now);
  return `${formatTime(Math.ceil(remainingMs / 1000))} left`;
}

/** Next track index with wraparound; null when the catalog is empty. */
export function nextIndex(current: number, catalogLength: number): number | null {
  if (catalogLength <= 0) return null;
  return (current + 1) % catalogLength;
}

/** Previous track index with wraparound; null when the catalog is empty. */
export function prevIndex(current: number, catalogLength: number): number | null {
  if (catalogLength <= 0) return null;
  return (current - 1 + catalogLength) % catalogLength;
}
