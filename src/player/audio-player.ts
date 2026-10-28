/**
 * AudioPlayer — the Listen Up Lads story player surface.
 *
 * Framework-free (matches the repo's vanilla TS starter). One instance renders
 * the full player: cover + metadata, scrubber with elapsed/remaining, ±15s
 * transport, speed control, sleep timer, and the story queue. MediaSession and
 * PostHog telemetry are wired in; both degrade gracefully when unavailable.
 */

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
import "./player.css";

const ICONS = {
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  replay:
    "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
};

function icon(path: string, className: string): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export interface AudioPlayerOptions {
  catalog: Track[];
}

export class AudioPlayer {
  private readonly root: HTMLElement;
  private readonly catalog: Track[];
  private readonly audio: HTMLAudioElement;

  private currentIndex = 0;
  private speed: PlaybackSpeed = 1;
  private scrubbing = false;
  private sleepId: SleepTimerId = "off";
  private sleepDeadline: SleepDeadline | null = null;
  private sleepTimeout: ReturnType<typeof setTimeout> | null = null;
  private sleepTick: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

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
    queueItems: HTMLLIElement[];
  };

  constructor(container: HTMLElement, { catalog }: AudioPlayerOptions) {
    this.catalog = catalog;
    this.root = document.createElement("section");
    this.root.className = "player";
    this.root.setAttribute("aria-label", "Story player");
    container.appendChild(this.root);

    this.audio = new Audio();
    this.audio.preload = "metadata";

    this.render();
    this.bind();
    if (this.catalog.length > 0) this.loadTrack(0);
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
          ${o.label}
        </button>`,
    ).join("");

    const queue = this.catalog
      .map(
        (t, i) => `
        <li class="player__queue-item" data-index="${i}">
          <button type="button" class="player__queue-button" data-queue-play="${i}">
            <span class="player__queue-play">${icon(ICONS.play, "player__queue-icon")}</span>
            <span class="player__queue-text">
              <span class="player__queue-title">${escapeHtml(t.title)}</span>
              <span class="player__queue-sub">${escapeHtml(t.trope)} · ${formatTime(t.durationSec)}</span>
            </span>
          </button>
        </li>`,
      )
      .join("");

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
               aria-label="Seek through story" />
        <span class="player__time player__time--remaining">-0:00</span>
      </div>

      <div class="player__transport">
        <button type="button" class="player__transport-btn" data-action="back" aria-label="Back 15 seconds">
          ${icon(ICONS.replay, "player__transport-icon player__transport-icon--flip")}
          <span class="player__transport-num" aria-hidden="true">15</span>
        </button>
        <button type="button" class="player__transport-btn player__transport-btn--play" data-action="play"
                aria-label="Play">
          ${icon(ICONS.play, "player__transport-icon")}
        </button>
        <button type="button" class="player__transport-btn" data-action="fwd" aria-label="Forward 15 seconds">
          ${icon(ICONS.replay, "player__transport-icon")}
          <span class="player__transport-num" aria-hidden="true">15</span>
        </button>
      </div>

      <div class="player__controls">
        <div class="player__group">
          <span class="player__group-label" id="speed-label">Speed</span>
          <div class="player__chips" role="group" aria-labelledby="speed-label">${speedButtons}</div>
        </div>
        <div class="player__group">
          <span class="player__group-label" id="sleep-label">Sleep timer</span>
          <div class="player__chips" role="group" aria-labelledby="sleep-label">${sleepButtons}</div>
          <p class="player__sleep-status" aria-live="polite"></p>
        </div>
      </div>

      <p class="player__status" role="status" aria-live="polite"></p>

      <div class="player__queue-section">
        <h2 class="player__queue-heading">Stories</h2>
        <ol class="player__queue">${queue}</ol>
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
      queueItems: Array.from(this.root.querySelectorAll<HTMLLIElement>(".player__queue-item")),
    };
  }

  // -------------------------------------------------------------------- bind

  private bind(): void {
    q(this.root, '[data-action="play"]').addEventListener("click", () => this.togglePlay());
    q(this.root, '[data-action="back"]').addEventListener("click", () => this.seekBy(-1));
    q(this.root, '[data-action="fwd"]').addEventListener("click", () => this.seekBy(1));

    this.els.scrubber.addEventListener("input", () => {
      this.scrubbing = true;
      const t = Number(this.els.scrubber.value);
      this.els.elapsed.textContent = formatTime(t);
      this.els.remaining.textContent = `-${formatTime(this.duration() - t)}`;
      this.updateScrubberFill(t);
    });
    this.els.scrubber.addEventListener("change", () => {
      this.audio.currentTime = clampTime(Number(this.els.scrubber.value), this.duration());
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
    this.root.querySelectorAll<HTMLButtonElement>("[data-queue-play]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.queuePlay);
        if (index === this.currentIndex) this.togglePlay();
        else this.selectTrack(index, { autoplay: true, reason: "queue" });
      }),
    );

    this.audio.addEventListener("play", () => this.onPlay());
    this.audio.addEventListener("pause", () => this.onPause());
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("timeupdate", () => this.onTimeUpdate());
    this.audio.addEventListener("loadedmetadata", () => this.onTimeUpdate());
    this.audio.addEventListener("waiting", () => this.setStatus("Buffering…"));
    this.audio.addEventListener("canplay", () => this.setStatus(""));
    this.audio.addEventListener("error", () => this.onAudioError());

    window.addEventListener("pagehide", this.onPageHide);

    setHandlers({
      onPlay: () => void this.audio.play(),
      onPause: () => this.audio.pause(),
      onSeekBy: (delta) => this.seekBy(delta >= 0 ? 1 : -1, Math.abs(delta)),
      onSeekTo: (t) => {
        this.audio.currentTime = clampTime(t, this.duration());
      },
      onNext: () => this.stepTrack(1),
      onPrevious: () => this.stepTrack(-1),
    });
  }

  // ------------------------------------------------------------- track state

  private track(): Track | null {
    return this.catalog[this.currentIndex] ?? null;
  }

  private duration(): number {
    if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) return this.audio.duration;
    return this.track()?.durationSec ?? 0;
  }

  private loadTrack(index: number): void {
    this.currentIndex = index;
    const track = this.track();
    if (!track) return;

    this.els.cover.src = track.cover;
    this.els.series.textContent = track.series;
    this.els.title.textContent = track.title;
    this.els.trope.textContent = track.trope;

    this.audio.src = track.src;
    this.audio.playbackRate = this.speed;

    this.els.scrubber.max = String(track.durationSec);
    this.els.scrubber.value = "0";
    this.els.elapsed.textContent = "0:00";
    this.els.remaining.textContent = `-${formatTime(track.durationSec)}`;
    this.updateScrubberFill(0);

    this.els.queueItems.forEach((li, i) => {
      li.toggleAttribute("data-active", i === index);
      li.querySelector(".player__queue-icon")?.setAttribute(
        "d",
        i === index && !this.audio.paused ? ICONS.pause : ICONS.play,
      );
      li.querySelector("button")?.setAttribute(
        "aria-label",
        `${i === index ? "Play/pause" : "Play"} ${track.title}`,
      );
    });

    setMetadata(track);
    this.setStatus("Loading audio…");
  }

  private selectTrack(
    index: number,
    { autoplay, reason }: { autoplay: boolean; reason: "queue" | "step" },
  ): void {
    const from = this.track();
    if (from && !this.audio.paused && !isComplete(this.audio.currentTime, this.duration())) {
      this.reportDrop(from, "track_switch");
    }
    this.loadTrack(index);
    if (autoplay) {
      void this.audio.play().catch(() => {
        this.setStatus("Tap play to start listening.");
      });
    } else {
      this.setStatus("");
    }
    if (reason === "step") this.els.playBtn.focus();
  }

  private stepTrack(direction: 1 | -1): void {
    const target =
      direction === 1
        ? nextIndex(this.currentIndex, this.catalog.length)
        : prevIndex(this.currentIndex, this.catalog.length);
    if (target === null) return;
    this.selectTrack(target, { autoplay: !this.audio.paused, reason: "step" });
  }

  // --------------------------------------------------------------- transport

  private togglePlay(): void {
    if (this.audio.paused) void this.audio.play();
    else this.audio.pause();
  }

  private seekBy(direction: 1 | -1, step = 15): void {
    this.audio.currentTime = skipBy(this.audio.currentTime, direction, this.duration(), step);
  }

  private setSpeed(speed: PlaybackSpeed): void {
    if (this.speed === speed) return;
    this.speed = speed;
    this.audio.playbackRate = speed;
    this.els.speedBtns.forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === speed)),
    );
    const track = this.track();
    if (track) telemetry.capture("playback_speed_change", { track_id: track.id, speed });
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
        this.els.sleepStatus.textContent = `Sleeping in ${sleepRemainingLabel(endsAt, Date.now())}`;
      };
      updateLabel();
      this.sleepTick = setInterval(updateLabel, 1000);
      this.sleepTimeout = setTimeout(() => this.fireSleepTimer(), Math.max(0, endsAt - Date.now()));
    } else {
      this.els.sleepStatus.textContent = "Pausing at end of track";
    }
  }

  private fireSleepTimer(): void {
    const id = this.sleepId;
    this.audio.pause();
    const track = this.track();
    if (track) telemetry.capture("sleep_timer_fired", { track_id: track.id, option: id });
    this.setSleepTimer("off");
    this.setStatus("Sleep timer ended playback.");
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
    this.els.playBtn.setAttribute("aria-label", "Pause");
    setPlaybackState("playing");
    if (track) {
      telemetry.capture("playback_start", {
        track_id: track.id,
        position_sec: Math.round(this.audio.currentTime),
        speed: this.speed,
      });
    }
    this.syncQueueIcons();
  }

  private onPause(): void {
    const track = this.track();
    this.els.playIcon.innerHTML = `<path d="${ICONS.play}"/>`;
    this.els.playBtn.setAttribute("aria-label", "Play");
    setPlaybackState("paused");
    if (track && !this.audio.ended && !isComplete(this.audio.currentTime, this.duration())) {
      this.reportDrop(track, "pause");
    }
    this.syncQueueIcons();
  }

  private onEnded(): void {
    const track = this.track();
    if (track) {
      telemetry.capture("playback_complete", {
        track_id: track.id,
        duration_sec: Math.round(this.duration()),
        speed: this.speed,
      });
    }
    if (this.sleepDeadline?.kind === "eot") {
      this.fireSleepTimer();
      return;
    }
    // Playthrough: continue into the next story (user already engaged playback).
    const target = nextIndex(this.currentIndex, this.catalog.length);
    if (target === null) return;
    this.selectTrack(target, { autoplay: true, reason: "step" });
  }

  private onTimeUpdate(): void {
    const duration = this.duration();
    const current = this.audio.currentTime;
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

  private onAudioError(): void {
    this.setStatus("Couldn't load this story. Check your connection and try again.");
    setPlaybackState("none");
  }

  private onPageHide = (): void => {
    const track = this.track();
    if (track && !this.audio.paused && !isComplete(this.audio.currentTime, this.duration())) {
      this.reportDrop(track, "page_hide");
    }
  };

  // ----------------------------------------------------------------- helpers

  private reportDrop(track: Track, reason: DropReason): void {
    telemetry.capture("playback_drop", {
      track_id: track.id,
      position_sec: Math.round(this.audio.currentTime),
      progress_pct: progressPct(this.audio.currentTime, this.duration()),
      reason,
    });
  }

  private syncQueueIcons(): void {
    this.els.queueItems.forEach((li, i) => {
      li.querySelector(".player__queue-icon")?.setAttribute(
        "d",
        i === this.currentIndex && !this.audio.paused ? ICONS.pause : ICONS.play,
      );
    });
  }

  private setStatus(message: string): void {
    this.els.status.textContent = message;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener("pagehide", this.onPageHide);
    this.clearSleepTimers();
    this.audio.pause();
    this.audio.removeAttribute("src");
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
