/**
 * Discovery facet types — the 4-way cross-filter vocabulary for the catalog.
 * Facet ids are stable keys; display labels come from i18n (discovery.*).
 */

export type DurationTierId = "quick" | "standard" | "deep";

export type TropeShelfId = "rivals" | "proximity" | "lockerRoom" | "protector" | "taboo";

export type AudioStyleId = "soundscape" | "whisper" | "dualPov" | "raw";

export type HeatIndex = 1 | 2 | 3 | 4 | 5;

/** Facet metadata carried by every catalog story. */
export interface StoryFacets {
  tropes: TropeShelfId[];
  audioStyle: AudioStyleId;
  heatIndex: HeatIndex;
}

/** The shape the filter engine needs — Track extends this. */
export interface FacetedStory extends StoryFacets {
  durationSec: number;
}

export const DURATION_TIER_IDS: readonly DurationTierId[] = ["quick", "standard", "deep"];
export const TROPE_SHELF_IDS: readonly TropeShelfId[] = [
  "rivals",
  "proximity",
  "lockerRoom",
  "protector",
  "taboo",
];
export const AUDIO_STYLE_IDS: readonly AudioStyleId[] = ["soundscape", "whisper", "dualPov", "raw"];
export const HEAT_INDEX_IDS: readonly HeatIndex[] = [1, 2, 3, 4, 5];
