/**
 * MediaSession API wiring: lockscreen metadata, cover art, and OS-level
 * transport controls (play/pause/±15s/seek/track change). Guarded so the
 * player still works where MediaSession is unsupported (older Safari).
 */

import { SEEK_STEP_SEC, type Track } from "./types.ts";

export interface MediaSessionHandlers {
  onPlay(): void;
  onPause(): void;
  onSeekBy(deltaSec: number): void;
  onSeekTo(positionSec: number): void;
  onNext(): void;
  onPrevious(): void;
}

export function mediaSessionSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

export function setMetadata(track: Track): void {
  if (!mediaSessionSupported()) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.series,
    album: "Listen Up Lads",
    artwork: [
      { src: track.cover, sizes: "512x512", type: "image/svg+xml" },
      { src: track.cover, sizes: "any", type: "image/svg+xml" },
    ],
  });
}

export function setHandlers(handlers: MediaSessionHandlers): void {
  if (!mediaSessionSupported()) return;
  const ms = navigator.mediaSession;
  const bind = (
    action: MediaSessionAction,
    fn: ((d: MediaSessionActionDetails) => void) | null,
  ) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      // Some actions (e.g. seekto) are unsupported on some platforms.
    }
  };
  bind("play", () => handlers.onPlay());
  bind("pause", () => handlers.onPause());
  bind("seekbackward", (d) => handlers.onSeekBy(-(d.seekOffset ?? SEEK_STEP_SEC)));
  bind("seekforward", (d) => handlers.onSeekBy(d.seekOffset ?? SEEK_STEP_SEC));
  bind("seekto", (d) => {
    if (typeof d.seekTime === "number") handlers.onSeekTo(d.seekTime);
  });
  bind("previoustrack", () => handlers.onPrevious());
  bind("nexttrack", () => handlers.onNext());
}

export function setPlaybackState(state: MediaSessionPlaybackState): void {
  if (!mediaSessionSupported()) return;
  navigator.mediaSession.playbackState = state;
}

/** Keep the lockscreen scrubber in sync with real playback position. */
export function setPositionState(duration: number, position: number, rate: number): void {
  if (!mediaSessionSupported() || typeof navigator.mediaSession.setPositionState !== "function") {
    return;
  }
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(Math.max(position, 0), duration),
      playbackRate: rate,
    });
  } catch {
    // Position updates are best-effort.
  }
}

export function clearMediaSession(): void {
  if (!mediaSessionSupported()) return;
  navigator.mediaSession.metadata = null;
  setPlaybackState("none");
}
