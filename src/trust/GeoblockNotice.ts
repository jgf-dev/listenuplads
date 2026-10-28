/**
 * GeoblockNotice — Regulatory Geographic Restriction Notice for listenuplads
 * Dignified, transparent compliance screen when accessed from restricted jurisdictions.
 */

import { t } from "../i18n.ts";

export interface GeoblockOptions {
  supportUrl?: string;
  countryCode?: string;
  onSupportClick?: () => void;
}

export class GeoblockNotice {
  private container: HTMLElement | null = null;
  private options: Required<GeoblockOptions>;

  constructor(options: GeoblockOptions = {}) {
    this.options = {
      supportUrl: options.supportUrl || "mailto:support@listenuplads.com",
      countryCode: options.countryCode || "",
      onSupportClick: options.onSupportClick || (() => {}),
    };
  }

  /**
   * Mounts the full-screen geoblock compliance barrier.
   */
  public mount(target: HTMLElement = document.body): HTMLElement {
    const el = document.createElement("div");
    el.className = "listenuplads-geoblock";
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "assertive");

    const regionText = this.options.countryCode
      ? `(${this.options.countryCode.toUpperCase()})`
      : "";

    el.innerHTML = `
      <div class="geoblock-card">
        <div class="geoblock-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </div>
        <div class="geoblock-badge">${t("geoblock.badge")} ${regionText}</div>
        <h1 class="geoblock-title">${t("geoblock.title")}</h1>
        <p class="geoblock-body">${t("geoblock.body")}</p>
        <div class="geoblock-actions">
          <a href="${this.options.supportUrl}" class="geoblock-btn" id="geoblock-support-link">
            ${t("geoblock.support")}
          </a>
        </div>
        <p class="geoblock-footer">${t("geoblock.footer")}</p>
      </div>
    `;

    const supportLink = el.querySelector<HTMLAnchorElement>("#geoblock-support-link");
    supportLink?.addEventListener("click", () => {
      this.options.onSupportClick();
    });

    target.appendChild(el);
    this.container = el;
    return el;
  }

  /**
   * Removes the geoblock notice from the DOM.
   */
  public unmount(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
