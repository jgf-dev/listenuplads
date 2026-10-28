/**
 * AudioPlayer — the Listen Up Lads story player surface.
 *
 * Framework-free (matches the repo's vanilla TS starter). One instance renders
 * the full player: cover + metadata, scrubber with elapsed/remaining, ±15s
 * transport, speed control, sleep timer, the Aftercare/Warmth dual-state
 * toggle, and the (filterable) story shelf. MediaSession and PostHog telemetry
 * are wired in; both degrade gracefully when unavailable.
 *
 * Aftercare (JGF-129): stories carry an optional `aftercare` pairing. The
 * toggle crossfades the main track into the paired stem (equal-power gains,
 * 400ms, shared ease tokens) while the UI accent crossfades lavender → amber
 * via the registered --token-accent-dynamic custom property. Unpaired stories
 * render the toggle disabled with an explaining tooltip — never hidden.
 */

import {
  CROSSFADE_MS,
  canAftercare,
  resolveToggle,
  crossfadeGains,
  type PlayerMode,
} from "./aftercare.ts";
import {
  clampTime,
  formatTime,
  isComplete,
  nextIndex,
  prevIndex,
  progressPct,
  resolveSleepTimer,
  skipBy,
  sleepRemainingLabel,
  type SleepDeadline,
} from "./logic.ts";
import {
  clearMediaSession,
  setHandlers,
  setMetadata,
  setPlaybackState,
  setPositionState,
} from "./media-session.ts";
import { telemetry } from "./telemetry.ts";
import {
  PLAYBACK_SPEEDS,
  SLEEP_TIMER_OPTIONS,
  type DropReason,
  type PlaybackSpeed,
  type SleepTimerId,
  type Track,
} from "./types.ts";
import { t, onLocaleChange } from "../i18n.ts";
import "./player.css";

const ICONS = {
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  replay:
    "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
  flame:
    "M12 2c1.5 3-1.5 4.5-1.5 7a3 3 0 0 0 6 .5C11.8 7.6 15 6.5 15 4c2 2 4 4.5 4 8a7 7 0 1 1-14 0c0-4 4.5-6.5 7-10z",
};

function icon(path: string, className: string): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export interface AudioPlayerOptions {
  catalog: Track[];
}

/** Status lines are stored as i18n keys so locale switches re-render them. */
interface StatusRef {
  key: string;
  args: (string | number)[];
}

export class AudioPlayer {
  private readonly root: HTMLElement;
  private catalog: Track[];
  private readonly audio: HTMLAudioElement;
  private afterAudio: HTMLAudioElement | null = null;

  private currentIndex = 0;
  private mode: PlayerMode = "story";
  private speed: PlaybackSpeed = 1;
  private scrubbing = false;
  private sleepId: SleepTimerId = "off";
  private sleepDeadline: SleepDeadline | null = null;
  private sleepTimeout: ReturnType<typeof setTimeout> | null = null;
  private sleepTick: ReturnType<typeof setInterval> | null = null;
  private fadeFrame: ReturnType<typeof requestAnimationFrame> | null = null;
  private destroyed = false;
  private lastStatus: StatusRef | null = null;
  private readonly unsubscribeLocale: () => void;

  // Element handles (queried once after render)
  private els!: {
    cover: HTMLImageElement;
    series: HTMLElement;
    title: HTMLElement;
    trope: HTMLElement;
    scrubber: HTMLInputElement;
    elapsed: HTMLElement;
    remaining: HTMLElement;
    playBtn: HTMLButtonElement;
    playIcon: SVGElement;
    status: HTMLElement;
    sleepStatus: HTMLElement;
    speedBtns: HTMLButtonElement[];
    sleepBtns: HTMLButtonElement[];
    queue: HTMLOListElement;
    aftercareBtn: HTMLButtonElement;
    aftercareLabel: HTMLElement;
    aftercareTip: HTMLElement;
  };

  constructor(container: HTMLElement, { catalog }: AudioPlayerOptions) {
    this.catalog = catalog;
    this.root = document.createElement("section");
    this.root.className = "player";
    this.root.setAttribute("aria-label", "Story player");
    this.root.dataset.mode = this.mode;
    container.appendChild(this.root);

    this.audio = new Audio();
    this.audio.preload = "metadata";

    this.render();
    this.bind();
    if (this.catalog.length > 0) this.loadTrack(0);
    this.unsubscribeLocale = onLocaleChange(() => this.refreshStrings());
  }

  // ------------------------------------------------------------------ render

  private render(): void {
    const speedButtons = PLAYBACK_SPEEDS.map(
      (s) => `
        <button type="button" class="player__chip" data-speed="${s}" aria-pressed="${s === this.speed}">
          ${s.toFixed(2).replace(/\.?0+$/, "")}x
        </button>`,
    ).join("");

    const sleepButtons = SLEEP_TIMER_OPTIONS.map(
      (o) => `
        <button type="button" class="player__chip" data-sleep="${o.id}" aria-pressed="${o.id === "off"}">
          ${this.sleepLabel(o.id)}
        </button>`,
    ).join("");

    this.root.innerHTML = `
      <div class="player__card">
        <div class="player__cover-wrap">
          <img class="player__cover" alt="" width="96" height="96" />
        </div>
        <div class="player__meta">
          <p class="player__series"></p>
          <h1 class="player__title"></h1>
          <p class="player__trope"></p>
        </div>
      </div>

      <div class="player__scrubber">
        <span class="player__time player__time--elapsed">0:00</span>
        <input class="player__range" type="range" min="0" max="0" step="0.1" value="0"
               aria-label="${t("player.seekAria")}" />
        <span class="player__time player__time--remaining">-0:00</span>
      </div>

      <div class="player__transport">
        <button type="button" class="player__transport-btn" data-action="back" aria-label="${t("player.back15")}">
          ${icon(ICONS.replay, "player__transport-icon player__transport-icon--flip")}
          <span class="player__transport-num" aria-hidden="true">15</span>
        </button>
        <button type="button" class="player__transport-btn player__transport-btn--play" data-action="play"
                aria-label="${t("player.play")}">
          ${icon(ICONS.play, "player__transport-icon")}
        </button>
        <button type="button" class="player__transport-btn" data-action="fwd" aria-label="${t("player.fwd15")}">
          ${icon(ICONS.replay, "player__transport-icon")}
          <span class="player__transport-num" aria-hidden="true">15</span>
        </button>
      </div>

      <div class="player__aftercare">
        <button type="button" class="player__aftercare-btn" data-action="aftercare"
                aria-pressed="false" aria-describedby="player-aftercare-tip">
          ${icon(ICONS.flame, "player__aftercare-icon")}
          <span class="player__aftercare-label"></span>
        </button>
        <p class="player__aftercare-tip" role="tooltip" id="player-aftercare-tip"></p>
      </div>

      <div class="player__controls">
        <div class="player__group">
          <span class="player__group-label" id="speed-label">${t("player.speed")}</span>
          <div class="player__chips" role="group" aria-labelledby="speed-label">${speedButtons}</div>
        </div>
        <div class="player__group">
          <span class="player__group-label" id="sleep-label">${t("player.sleepTimer")}</span>
          <div class="player__chips" role="group" aria-labelledby="sleep-label">${sleepButtons}</div>
          <p class="player__sleep-status" aria-live="polite"></p>
        </div>
      </div>

      <p class="player__status" role="status" aria-live="polite"></p>

      <div class="player__queue-section">
        <h2 class="player__queue-heading">${t("player.stories")}</h2>
        <ol class="player__queue"></ol>
      </div>
    `;

    const q = <T extends Element>(sel: string): T => {
      const el = this.root.querySelector<T>(sel);
      if (!el) throw new Error(`player template missing ${sel}`);
      return el;
    };

    this.els = {
      cover: q<HTMLImageElement>(".player__cover"),
      series: q<HTMLElement>(".player__series"),
      title: q<HTMLElement>(".player__title"),
      trope: q<HTMLElement>(".player__trope"),
      scrubber: q<HTMLInputElement>(".player__range"),
      elapsed: q<HTMLElement>(".player__time--elapsed"),
      remaining: q<HTMLElement>(".player__time--remaining"),
      playBtn: q<HTMLButtonElement>('[data-action="play"]'),
      playIcon: q<SVGElement>('[data-action="play"] svg'),
      status: q<HTMLElement>(".player__status"),
      sleepStatus: q<HTMLElement>(".player__sleep-status"),
      speedBtns: Array.from(this.root.querySelectorAll<HTMLButtonElement>("[data-speed]")),
      sleepBtns: Array.from(this.root.querySelectorAll<HTMLButtonElement>("[data-sleep]")),
      queue: q<HTMLOListElement>(".player__queue"),
      aftercareBtn: q<HTMLButtonElement>('[data-action="aftercare"]'),
      aftercareLabel: q<HTMLElement>(".player__aftercare-label"),
      aftercareTip: q<HTMLElement>(".player__aftercare-tip"),
    };

    this.renderQueue();
  }

  /** The story shelf — re-rendered when discovery filters apply. */
  private renderQueue(): void {
    if (this.catalog.length === 0) {
      this.els.queue.innerHTML = `
        <li class="player__queue-empty">${t("discovery.noMatches")}</li>`;
      return;
    }

    this.els.queue.innerHTML = this.catalog
      .map(
        (track, i) => `
        <li class="player__queue-item" data-index="${i}">
          <button type="button" class="player__queue-button" data-queue-play="${i}"
                  aria-label="${escapeHtml(t("player.playTrack", track.title))}">
            <span class="player__queue-play">${icon(ICONS.play, "player__queue-icon")}</span>
            <span class="player__queue-text">
              <span class="player__queue-title">${escapeHtml(track.title)}</span>
              <span class="player__queue-sub">${escapeHtml(track.trope)} · ${formatTime(track.durationSec)}</span>
            </span>
          </button>
        </li>`,
      )
      .join("");

    this.els.queue.querySelectorAll<HTMLButtonElement>("[data-queue-play]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.queuePlay);
        if (index === this.currentIndex) this.togglePlay();
        else this.selectTrack(index, { autoplay: true, reason: "queue" });
      }),
    );

    this.syncQueueIcons();
  }

  // -------------------------------------------------------------------- bind

  private bind(): void {
    q(this.root, '[data-action="play"]').addEventListener("click", () => this.togglePlay());
    q(this.root, '[data-action="back"]').addEventListener("click", () => this.seekBy(-1));
    q(this.root, '[data-action="fwd"]').addEventListener("click", () => this.seekBy(1));
    q(this.root, '[data-action="aftercare"]').addEventListener("click", () =>
      this.toggleAftercare(),
    );

    this.els.scrubber.addEventListener("input", () => {
      this.scrubbing = true;
      const time = Number(this.els.scrubber.value);
      this.els.elapsed.textContent = formatTime(time);
      this.els.remaining.textContent = `-${formatTime(this.duration() - time)}`;
      this.updateScrubberFill(time);
    });
    this.els.scrubber.addEventListener("change", () => {
      this.activeAudio().currentTime = clampTime(Number(this.els.scrubber.value), this.duration());
      this.scrubbing = false;
    });

    this.els.speedBtns.forEach((btn) =>
      btn.addEventListener("click", () =>
        this.setSpeed(Number(btn.dataset.speed) as PlaybackSpeed),
      ),
    );
    this.els.sleepBtns.forEach((btn) =>
      btn.addEventListener("click", () => this.setSleepTimer(btn.dataset.sleep as SleepTimerId)),
    );

    for (const el of [this.audio]) this.bindAudioEvents(el);

    window.addEventListener("pagehide", this.onPageHide);

    setHandlers({
      onPlay: () => void this.activeAudio().play(),
      onPause: () => this.activeAudio().pause(),
      onSeekBy: (delta) => this.seekBy(delta >= 0 ? 1 : -1, Math.abs(delta)),
      onSeekTo: (time) => {
        this.activeAudio().currentTime = clampTime(time, this.duration());
      },
      onNext: () => this.stepTrack(1),
      onPrevious: () => this.stepTrack(-1),
    });
  }

  private bindAudioEvents(el: HTMLAudioElement): void {
    el.addEventListener("play", () => this.onPlay());
    el.addEventListener("pause", () => this.onPause());
    el.addEventListener("ended", () => this.onEnded(el));
    el.addEventListener("timeupdate", () => this.onTimeUpdate());
    el.addEventListener("loadedmetadata", () => this.onTimeUpdate());
    el.addEventListener("waiting", () => this.setStatusKey("player.buffering"));
    el.addEventListener("canplay", () => this.setStatusKey(""));
    el.addEventListener("error", () => this.onAudioError(el));
  }

  // ------------------------------------------------------------- track state

  private track(): Track | null {
    return this.catalog[this.currentIndex] ?? null;
  }

  /** The element currently addressed by transport/scrubber for this mode. */
  private activeAudio(): HTMLAudioElement {
    return this.mode === "aftercare" && this.afterAudio ? this.afterAudio : this.audio;
  }

  private duration(): number {
    const active = this.activeAudio();
    if (Number.isFinite(active.duration) && active.duration > 0) return active.duration;
    return this.mode === "story" ? (this.track()?.durationSec ?? 0) : 0;
  }

  private loadTrack(index: number): void {
    this.currentIndex = index;
    const track = this.track();
    if (!track) return;

    this.els.cover.src = track.cover;
    this.els.series.textContent = track.series;
    this.els.title.textContent = track.title;
    this.els.trope.textContent = track.trope;

    // A new story always starts in story mode; the pairing governs the toggle.
    this.setMode("story");
    if (this.afterAudio) {
      this.afterAudio.pause();
      this.afterAudio.removeAttribute("src");
    }

    this.audio.src = track.src;
    this.audio.playbackRate = this.speed;

    this.els.scrubber.max = String(track.durationSec);
    this.els.scrubber.value = "0";
    this.els.elapsed.textContent = "0:00";
    this.els.remaining.textContent = `-${formatTime(track.durationSec)}`;
    this.updateScrubberFill(0);

    this.syncAftercareToggle();
    this.syncQueueIcons();
    this.syncQueueActive();

    setMetadata(track);
    this.setStatusKey("player.loading");
  }

  private selectTrack(
    index: number,
    { autoplay, reason }: { autoplay: boolean; reason: "queue" | "step" },
  ): void {
    const from = this.track();
    const active = this.activeAudio();
    if (from && !active.paused && !isComplete(active.currentTime, this.duration())) {
      this.reportDrop(from, "track_switch");
    }
    this.loadTrack(index);
    if (autoplay) {
      void this.audio.play().catch(() => {
        this.setStatusKey("player.tapToPlay");
      });
    } else {
      this.setStatusKey("");
    }
    if (reason === "step") this.els.playBtn.focus();
  }

  private stepTrack(direction: 1 | -1): void {
    const target =
      direction === 1
        ? nextIndex(this.currentIndex, this.catalog.length)
        : prevIndex(this.currentIndex, this.catalog.length);
    if (target === null) return;
    this.selectTrack(target, { autoplay: !this.activeAudio().paused, reason: "step" });
  }

  /**
   * Replace the shelf contents (discovery filters). The current track keeps
   * playing when it survives the filter; otherwise playback pauses and the
   * first match loads (no autoplay — applying a filter is not a play intent).
   */
  public setCatalog(catalog: Track[]): void {
    const current = this.track();
    this.catalog = catalog;

    if (current) {
      const surviving = catalog.findIndex((t) => t.id === current.id);
      if (surviving >= 0) {
        this.currentIndex = surviving;
        this.renderQueue();
        return;
      }
    }

    this.activeAudio().pause();
    this.renderQueue();
    if (catalog.length > 0) {
      this.loadTrack(0);
      this.setStatusKey("");
    }
  }

  // --------------------------------------------------------------- transport

  private togglePlay(): void {
    const active = this.activeAudio();
    if (active.paused) void active.play();
    else active.pause();
  }

  private seekBy(direction: 1 | -1, step = 15): void {
    const active = this.activeAudio();
    active.currentTime = skipBy(active.currentTime, direction, this.duration(), step);
  }

  private setSpeed(speed: PlaybackSpeed): void {
    if (this.speed === speed) return;
    this.speed = speed;
    this.audio.playbackRate = speed;
    if (this.afterAudio) this.afterAudio.playbackRate = speed;
    this.els.speedBtns.forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === speed)),
    );
    const track = this.track();
    if (track) telemetry.capture("playback_speed_change", { track_id: track.id, speed });
  }

  // ---------------------------------------------------- aftercare / warmth

  private ensureAfterAudio(): HTMLAudioElement {
    if (!this.afterAudio) {
      this.afterAudio = new Audio();
      this.afterAudio.preload = "auto";
      this.afterAudio.playbackRate = this.speed;
      this.bindAudioEvents(this.afterAudio);
    }
    return this.afterAudio;
  }

  private toggleAftercare(): void {
    const track = this.track();
    const result = resolveToggle(track, this.mode);
    if (!result.changed) return; // unpaired — button is disabled; guard anyway
    if (!track?.aftercare) return;

    const pairing = track.aftercare;
    const target: PlayerMode = result.mode;

    telemetry.capture("aftercare_toggle", {
      track_id: track.id,
      to_mode: target,
      position_sec: Math.round(this.activeAudio().currentTime),
    });

    if (target === "aftercare") {
      const stem = this.ensureAfterAudio();
      if (stem.src !== new URL(pairing.src, window.location.href).href) {
        stem.src = pairing.src;
      }
      this.setMode("aftercare");
      const wasPlaying = !this.audio.paused;
      if (wasPlaying) {
        stem.currentTime = 0;
        stem.volume = 0; // fade starts from silence — no full-volume blip
        void stem
          .play()
          .then(() => this.crossfade(this.audio, stem))
          .then(() => this.setStatusKey("player.aftercarePlaying"))
          .catch(() => {
            // Autoplay blocked: keep the mode switch, start on next tap.
            this.audio.pause();
            this.audio.volume = 1;
            stem.volume = 1;
            this.setStatusKey("player.tapToPlay");
          });
      } else {
        this.setStatusKey("");
      }
    } else {
      this.setMode("story");
      if (this.afterAudio && !this.afterAudio.paused) {
        this.audio.volume = 0; // story fades back in from silence
        void this.audio
          .play()
          .then(() => this.crossfade(this.afterAudio as HTMLAudioElement, this.audio))
          .then(() => this.setStatusKey(""))
          .catch(() => {
            this.afterAudio?.pause();
            if (this.afterAudio) this.afterAudio.volume = 1;
            this.audio.volume = 1;
          });
      } else {
        this.setStatusKey("");
      }
    }
  }

  /** Equal-power volume crossfade; instant when reduced motion is preferred. */
  private crossfade(fadeOutEl: HTMLAudioElement, fadeInEl: HTMLAudioElement): void {
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      fadeOutEl.pause();
      fadeOutEl.volume = 1;
      fadeInEl.volume = 1;
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      if (this.destroyed) return;
      const { fadeOut, fadeIn } = crossfadeGains((now - start) / CROSSFADE_MS);
      fadeOutEl.volume = fadeOut;
      fadeInEl.volume = fadeIn;
      if (now - start < CROSSFADE_MS) {
        this.fadeFrame = requestAnimationFrame(step);
      } else {
        fadeOutEl.pause();
        fadeOutEl.volume = 1;
        fadeInEl.volume = 1;
        this.fadeFrame = null;
      }
    };
    this.fadeFrame = requestAnimationFrame(step);
  }

  private setMode(mode: PlayerMode): void {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.syncAftercareToggle();
    const track = this.track();
    if (track) {
      setMetadata(
        mode === "aftercare" && track.aftercare
          ? { ...track, title: track.aftercare.title }
          : track,
      );
    }
    this.onTimeUpdate();
  }

  /** Toggle availability + label + tooltip follow the story's pairing metadata. */
  private syncAftercareToggle(): void {
    const track = this.track();
    const available = canAftercare(track);
    const inAftercare = this.mode === "aftercare";

    this.els.aftercareBtn.setAttribute("aria-pressed", String(inAftercare));
    this.els.aftercareBtn.toggleAttribute("data-unavailable", !available);
    if (available) {
      this.els.aftercareBtn.removeAttribute("aria-disabled");
    } else {
      // aria-disabled (not disabled) keeps the control focusable so the
      // explaining tooltip stays reachable by keyboard and screen reader.
      this.els.aftercareBtn.setAttribute("aria-disabled", "true");
    }
    this.els.aftercareLabel.textContent = inAftercare
      ? t("player.aftercareToStory")
      : t("player.aftercareToWarmth");
    this.els.aftercareTip.textContent = available
      ? t("player.aftercareHint")
      : t("player.aftercareUnavailable");
  }

  // ------------------------------------------------------------- sleep timer

  private setSleepTimer(id: SleepTimerId): void {
    this.clearSleepTimers();
    this.sleepId = id;
    this.els.sleepBtns.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.sleep === id)),
    );

    const track = this.track();
    this.sleepDeadline = resolveSleepTimer(id, Date.now());
    if (!this.sleepDeadline) {
      this.els.sleepStatus.textContent = "";
      return;
    }
    if (track) telemetry.capture("sleep_timer_set", { track_id: track.id, option: id });

    if (this.sleepDeadline.kind === "timed" && this.sleepDeadline.endsAt !== null) {
      const endsAt = this.sleepDeadline.endsAt;
      const updateLabel = () => {
        this.els.sleepStatus.textContent = t(
          "player.sleepingIn",
          sleepRemainingLabel(endsAt, Date.now()),
        );
      };
      updateLabel();
      this.sleepTick = setInterval(updateLabel, 1000);
      this.sleepTimeout = setTimeout(() => this.fireSleepTimer(), Math.max(0, endsAt - Date.now()));
    } else {
      this.els.sleepStatus.textContent = t("player.pauseAtEnd");
    }
  }

  private fireSleepTimer(): void {
    const id = this.sleepId;
    this.activeAudio().pause();
    const track = this.track();
    if (track) telemetry.capture("sleep_timer_fired", { track_id: track.id, option: id });
    this.setSleepTimer("off");
    this.setStatusKey("player.sleepEnded");
  }

  private clearSleepTimers(): void {
    if (this.sleepTimeout) clearTimeout(this.sleepTimeout);
    if (this.sleepTick) clearInterval(this.sleepTick);
    this.sleepTimeout = null;
    this.sleepTick = null;
    this.sleepDeadline = null;
  }

  // ------------------------------------------------------------- audio events

  private onPlay(): void {
    const track = this.track();
    this.els.playIcon.innerHTML = `<path d="${ICONS.pause}"/>`;
    this.els.playBtn.setAttribute("aria-label", t("player.pause"));
    setPlaybackState("playing");
    if (track) {
      telemetry.capture("playback_start", {
        track_id: track.id,
        mode: this.mode,
        position_sec: Math.round(this.activeAudio().currentTime),
        speed: this.speed,
      });
    }
    this.syncQueueIcons();
  }

  private onPause(): void {
    const track = this.track();
    const active = this.activeAudio();
    this.els.playIcon.innerHTML = `<path d="${ICONS.play}"/>`;
    this.els.playBtn.setAttribute("aria-label", t("player.play"));
    setPlaybackState("paused");
    if (track && !active.ended && !isComplete(active.currentTime, this.duration())) {
      this.reportDrop(track, "pause");
    }
    this.syncQueueIcons();
  }

  private onEnded(el: HTMLAudioElement): void {
    const track = this.track();
    if (track) {
      telemetry.capture("playback_complete", {
        track_id: track.id,
        mode: this.mode,
        duration_sec: Math.round(this.duration()),
        speed: this.speed,
      });
    }
    if (this.sleepDeadline?.kind === "eot") {
      this.fireSleepTimer();
      return;
    }
    if (el === this.afterAudio) {
      // Aftercare is an ending state: stop here, let the listener land.
      setPlaybackState("paused");
      this.syncQueueIcons();
      return;
    }
    // Playthrough: continue into the next story (user already engaged playback).
    const target = nextIndex(this.currentIndex, this.catalog.length);
    if (target === null) return;
    this.selectTrack(target, { autoplay: true, reason: "step" });
  }

  private onTimeUpdate(): void {
    const duration = this.duration();
    const current = this.activeAudio().currentTime;
    if (!this.scrubbing) {
      this.els.scrubber.max = String(duration);
      this.els.scrubber.value = String(current);
      this.els.elapsed.textContent = formatTime(current);
      this.els.remaining.textContent = `-${formatTime(duration - current)}`;
      this.updateScrubberFill(current);
    }
    setPositionState(duration, current, this.speed);
  }

  /** Played-portion fill on the range track (webkit; Firefox uses ::-moz-range-progress). */
  private updateScrubberFill(current: number): void {
    const duration = this.duration();
    const pct = duration > 0 ? (clampTime(current, duration) / duration) * 100 : 0;
    this.els.scrubber.style.setProperty("--fill", `${pct}%`);
  }

  private onAudioError(el: HTMLAudioElement): void {
    if (el === this.afterAudio && this.mode === "aftercare") {
      // Pairing metadata existed but the stem didn't load: stay with the story.
      this.setMode("story");
      this.setStatusKey("player.aftercareError");
      return;
    }
    if (el === this.audio) {
      this.setStatusKey("player.loadError");
      setPlaybackState("none");
    }
  }

  private onPageHide = (): void => {
    const track = this.track();
    const active = this.activeAudio();
    if (track && !active.paused && !isComplete(active.currentTime, this.duration())) {
      this.reportDrop(track, "page_hide");
    }
  };

  // ----------------------------------------------------------------- helpers

  private reportDrop(track: Track, reason: DropReason): void {
    const active = this.activeAudio();
    telemetry.capture("playback_drop", {
      track_id: track.id,
      mode: this.mode,
      position_sec: Math.round(active.currentTime),
      progress_pct: progressPct(active.currentTime, this.duration()),
      reason,
    });
  }

  private syncQueueIcons(): void {
    const paused = this.activeAudio().paused;
    this.els.queue.querySelectorAll<HTMLLIElement>(".player__queue-item").forEach((li, i) => {
      li.querySelector(".player__queue-icon")?.setAttribute(
        "d",
        i === this.currentIndex && !paused ? ICONS.pause : ICONS.play,
      );
    });
  }

  private syncQueueActive(): void {
    this.els.queue.querySelectorAll<HTMLLIElement>(".player__queue-item").forEach((li, i) => {
      li.toggleAttribute("data-active", i === this.currentIndex);
      const item = this.catalog[i];
      if (item) {
        li.querySelector("button")?.setAttribute(
          "aria-label",
          escapeHtml(t("player.playTrack", item.title)),
        );
      }
    });
  }

  private sleepLabel(id: SleepTimerId): string {
    if (id === "off") return t("player.sleepOff");
    if (id === "eot") return t("player.sleepEot");
    return SLEEP_TIMER_OPTIONS.find((o) => o.id === id)?.label ?? id;
  }

  private setStatusKey(key: string, ...args: (string | number)[]): void {
    this.lastStatus = key ? { key, args } : null;
    this.els.status.textContent = key ? t(key, ...args) : "";
  }

  /** Re-apply strings after a locale switch without touching playback. */
  public refreshStrings(): void {
    const current = this.track();
    this.root.querySelector<HTMLElement>("#speed-label")!.textContent = t("player.speed");
    this.root.querySelector<HTMLElement>("#sleep-label")!.textContent = t("player.sleepTimer");
    this.root.querySelector<HTMLElement>(".player__queue-heading")!.textContent =
      t("player.stories");
    this.els.scrubber.setAttribute("aria-label", t("player.seekAria"));
    this.root
      .querySelector<HTMLButtonElement>('[data-action="back"]')
      ?.setAttribute("aria-label", t("player.back15"));
    this.root
      .querySelector<HTMLButtonElement>('[data-action="fwd"]')
      ?.setAttribute("aria-label", t("player.fwd15"));
    this.els.playBtn.setAttribute(
      "aria-label",
      this.activeAudio().paused ? t("player.play") : t("player.pause"),
    );
    this.els.sleepBtns.forEach((b) => {
      b.textContent = this.sleepLabel(b.dataset.sleep as SleepTimerId);
    });
    if (current) this.syncQueueActive();
    this.renderQueue();
    this.syncAftercareToggle();
    if (this.sleepDeadline?.kind === "eot") {
      this.els.sleepStatus.textContent = t("player.pauseAtEnd");
    }
    if (this.lastStatus) {
      this.els.status.textContent = t(this.lastStatus.key, ...this.lastStatus.args);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeLocale();
    window.removeEventListener("pagehide", this.onPageHide);
    this.clearSleepTimers();
    if (this.fadeFrame !== null) cancelAnimationFrame(this.fadeFrame);
    this.audio.pause();
    this.audio.removeAttribute("src");
    if (this.afterAudio) {
      this.afterAudio.pause();
      this.afterAudio.removeAttribute("src");
    }
    clearMediaSession();
    this.root.remove();
  }
}

function q(root: ParentNode, sel: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`player template missing ${sel}`);
  return el;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
