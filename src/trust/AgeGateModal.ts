/**
 * AgeGateModal — 18+ Tier-1 self-declaration barrier for listenuplads.
 * Adheres to Nielsen Heuristics #5 & #8, Norman's Affordances, and Adult
 * Compliance Guardrails. Zero manipulative dark patterns; honest, transparent
 * entry gate. Tier-2 statutory verification lives in age-assurance.ts and
 * composes with this modal (it never replaces the gate silently).
 */

import { t } from "../i18n.ts";

export const AGE_GATE_STORAGE_KEY = "listenuplads_age_confirmed_v1";

export interface AgeGateOptions {
  storageKey?: string;
  exitUrl?: string;
  onConfirm?: () => void;
  onExit?: () => void;
}

export class AgeGateModal {
  private dialog: HTMLDialogElement | null = null;
  private options: Required<AgeGateOptions>;

  constructor(options: AgeGateOptions = {}) {
    this.options = {
      storageKey: options.storageKey || AGE_GATE_STORAGE_KEY,
      exitUrl: options.exitUrl || "https://google.com",
      onConfirm: options.onConfirm || (() => {}),
      onExit: options.onExit || (() => {}),
    };
  }

  /**
   * Checks whether the user has previously confirmed their age.
   */
  public isConfirmed(): boolean {
    try {
      return localStorage.getItem(this.options.storageKey) === "true";
    } catch {
      return false;
    }
  }

  /**
   * Mounts and displays the age-gate modal if not yet confirmed.
   * Returns true if already confirmed (no gate needed), or false if gate displayed.
   */
  public mountIfNeeded(container: HTMLElement = document.body): boolean {
    if (this.isConfirmed()) {
      return true;
    }
    this.mount(container);
    return false;
  }

  /**
   * Renders and opens the age-gate modal.
   */
  public mount(container: HTMLElement = document.body): HTMLDialogElement {
    if (this.dialog && container.contains(this.dialog)) {
      this.dialog.showModal();
      return this.dialog;
    }

    const dialog = document.createElement("dialog");
    dialog.className = "listenuplads-agegate";
    dialog.setAttribute("aria-labelledby", "agegate-heading");
    dialog.setAttribute("aria-describedby", "agegate-desc");

    dialog.innerHTML = `
      <div class="agegate-card">
        <div class="agegate-badge">${t("agegate.badge")}</div>
        <h2 id="agegate-heading" class="agegate-title">${t("agegate.title")}</h2>
        <p id="agegate-desc" class="agegate-body">${t("agegate.body")}</p>
        <div class="agegate-actions">
          <button type="button" class="agegate-btn agegate-btn-primary" id="agegate-confirm-btn">
            ${t("agegate.enter")}
          </button>
          <button type="button" class="agegate-btn agegate-btn-secondary" id="agegate-exit-btn">
            ${t("agegate.exit")}
          </button>
        </div>
        <p class="agegate-disclaimer">${t("agegate.disclaimer")}</p>
      </div>
    `;

    // Prevent default cancel on escape to maintain legal barrier
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.handleExit();
    });

    const confirmBtn = dialog.querySelector<HTMLButtonElement>("#agegate-confirm-btn");
    const exitBtn = dialog.querySelector<HTMLButtonElement>("#agegate-exit-btn");

    confirmBtn?.addEventListener("click", () => this.handleConfirm());
    exitBtn?.addEventListener("click", () => this.handleExit());

    container.appendChild(dialog);
    this.dialog = dialog;
    dialog.showModal();
    return dialog;
  }

  /**
   * Handles user age confirmation.
   */
  public handleConfirm(): void {
    try {
      localStorage.setItem(this.options.storageKey, "true");
    } catch {
      // Storage unavailable fallback
    }
    if (this.dialog) {
      this.dialog.close();
      this.dialog.remove();
      this.dialog = null;
    }
    this.options.onConfirm();
  }

  /**
   * Handles user exit.
   */
  public handleExit(): void {
    this.options.onExit();
    if (this.options.exitUrl) {
      window.location.href = this.options.exitUrl;
    }
  }

  /**
   * Resets confirmation state (useful for testing and settings).
   */
  public static reset(storageKey: string = AGE_GATE_STORAGE_KEY): void {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }
}
