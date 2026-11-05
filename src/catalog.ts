/**
 * Story catalog for the player + discovery surfaces.
 *
 * Rows 1–5 are seeded from pipeline/artifacts/pilot_production/
 * pilot_deliverables_summary.json (QC-passed pilot masters). Rows 6+ are
 * metadata-complete catalog entries queued for mastering; their audio paths
 * follow the same convention. Audio is served from /audio/*.mp3 — content,
 * not code: drop mastered files into public/audio/ (gitignored) to make the
 * demo playable locally. On a fresh clone the player renders its error state.
 *
 * Facet metadata (tropes / audioStyle / heatIndex) powers the 4-way discovery
 * filters; `aftercare` is the paired Warmth stem for the player toggle
 * (null = no pairing yet — the toggle shows a disabled state, never hidden).
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
    tropes: ["taboo"],
    audioStyle: "whisper",
    heatIndex: 4,
    aftercare: {
      src: "/audio/aftercare/story1_vacation_aftercare_master.mp3",
      title: "Aftercare — The Bedroom Hold",
    },
  },
  {
    id: "story-2-vacation-arrival-reunion",
    title: "Vacation with My Straight Brother — Scene 2: Arrival & Reunion",
    series: "Pilot Season",
    trope: "Reunion · Smoky Mountain Cabin",
    durationSec: 85.08,
    src: "/audio/story2_vacation_scene2_arrival_master.mp3",
    cover: "/covers/story-2.svg",
    tropes: ["proximity", "taboo"],
    audioStyle: "soundscape",
    heatIndex: 3,
    aftercare: {
      src: "/audio/aftercare/story2_vacation_aftercare_master.mp3",
      title: "Aftercare — Arrival & Reunion",
    },
  },
  {
    id: "story-3-penthouse-elevator",
    title: "The Penthouse Elevator — Between Floors",
    series: "Pilot Season",
    trope: "Enemies to Lovers · Forced Proximity",
    durationSec: 30.52,
    src: "/audio/story3_penthouse_elevator_master.mp3",
    cover: "/covers/story-3.svg",
    tropes: ["rivals", "proximity"],
    audioStyle: "raw",
    heatIndex: 5,
    aftercare: null, // pairing not mastered yet — toggle renders disabled + tooltip
  },
  {
    id: "story-4-cabin-fever-snowbound",
    title: "Cabin Fever — Three Days Snowed In",
    series: "Pilot Season",
    trope: "Friends to Lovers · Slow Burn",
    durationSec: 32.32,
    src: "/audio/story4_cabin_fever_snowbound_master.mp3",
    cover: "/covers/story-4.svg",
    tropes: ["proximity"],
    audioStyle: "soundscape",
    heatIndex: 2,
    aftercare: {
      src: "/audio/aftercare/story4_cabin_fever_aftercare_master.mp3",
      title: "Aftercare — Three Days Snowed In",
    },
  },
  {
    id: "story-5-late-night-shift",
    title: "Late Night Shift at Central — Two in the Morning",
    series: "Pilot Season",
    trope: "Forbidden Encounter · Night Shift",
    durationSec: 17.08,
    src: "/audio/story5_late_night_shift_master.mp3",
    cover: "/covers/story-5.svg",
    tropes: ["taboo"],
    audioStyle: "dualPov",
    heatIndex: 4,
    aftercare: {
      src: "/audio/aftercare/story5_late_shift_aftercare_master.mp3",
      title: "Aftercare — Two in the Morning",
    },
  },
  {
    id: "story-6-locker-room-overtime",
    title: "Locker Room Overtime — After the Final Whistle",
    series: "Pilot Season",
    trope: "Locker Room · Post-Game",
    durationSec: 495,
    src: "/audio/story6_locker_room_overtime_master.mp3",
    cover: "/covers/story-6.svg",
    tropes: ["lockerRoom"],
    audioStyle: "raw",
    heatIndex: 5,
    aftercare: null,
  },
  {
    id: "story-7-protectors-watch",
    title: "The Protector's Watch — Standing Guard",
    series: "Pilot Season",
    trope: "Protector · Bodyguard",
    durationSec: 760,
    src: "/audio/story7_protectors_watch_master.mp3",
    cover: "/covers/story-7.svg",
    tropes: ["protector"],
    audioStyle: "soundscape",
    heatIndex: 3,
    aftercare: {
      src: "/audio/aftercare/story7_protector_aftercare_master.mp3",
      title: "Aftercare — Standing Guard",
    },
  },
  {
    id: "story-8-midnight-confession",
    title: "Confession at Midnight — Tell Me Everything",
    series: "Pilot Season",
    trope: "Taboo Confession · Late Night",
    durationSec: 900,
    src: "/audio/story8_midnight_confession_master.mp3",
    cover: "/covers/story-8.svg",
    tropes: ["taboo"],
    audioStyle: "whisper",
    heatIndex: 4,
    aftercare: {
      src: "/audio/aftercare/story8_confession_aftercare_master.mp3",
      title: "Aftercare — Tell Me Everything",
    },
  },
  {
    id: "story-9-rivals-boardroom",
    title: "Rivals in the Boardroom — Hostile Takeover",
    series: "Pilot Season",
    trope: "Rivals to Lovers · Power Play",
    durationSec: 1320,
    src: "/audio/story9_rivals_boardroom_master.mp3",
    cover: "/covers/story-9.svg",
    tropes: ["rivals"],
    audioStyle: "dualPov",
    heatIndex: 4,
    aftercare: null,
  },
  {
    id: "story-10-snowed-in-lodge",
    title: "Snowed In at the Lodge — One Bed Left",
    series: "Pilot Season",
    trope: "Forced Proximity · Slow Burn",
    durationSec: 1560,
    src: "/audio/story10_snowed_in_lodge_master.mp3",
    cover: "/covers/story-10.svg",
    tropes: ["proximity", "protector"],
    audioStyle: "soundscape",
    heatIndex: 3,
    aftercare: {
      src: "/audio/aftercare/story10_lodge_aftercare_master.mp3",
      title: "Aftercare — One Bed Left",
    },
  },
  {
    id: "story-11-whispered-vows",
    title: "Whispered Vows — A Taboo Confession",
    series: "Pilot Season",
    trope: "Taboo Confession · Intimate",
    durationSec: 660,
    src: "/audio/story11_whispered_vows_master.mp3",
    cover: "/covers/story-11.svg",
    tropes: ["taboo"],
    audioStyle: "whisper",
    heatIndex: 5,
    aftercare: {
      src: "/audio/aftercare/story11_vows_aftercare_master.mp3",
      title: "Aftercare — Whispered Vows",
    },
  },
  {
    id: "story-12-gym-buddies",
    title: "Gym Buddies No More — Spot Me",
    series: "Pilot Season",
    trope: "Locker Room · Rivals to Lovers",
    durationSec: 1140,
    src: "/audio/story12_gym_buddies_master.mp3",
    cover: "/covers/story-12.svg",
    tropes: ["lockerRoom", "rivals"],
    audioStyle: "raw",
    heatIndex: 4,
    aftercare: null,
  },
];
