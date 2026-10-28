import { describe, expect, it } from "vite-plus/test";
import { CROSSFADE_MS, canAftercare, crossfadeGains, resolveToggle } from "./aftercare.ts";
import type { Track } from "./types.ts";

function makeTrack(aftercare: Track["aftercare"]): Track {
  return {
    id: "s1",
    title: "Story",
    series: "Pilot Season",
    trope: "Trope",
    durationSec: 600,
    src: "/audio/a.mp3",
    cover: "/covers/a.svg",
    tropes: ["rivals"],
    audioStyle: "raw",
    heatIndex: 4,
    aftercare,
  };
}

const paired = makeTrack({ src: "/audio/aftercare/a.mp3", title: "Aftercare — Story" });
const unpaired = makeTrack(null);

describe("canAftercare", () => {
  it("true only when a pairing with a non-empty src exists", () => {
    expect(canAftercare(paired)).toBe(true);
    expect(canAftercare(unpaired)).toBe(false);
    expect(canAftercare(null)).toBe(false);
    expect(canAftercare(undefined)).toBe(false);
    expect(canAftercare({ ...paired, aftercare: { src: "", title: "x" } })).toBe(false);
  });
});

describe("resolveToggle", () => {
  it("crossfades story → aftercare → story when paired", () => {
    const first = resolveToggle(paired, "story");
    expect(first).toEqual({ mode: "aftercare", changed: true, reason: "toggled" });
    const second = resolveToggle(paired, "aftercare");
    expect(second).toEqual({ mode: "story", changed: true, reason: "toggled" });
  });

  it("unpaired stories stay on the story and report why (disabled + tooltip, never hidden)", () => {
    expect(resolveToggle(unpaired, "story")).toEqual({
      mode: "story",
      changed: false,
      reason: "unpaired",
    });
    expect(resolveToggle(null, "story")).toEqual({
      mode: "story",
      changed: false,
      reason: "unpaired",
    });
    // Defensive: an unpaired track can never end up in aftercare mode.
    expect(resolveToggle(unpaired, "aftercare").mode).toBe("story");
  });
});

describe("crossfadeGains (equal-power)", () => {
  it("starts fully on the outgoing stem, ends fully on the incoming stem", () => {
    expect(crossfadeGains(0).fadeOut).toBeCloseTo(1, 6);
    expect(crossfadeGains(0).fadeIn).toBeCloseTo(0, 6);
    expect(crossfadeGains(1).fadeOut).toBeCloseTo(0, 6);
    expect(crossfadeGains(1).fadeIn).toBeCloseTo(1, 6);
  });

  it("keeps constant power through the fade (cos² + sin² = 1)", () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const { fadeOut, fadeIn } = crossfadeGains(t);
      expect(fadeOut ** 2 + fadeIn ** 2).toBeCloseTo(1, 6);
    }
  });

  it("clamps out-of-range and non-finite input", () => {
    expect(crossfadeGains(-1)).toEqual(crossfadeGains(0));
    expect(crossfadeGains(2)).toEqual(crossfadeGains(1));
    expect(crossfadeGains(Number.NaN)).toEqual(crossfadeGains(0));
  });
});

describe("CROSSFADE_MS", () => {
  it("sits inside the 250–400ms spec band (shared ease tokens)", () => {
    expect(CROSSFADE_MS).toBeGreaterThanOrEqual(250);
    expect(CROSSFADE_MS).toBeLessThanOrEqual(400);
  });
});
