/**
 * Pure discovery filtering logic — no DOM access, unit-tested headless.
 *
 * Semantics: OR within a facet group, AND across groups. An empty group is
 * no constraint. This is the standard faceted-search mental model, so the
 * live count badge never surprises.
 */

import type {
  DurationTierId,
  FacetedStory,
  HeatIndex,
  TropeShelfId,
  AudioStyleId,
} from "./types.ts";

export interface FilterSelection {
  duration: ReadonlySet<DurationTierId>;
  tropes: ReadonlySet<TropeShelfId>;
  styles: ReadonlySet<AudioStyleId>;
  heat: ReadonlySet<HeatIndex>;
}

export function emptySelection(): FilterSelection {
  return {
    duration: new Set(),
    tropes: new Set(),
    styles: new Set(),
    heat: new Set(),
  };
}

/** Quick Hit <10 min · Standard 10–20 min (inclusive) · Deep Dive >20 min. */
export function deriveDurationTier(durationSec: number): DurationTierId {
  if (!Number.isFinite(durationSec) || durationSec < 600) return "quick";
  if (durationSec <= 1200) return "standard";
  return "deep";
}

/** Immutably toggle a member of a set. */
export function toggleInSet<T>(set: ReadonlySet<T>, id: T): ReadonlySet<T> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Total number of active facet chips across all groups. */
export function selectionActiveCount(selection: FilterSelection): number {
  return (
    selection.duration.size + selection.tropes.size + selection.styles.size + selection.heat.size
  );
}

export function matchesStory(story: FacetedStory, selection: FilterSelection): boolean {
  if (selection.duration.size > 0) {
    if (!selection.duration.has(deriveDurationTier(story.durationSec))) return false;
  }
  if (selection.tropes.size > 0) {
    if (!story.tropes.some((trope) => selection.tropes.has(trope))) return false;
  }
  if (selection.styles.size > 0) {
    if (!selection.styles.has(story.audioStyle)) return false;
  }
  if (selection.heat.size > 0) {
    if (!selection.heat.has(story.heatIndex)) return false;
  }
  return true;
}

export function filterStories<T extends FacetedStory>(
  stories: readonly T[],
  selection: FilterSelection,
): T[] {
  return stories.filter((story) => matchesStory(story, selection));
}

export function countMatches(stories: readonly FacetedStory[], selection: FilterSelection): number {
  return filterStories(stories, selection).length;
}

/**
 * Label lookup key for a facet chip, e.g. ("trope", "rivals") →
 * "discovery.trope.rivals". Kept here so the UI and the rail's active chips
 * can never drift apart.
 */
export function facetLabelKey(
  facet: "duration" | "trope" | "style",
  id: DurationTierId | TropeShelfId | AudioStyleId,
): string {
  return `discovery.${facet}.${id}`;
}
