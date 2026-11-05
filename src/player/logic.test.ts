import { describe, expect, it } from "vite-plus/test";
import {
  clampTime,
  COMPLETION_THRESHOLD,
  formatTime,
  isComplete,
  nextIndex,
  prevIndex,
  progressPct,
  resolveSleepTimer,
  skipBy,
  sleepRemainingLabel,
} from "./logic.ts";
import { PLAYBACK_SPEEDS, SLEEP_TIMER_OPTIONS } from "./types.ts";

describe("formatTime", () => {
  it("formats minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(61)).toBe("1:01");
    expect(formatTime(85.08)).toBe("1:25");
    expect(formatTime(599)).toBe("9:59");
  });

  it("formats hours when past 60 minutes", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3661)).toBe("1:01:01");
  });

  it("clamps invalid input to 0:00", () => {
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});

describe("clampTime / skipBy", () => {
  it("clamps into [0, duration]", () => {
    expect(clampTime(30, 60)).toBe(30);
    expect(clampTime(-1, 60)).toBe(0);
    expect(clampTime(90, 60)).toBe(60);
    expect(clampTime(10, 0)).toBe(0);
  });

  it("skips ±15s and clamps at both ends", () => {
    expect(skipBy(30, 1, 60)).toBe(45);
    expect(skipBy(30, -1, 60)).toBe(15);
    expect(skipBy(5, -1, 60)).toBe(0);
    expect(skipBy(55, 1, 60)).toBe(60);
  });

  it("honours a custom MediaSession seek offset", () => {
    expect(skipBy(30, 1, 120, 30)).toBe(60);
  });
});

describe("progressPct / isComplete", () => {
  it("computes a clamped percentage", () => {
    expect(progressPct(30, 60)).toBe(50);
    expect(progressPct(120, 60)).toBe(100);
    expect(progressPct(10, 0)).toBe(0);
  });

  it("treats >=95% as complete (not a drop)", () => {
    expect(isComplete(60, 60)).toBe(true);
    expect(isComplete(60 * COMPLETION_THRESHOLD, 60)).toBe(true);
    expect(isComplete(50, 60)).toBe(false);
    expect(isComplete(10, 0)).toBe(false);
  });
});

describe("resolveSleepTimer", () => {
  const now = 1_000_000;

  it("resolves minute options to absolute deadlines", () => {
    expect(resolveSleepTimer("m15", now)).toEqual({ kind: "timed", endsAt: now + 15 * 60_000 });
    expect(resolveSleepTimer("m30", now)).toEqual({ kind: "timed", endsAt: now + 30 * 60_000 });
    expect(resolveSleepTimer("m45", now)).toEqual({ kind: "timed", endsAt: now + 45 * 60_000 });
  });

  it("resolves end-of-track and off", () => {
    expect(resolveSleepTimer("eot", now)).toEqual({ kind: "eot", endsAt: null });
    expect(resolveSleepTimer("off", now)).toBeNull();
  });

  it("labels remaining time", () => {
    const endsAt = now + 15 * 60_000;
    expect(sleepRemainingLabel(endsAt, now)).toBe("15:00 left");
    expect(sleepRemainingLabel(endsAt, endsAt + 5000)).toBe("0:00 left");
  });
});

describe("catalog navigation", () => {
  it("wraps next/previous and guards empty catalogs", () => {
    expect(nextIndex(0, 5)).toBe(1);
    expect(nextIndex(4, 5)).toBe(0);
    expect(prevIndex(0, 5)).toBe(4);
    expect(prevIndex(2, 5)).toBe(1);
    expect(nextIndex(0, 0)).toBeNull();
    expect(prevIndex(0, 0)).toBeNull();
  });
});

describe("constants match the spec", () => {
  it("offers exactly 1.0x / 1.25x / 1.5x / 2.0x", () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([1, 1.25, 1.5, 2]);
  });

  it("offers off / 15m / 30m / 45m / end of track", () => {
    expect(SLEEP_TIMER_OPTIONS.map((o) => o.id)).toEqual(["off", "m15", "m30", "m45", "eot"]);
  });
});
