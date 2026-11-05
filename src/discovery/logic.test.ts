import { describe, expect, it } from "vite-plus/test";
import {
  countMatches,
  deriveDurationTier,
  emptySelection,
  facetLabelKey,
  filterStories,
  matchesStory,
  selectionActiveCount,
  toggleInSet,
} from "./logic.ts";
import { AUDIO_STYLE_IDS, HEAT_INDEX_IDS, TROPE_SHELF_IDS, type FacetedStory } from "./types.ts";
import { CATALOG } from "../catalog.ts";

const story = (
  durationSec: number,
  tropes: FacetedStory["tropes"],
  audioStyle: FacetedStory["audioStyle"],
  heatIndex: FacetedStory["heatIndex"],
): FacetedStory => ({ durationSec, tropes, audioStyle, heatIndex });

const FIXTURE: FacetedStory[] = [
  story(300, ["rivals"], "raw", 5), // quick
  story(900, ["proximity", "protector"], "soundscape", 3), // standard
  story(1500, ["taboo"], "whisper", 4), // deep
  story(660, ["lockerRoom", "rivals"], "dualPov", 2), // standard
];

describe("deriveDurationTier", () => {
  it("boundaries: <600 quick, 600–1200 standard, >1200 deep", () => {
    expect(deriveDurationTier(0)).toBe("quick");
    expect(deriveDurationTier(599)).toBe("quick");
    expect(deriveDurationTier(600)).toBe("standard");
    expect(deriveDurationTier(1200)).toBe("standard");
    expect(deriveDurationTier(1201)).toBe("deep");
  });

  it("treats non-finite input as quick (safe default)", () => {
    expect(deriveDurationTier(Number.NaN)).toBe("quick");
    expect(deriveDurationTier(Number.POSITIVE_INFINITY)).toBe("quick");
  });
});

describe("toggleInSet", () => {
  it("adds and removes immutably", () => {
    const start: ReadonlySet<string> = new Set(["rivals"]);
    const added = toggleInSet(start, "taboo");
    expect([...added].sort()).toEqual(["rivals", "taboo"]);
    expect(start.has("taboo")).toBe(false); // original untouched

    const removed = toggleInSet(added, "rivals");
    expect([...removed]).toEqual(["taboo"]);
  });
});

describe("matchesStory / filterStories", () => {
  it("empty selection matches everything", () => {
    expect(filterStories(FIXTURE, emptySelection())).toHaveLength(FIXTURE.length);
    expect(countMatches(FIXTURE, emptySelection())).toBe(FIXTURE.length);
  });

  it("ORs within a facet group", () => {
    const sel = { ...emptySelection(), duration: new Set(["quick", "deep"] as const) };
    const hits = filterStories(FIXTURE, sel);
    expect(hits).toHaveLength(2);
    expect(hits.map((s) => s.durationSec).sort((a, b) => a - b)).toEqual([300, 1500]);
  });

  it("ANDs across facet groups", () => {
    const sel = {
      ...emptySelection(),
      duration: new Set(["standard"] as const),
      tropes: new Set(["rivals"] as const),
    };
    // standard ∩ rivals: only the 660s lockerRoom+rivals story
    const hits = filterStories(FIXTURE, sel);
    expect(hits).toHaveLength(1);
    expect(hits[0].durationSec).toBe(660);
  });

  it("matches a story when ANY of its tropes is selected", () => {
    const sel = { ...emptySelection(), tropes: new Set(["protector"] as const) };
    expect(matchesStory(FIXTURE[1], sel)).toBe(true);
    expect(matchesStory(FIXTURE[0], sel)).toBe(false);
  });

  it("filters by audio style and heat index", () => {
    const byStyle = { ...emptySelection(), styles: new Set(["whisper"] as const) };
    expect(filterStories(FIXTURE, byStyle)).toHaveLength(1);

    const byHeat = { ...emptySelection(), heat: new Set([5, 2] as const) };
    expect(countMatches(FIXTURE, byHeat)).toBe(2);
  });

  it("can narrow to zero — the empty state is a valid result", () => {
    const sel = {
      ...emptySelection(),
      duration: new Set(["quick"] as const),
      styles: new Set(["whisper"] as const),
    };
    expect(countMatches(FIXTURE, sel)).toBe(0);
  });
});

describe("selectionActiveCount", () => {
  it("counts chips across all four groups", () => {
    const sel = {
      duration: new Set(["quick"] as const),
      tropes: new Set(["rivals", "taboo"] as const),
      styles: new Set<FacetedStory["audioStyle"]>(),
      heat: new Set([3] as const),
    };
    expect(selectionActiveCount(sel)).toBe(4);
  });
});

describe("facetLabelKey", () => {
  it("builds stable i18n keys the rail and drawer share", () => {
    expect(facetLabelKey("duration", "quick")).toBe("discovery.duration.quick");
    expect(facetLabelKey("trope", "lockerRoom")).toBe("discovery.trope.lockerRoom");
    expect(facetLabelKey("style", "dualPov")).toBe("discovery.style.dualPov");
  });
});

describe("catalog contract", () => {
  it("every catalog story carries valid facet ids and heat 1–5", () => {
    for (const track of CATALOG) {
      expect(AUDIO_STYLE_IDS).toContain(track.audioStyle);
      expect(HEAT_INDEX_IDS).toContain(track.heatIndex);
      expect(track.tropes.length).toBeGreaterThan(0);
      for (const trope of track.tropes) {
        expect(TROPE_SHELF_IDS).toContain(trope);
      }
    }
  });

  it("every categorical facet option matches at least one catalog story (no dead chips)", () => {
    for (const id of TROPE_SHELF_IDS) {
      expect(countMatches(CATALOG, { ...emptySelection(), tropes: new Set([id]) })).toBeGreaterThan(
        0,
      );
    }
    for (const id of AUDIO_STYLE_IDS) {
      expect(countMatches(CATALOG, { ...emptySelection(), styles: new Set([id]) })).toBeGreaterThan(
        0,
      );
    }
    // Heat Index is a 1–5 scale, not a category: an empty level is a valid
    // catalog state, and the drawer's live count + empty state cover it.
  });
});
