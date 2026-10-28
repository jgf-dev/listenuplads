/**
 * Story catalog for the player scaffold.
 *
 * Seeded from pipeline/artifacts/pilot_production/pilot_deliverables_summary.json
 * (QC-passed pilot masters). Audio is served from /audio/*.mp3 — content, not
 * code: drop mastered files into public/audio/ (gitignored) to make the demo
 * playable locally. On a fresh clone the player renders its error state.
 */

import type { Track } from "./player/types.ts";

export const CATALOG: Track[] = [
  {
    id: "story-1-vacation-bedroom-hold",
    title: "Vacation with My Straight Brother — Scene 1: The Bedroom Hold",
    series: "Pilot Season",
    trope: "Established M4M Relationship",
    durationSec: 61,
    src: "/audio/story1_vacation_scene1_bedroom_master.mp3",
    cover: "/covers/story-1.svg",
  },
  {
    id: "story-2-vacation-arrival-reunion",
    title: "Vacation with My Straight Brother — Scene 2: Arrival & Reunion",
    series: "Pilot Season",
    trope: "Reunion · Smoky Mountain Cabin",
    durationSec: 85.08,
    src: "/audio/story2_vacation_scene2_arrival_master.mp3",
    cover: "/covers/story-2.svg",
  },
  {
    id: "story-3-penthouse-elevator",
    title: "The Penthouse Elevator — Between Floors",
    series: "Pilot Season",
    trope: "Enemies to Lovers · Forced Proximity",
    durationSec: 30.52,
    src: "/audio/story3_penthouse_elevator_master.mp3",
    cover: "/covers/story-3.svg",
  },
  {
    id: "story-4-cabin-fever-snowbound",
    title: "Cabin Fever — Three Days Snowed In",
    series: "Pilot Season",
    trope: "Friends to Lovers · Slow Burn",
    durationSec: 32.32,
    src: "/audio/story4_cabin_fever_snowbound_master.mp3",
    cover: "/covers/story-4.svg",
  },
  {
    id: "story-5-late-night-shift",
    title: "Late Night Shift at Central — Two in the Morning",
    series: "Pilot Season",
    trope: "Forbidden Encounter · Night Shift",
    durationSec: 17.08,
    src: "/audio/story5_late_night_shift_master.mp3",
    cover: "/covers/story-5.svg",
  },
];
