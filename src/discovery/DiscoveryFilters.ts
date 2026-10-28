/**
 * DiscoveryFilters — 4-way cross-filtering discovery UX.
 *
 * Top floating pill rail (Filters button + removable active chips) plus an
 * expandable filter drawer (native <dialog>, bottom-sheet on mobile). Facets:
 * Duration Tier, Trope Shelf, Audio Style, Heat Index. The drawer's apply
 * action carries a live match count ("Show 14 Stories") that updates as
 * chips toggle; nothing filters until the listener applies.
 *
 * Lenses: token discipline (all values from --token-*), 44px touch targets,
 * state completeness (empty-result state lives on the shelf), WCAG AA.
 */

import { t, onLocaleChange } from "../i18n.ts";
import "./discovery.css";
import type { Track } from "../player/types.ts";
import {
  countMatches,
  emptySelection,
  facetLabelKey,
  filterStories,
  selectionActiveCount,
  toggleInSet,
  type FilterSelection,
} from "./logic.ts";
import {
  AUDIO_STYLE_IDS,
  DURATION_TIER_IDS,
  HEAT_INDEX_IDS,
  TROPE_SHELF_IDS,
  type AudioStyleId,
  type DurationTierId,
  type HeatIndex,
  type TropeShelfId,
} from "./types.ts";

const FLAME_PATH =
  "M12 2c1.5 3-1.5 4.5-1.5 7a3 3 0 0 0 6 .5C11.8 7.6 15 6.5 15 4c2 2 4 4.5 4 8a7 7 0 1 1-14 0c0-4 4.5-6.5 7-10z";

function flames(n: number): string {
  return Array.from(
    { length: n },
    () =>
      `<svg class="chip__ember" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${FLAME_PATH}"/></svg>`,
  ).join("");
}

export interface DiscoveryFiltersOptions {
  stories: Track[];
  onApply: (filtered: Track[], selection: FilterSelection) => void;
}

export class DiscoveryFilters {
  private readonly root: HTMLElement;
  private readonly stories: Track[];
  private readonly onApply: DiscoveryFiltersOptions["onApply"];

  private applied: FilterSelection = emptySelection();
  private draft: FilterSelection = emptySelection();
  private drawer: HTMLDialogElement | null = null;
  private readonly unsubscribeLocale: () => void;

  constructor(container: HTMLElement, options: DiscoveryFiltersOptions) {
    this.stories = options.stories;
    this.onApply = options.onApply;

    this.root = document.createElement("div");
    this.root.className = "discovery";
    container.appendChild(this.root);

    this.renderRail();
    this.unsubscribeLocale = onLocaleChange(() => this.refreshStrings());
  }

  /** Re-renders user-facing strings after a locale switch. */
  public refreshStrings(): void {
    this.renderRail();
    if (this.drawer?.open) this.renderDrawer();
  }

  // ------------------------------------------------------------------ rail

  private renderRail(): void {
    const active = selectionActiveCount(this.applied);
    const chips: string[] = [];

    for (const id of this.applied.duration) {
      chips.push(this.activeChip("duration", id, t(facetLabelKey("duration", id))));
    }
    for (const id of this.applied.tropes) {
      chips.push(this.activeChip("trope", id, t(facetLabelKey("trope", id))));
    }
    for (const id of this.applied.styles) {
      chips.push(this.activeChip("style", id, t(facetLabelKey("style", id))));
    }
    for (const n of this.applied.heat) {
      chips.push(
        this.activeChip(
          "heat",
          n,
          `${flames(n)}<span class="sr-only">${t("discovery.heatOption", n)}</span>`,
        ),
      );
    }

    this.root.innerHTML = `
      <div class="discovery__rail">
        <button type="button" class="discovery__filters-btn" data-open-drawer aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 6h16M7 12h10M10 18h4"/>
          </svg>
          <span>${t("discovery.filters")}</span>
          ${active > 0 ? `<span class="discovery__badge" aria-label="${active}">${active}</span>` : ""}
        </button>
        <div class="discovery__active" role="group" aria-label="${t("discovery.filters")}">
          ${chips.join("")}
        </div>
      </div>
    `;

    this.root
      .querySelector<HTMLButtonElement>("[data-open-drawer]")
      ?.addEventListener("click", () => this.openDrawer());
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-remove-facet]")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this.removeApplied(btn.dataset.removeFacet as string, btn.dataset.removeId as string),
        ),
      );
  }

  private activeChip(facet: string, id: string | number, labelHtml: string): string {
    const plain = labelHtml.replace(/<[^>]*>/g, "").trim();
    const aria = plain.length > 0 ? plain : t("discovery.heatOption", Number(id));
    return `
      <button type="button" class="discovery__chip discovery__chip--active"
              data-remove-facet="${facet}" data-remove-id="${id}"
              aria-label="${t("discovery.removeFilter", aria)}">
        ${labelHtml}
        <span class="discovery__chip-x" aria-hidden="true">×</span>
      </button>`;
  }

  // ---------------------------------------------------------------- drawer

  public openDrawer(): void {
    // Draft starts from the applied selection; cancel discards it.
    this.draft = {
      duration: new Set(this.applied.duration),
      tropes: new Set(this.applied.tropes),
      styles: new Set(this.applied.styles),
      heat: new Set(this.applied.heat),
    };

    if (!this.drawer) {
      this.drawer = document.createElement("dialog");
      this.drawer.className = "discovery__drawer";
      this.drawer.setAttribute("aria-labelledby", "discovery-drawer-title");
      this.drawer.addEventListener("cancel", () => this.closeDrawer());
      this.drawer.addEventListener("click", (e) => {
        if (e.target === this.drawer) this.closeDrawer();
      });
      document.body.appendChild(this.drawer);
    }

    this.renderDrawer();
    this.drawer.showModal();
  }

  public closeDrawer(): void {
    this.drawer?.close();
  }

  private renderDrawer(): void {
    if (!this.drawer) return;

    const group = (
      facet: "duration" | "trope" | "style",
      legend: string,
      ids: readonly (DurationTierId | TropeShelfId | AudioStyleId)[],
      selected: ReadonlySet<string>,
    ) => `
      <fieldset class="discovery__group">
        <legend class="discovery__legend">${legend}</legend>
        <div class="discovery__chips">
          ${ids
            .map((id) => {
              const on = selected.has(id);
              return `
                <button type="button" class="discovery__chip" data-facet="${facet}" data-id="${id}"
                        aria-pressed="${on}">
                  ${t(facetLabelKey(facet, id))}
                </button>`;
            })
            .join("")}
        </div>
      </fieldset>`;

    const heatGroup = `
      <fieldset class="discovery__group">
        <legend class="discovery__legend">${t("discovery.facetHeat")}</legend>
        <div class="discovery__chips">
          ${HEAT_INDEX_IDS.map((n) => {
            const on = this.draft.heat.has(n);
            return `
              <button type="button" class="discovery__chip discovery__chip--heat"
                      data-facet="heat" data-id="${n}" aria-pressed="${on}"
                      aria-label="${t("discovery.heatOption", n)}">
                ${flames(n)}
              </button>`;
          }).join("")}
        </div>
      </fieldset>`;

    const matches = countMatches(this.stories, this.draft);

    this.drawer.innerHTML = `
      <div class="discovery__sheet" role="document">
        <header class="discovery__sheet-head">
          <div>
            <h2 class="discovery__title" id="discovery-drawer-title">${t("discovery.drawerTitle")}</h2>
            <p class="discovery__sub">${t("discovery.drawerSub")}</p>
          </div>
          <button type="button" class="discovery__close" data-close aria-label="${t("checkout.close")}">×</button>
        </header>

        <div class="discovery__groups">
          ${group("duration", t("discovery.facetDuration"), DURATION_TIER_IDS, this.draft.duration)}
          ${group("trope", t("discovery.facetTrope"), TROPE_SHELF_IDS, this.draft.tropes)}
          ${group("style", t("discovery.facetStyle"), AUDIO_STYLE_IDS, this.draft.styles)}
          ${heatGroup}
        </div>

        <footer class="discovery__sheet-foot">
          <button type="button" class="discovery__clear" data-clear>${t("discovery.clearAll")}</button>
          <button type="button" class="discovery__apply" data-apply>
            ${t("discovery.showStories", matches)}
          </button>
        </footer>
      </div>
    `;

    this.drawer
      .querySelectorAll<HTMLButtonElement>("[data-facet]")
      .forEach((btn) =>
        btn.addEventListener("click", () =>
          this.toggleDraft(btn.dataset.facet as string, btn.dataset.id as string),
        ),
      );
    this.drawer
      .querySelector<HTMLButtonElement>("[data-close]")
      ?.addEventListener("click", () => this.closeDrawer());
    this.drawer.querySelector<HTMLButtonElement>("[data-clear]")?.addEventListener("click", () => {
      this.draft = emptySelection();
      this.renderDrawer();
    });
    this.drawer
      .querySelector<HTMLButtonElement>("[data-apply]")
      ?.addEventListener("click", () => this.apply());
  }

  private toggleDraft(facet: string, id: string): void {
    switch (facet) {
      case "duration":
        this.draft = {
          ...this.draft,
          duration: toggleInSet(this.draft.duration, id as DurationTierId),
        };
        break;
      case "trope":
        this.draft = { ...this.draft, tropes: toggleInSet(this.draft.tropes, id as TropeShelfId) };
        break;
      case "style":
        this.draft = { ...this.draft, styles: toggleInSet(this.draft.styles, id as AudioStyleId) };
        break;
      case "heat":
        this.draft = { ...this.draft, heat: toggleInSet(this.draft.heat, Number(id) as HeatIndex) };
        break;
    }
    // Live count badge: re-render so the apply action always names its result.
    this.renderDrawer();
    const pressed = this.drawer?.querySelector<HTMLButtonElement>(
      `[data-facet="${facet}"][data-id="${id}"]`,
    );
    pressed?.focus();
  }

  private apply(): void {
    this.applied = this.draft;
    this.renderRail();
    this.onApply(filterStories(this.stories, this.applied), this.applied);
    this.closeDrawer();
  }

  private removeApplied(facet: string, id: string): void {
    this.toggleAppliedDirect(facet, id);
    this.renderRail();
    this.onApply(filterStories(this.stories, this.applied), this.applied);
  }

  private toggleAppliedDirect(facet: string, id: string): void {
    switch (facet) {
      case "duration":
        this.applied = {
          ...this.applied,
          duration: toggleInSet(this.applied.duration, id as DurationTierId),
        };
        break;
      case "trope":
        this.applied = {
          ...this.applied,
          tropes: toggleInSet(this.applied.tropes, id as TropeShelfId),
        };
        break;
      case "style":
        this.applied = {
          ...this.applied,
          styles: toggleInSet(this.applied.styles, id as AudioStyleId),
        };
        break;
      case "heat":
        this.applied = {
          ...this.applied,
          heat: toggleInSet(this.applied.heat, Number(id) as HeatIndex),
        };
        break;
    }
  }

  public destroy(): void {
    this.unsubscribeLocale();
    this.drawer?.remove();
    this.root.remove();
  }
}
