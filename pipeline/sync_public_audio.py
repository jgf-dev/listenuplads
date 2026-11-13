#!/usr/bin/env python3
"""Sync / Seed Real Spoken Audio Assets into public/audio/ for Local Development.

1. Synthesizes all 5 pilot deliverables with multi-speaker neural TTS (Kokoro-82M / Piper ONNX),
   realistic non-tonal acoustic SFX, and EBU R128 mastering via `produce_pilot_deliverables.py`.
2. Copies the 5 pilot master MP3s into `public/audio/`.
3. Synthesizes spoken multi-speaker scenes for catalog stories 6–12 and all 8 paired
   Aftercare stems referenced in `src/catalog.ts`, ensuring every track in the
   PWA catalog contains real spoken male voices and zero sine-wave tones.
"""

import argparse
import logging
import os
import pathlib
import shutil
import sys
from typing import Dict, List, Tuple

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from local_neural_tts import synthesize_speech_local
from mastering import (
    generate_synthetic_ambience,
    generate_synthetic_sfx,
    mix_soundtrack_and_sfx,
)
from produce_pilot_deliverables import (
    OUTPUT_DIR as PILOT_OUTPUT_DIR,
    convert_wav_to_mp3,
    main as produce_pilots_main,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("sync_public_audio")

PUBLIC_AUDIO_DIR = REPO_ROOT / "public" / "audio"
AFTERCARE_AUDIO_DIR = PUBLIC_AUDIO_DIR / "aftercare"

PILOT_MP3_NAMES = [
    "story1_vacation_scene1_bedroom_master.mp3",
    "story2_vacation_scene2_arrival_master.mp3",
    "story3_penthouse_elevator_master.mp3",
    "story4_cabin_fever_snowbound_master.mp3",
    "story5_late_night_shift_master.mp3",
]

# Spoken multi-speaker scripts for catalog stories 6–12
EXTRA_CATALOG_SCENES: List[Tuple[str, str, str, List[Dict[str, object]]]] = [
    (
        "story6_locker_room_overtime_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Coach Vance & Tyler
### DIRECTOR'S NOTES
- Vance (Voice: Algenib): Commanding, deep baritone.
- Narrator (Voice: Fenrir): Athletic, breathless after the match.
#### TRANSCRIPT
Narrator: Everyone else cleared out twenty minutes after the final whistle. Just the steam from the showers and the click of his boots on the tile.
Vance: [low, voiced] "You're still taped up, Tyler. Sit down on the bench."
Narrator: [tight] "I'm fine, Coach. Just catching my breath."
Vance: [low, voiced] "I didn't ask if you were fine. Hands on the locker. Let me check that shoulder."
Narrator: His palm pressed flat between my shoulder blades, heavy and warm through the damp cotton. Neither of us moved toward the door.
""",
        [{"sfx_type": "thud", "time_sec": 3.5, "gain_db": -8.0}],
    ),
    (
        "story7_protectors_watch_master.mp3",
        "outdoor_breeze",
        """# AUDIO PROFILE: Cole & Julian
### DIRECTOR'S NOTES
- Cole (Voice: Orus): Steady, watchful bodyguard baritone.
- Narrator (Voice: Puck): Focused, observant partner.
#### TRANSCRIPT
Narrator: Past midnight on the terrace. Cole stood by the railing, scanning the street below before his eyes settled back on me.
Cole: [low, voiced] "Perimeter is locked. You should be asleep."
Narrator: [tight] "Hard to sleep when you're pacing outside my door all night."
Cole: [low, voiced] "I don't pace. And I'm not going anywhere."
Narrator: He stepped inside and drew the heavy curtains shut, his hand resting warm against the back of my neck.
""",
        [{"sfx_type": "door", "time_sec": 8.0, "gain_db": -9.0}],
    ),
    (
        "story8_midnight_confession_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Mateusz & Reid
### DIRECTOR'S NOTES
- Reid (Voice: Algenib): Deep, intimate, unhurried confession.
- Narrator (Voice: Zubenelgenubi): Close proximity, low voiced resonance.
#### TRANSCRIPT
Narrator: The hallway was dark when he backed me against the library door, his forearm braced beside my head.
Reid: [low, voiced] "Say it again. Right here, where I can hear you."
Narrator: [tight] "I've wanted this since the night you moved in."
Reid: [low, voiced] "Good. Because I'm done pretending I didn't notice."
Narrator: His mouth found my jaw, slow and deliberate, his chest pinning me flush against the oak panel.
""",
        [{"sfx_type": "creak", "time_sec": 4.2, "gain_db": -9.0}],
    ),
    (
        "story9_rivals_boardroom_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Sterling & Devon
### DIRECTOR'S NOTES
- Sterling (Voice: Alnilam): Sharp, authoritative executive baritone.
- Devon (Voice: Puck): Composed rival, equal footing.
#### TRANSCRIPT
Narrator: The rest of the partners left the forty-second floor an hour ago. Only the city skyline lit the glass table between us.
Sterling: [low, voiced] "You fought me on every clause in that merger, Devon."
Devon: [tight] "And you yielded on the last two. That's not like you."
Sterling: [low, voiced] "I wanted the room empty. Lock the door and come over here."
Narrator: He loosened his tie without breaking eye contact, waiting until the deadbolt clicked into place.
""",
        [{"sfx_type": "door", "time_sec": 10.0, "gain_db": -8.5}],
    ),
    (
        "story10_snowed_in_lodge_master.mp3",
        "outdoor_breeze",
        """# AUDIO PROFILE: Grant & Sam
### DIRECTOR'S NOTES
- Grant (Voice: Orus): Deep, grounded mountain guide.
- Sam (Voice: Charon): Warm, steady partner.
#### TRANSCRIPT
Narrator: The generator cut out just after ten, leaving only the cedar fire and the wind banking snow against the lodge timber.
Grant: [low, voiced] "One bed, Sam. And that draft off the window isn't letting up."
Sam: [tight] "You're taking the wall side, then. You radiate heat like a stove."
Grant: [low, voiced] "Get under the blanket. Come here."
Narrator: His arm hooked around my waist, pulling my back tight against his chest until the shiver stopped completely.
""",
        [{"sfx_type": "rustle", "time_sec": 9.5, "gain_db": -10.0}],
    ),
    (
        "story11_whispered_vows_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Adrian & Lucas
### DIRECTOR'S NOTES
- Adrian (Voice: Algenib): Deep, resonant, close-mic intimacy.
- Lucas (Voice: Puck): Grounded, intense focus.
#### TRANSCRIPT
Narrator: Backstage in the dressing room, ten minutes before the reception started. My collar was still undone in his hands.
Adrian: [low, voiced] "Look at me, Lucas. Not the mirror."
Lucas: [tight] "If anyone walks through that door right now—"
Adrian: [low, voiced] "It's locked. And for the next five minutes, you're mine."
Narrator: His thumb traced the line of my throat, steady and unapologetic, before he pulled me in.
""",
        [{"sfx_type": "door", "time_sec": 6.5, "gain_db": -9.5}],
    ),
    (
        "story12_gym_buddies_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Callum & Liam
### DIRECTOR'S NOTES
- Callum (Voice: Fenrir): Confident trainer, low smooth authority.
- Liam (Voice: Puck): Focused lifter, breath catching under close guidance.
#### TRANSCRIPT
Narrator: The weight room was empty after closing. Callum stepped in behind the bench, his hands closing over my wrists on the bar.
Callum: [low, voiced] "Lock your elbows in, Liam. Feel where my hands are."
Liam: [tight] "Got it. You don't have to stand that close to spot me."
Callum: [low, voiced] "Yeah, I do. Breathe out and push."
Narrator: He racked the bar with one smooth lift, then leaned down until his breath brushed my ear.
""",
        [{"sfx_type": "thud", "time_sec": 7.5, "gain_db": -8.0}],
    ),
]

# Spoken Aftercare scripts for all 8 paired Aftercare stems in src/catalog.ts
AFTERCARE_SCENES: List[Tuple[str, str, str]] = [
    (
        "story1_vacation_aftercare_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Ewan & Levi Aftercare
### DIRECTOR'S NOTES
- Ewan (Voice: Algenib): Warm, unhurried, protective chest resonance.
- Levi (Voice: Puck): Relaxed, steady breathing.
#### TRANSCRIPT
Narrator: The morning light crept across the cabin floor. Ewan didn't move away; he just drew the quilt up over our shoulders, his palm resting steady over my ribs.
Ewan: [low, voiced] "Easy. Breathe with me, Levi. We've got time."
Levi: [low, voiced] "Stay right here for a minute."
Ewan: [low, voiced] "Not going anywhere. Just rest."
""",
    ),
    (
        "story2_vacation_aftercare_master.mp3",
        "outdoor_breeze",
        """# AUDIO PROFILE: Ewan, Jace & Levi Aftercare
### DIRECTOR'S NOTES
- Ewan (Voice: Algenib): Calm, reassuring presence on the cabin deck.
- Levi (Voice: Puck): Grounded, settled warmth.
#### TRANSCRIPT
Narrator: Out on the back deck, the mountain air was cool against our skin. Ewan handed me a warm mug and leaned his shoulder firmly against mine.
Ewan: [low, voiced] "You did good, Levi. Look at that ridge—nothing to rush."
Levi: [low, voiced] "Yeah. Glad you're here with me."
Ewan: [low, voiced] "Always. Take a slow breath."
""",
    ),
    (
        "story4_cabin_fever_aftercare_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Marcus & Julian Aftercare
### DIRECTOR'S NOTES
- Marcus (Voice: Orus): Deep, soothing baritone by the woodstove.
- Julian (Voice: Puck): Quiet, settled contentment.
#### TRANSCRIPT
Narrator: The snow kept falling outside the glass, muffled and slow. Marcus pulled the wool blanket higher around us both, his chin resting against my shoulder.
Marcus: [low, voiced] "Warm enough now, Julian?"
Julian: [low, voiced] "More than enough."
Marcus: [low, voiced] "Good. Close your eyes and listen to the fire."
""",
    ),
    (
        "story5_late_shift_aftercare_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Officer Miller & Dr. Bennett Aftercare
### DIRECTOR'S NOTES
- Miller (Voice: Algenib): Gentle, low, unhurried warmth.
- Bennett (Voice: Charon): Calm, steady exhalation.
#### TRANSCRIPT
Narrator: The pager stayed quiet on the counter. Miller kept his arm draped across my shoulders on the narrow break room couch, his thumb tracing a slow circle on my arm.
Miller: [low, voiced] "Shift's over, Doc. Let your shoulders drop."
Bennett: [low, voiced] "Best ten minutes I've had all week."
Miller: [low, voiced] "Rest your eyes. I'll wake you when it's time."
""",
    ),
    (
        "story7_protector_aftercare_master.mp3",
        "outdoor_breeze",
        """# AUDIO PROFILE: Cole & Julian Aftercare
### DIRECTOR'S NOTES
- Cole (Voice: Orus): Deep, steady, protective baritone.
- Julian (Voice: Puck): Safe, unhurried breathing.
#### TRANSCRIPT
Narrator: With the locks set and the lights dimmed, Cole lay stretched beside me, one heavy arm anchored across my chest.
Cole: [low, voiced] "House is quiet. Nobody comes near this room."
Julian: [low, voiced] "You don't have to stay on guard all night, Cole."
Cole: [low, voiced] "I'm right where I want to be. Go to sleep."
""",
    ),
    (
        "story8_confession_aftercare_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Reid & Mateusz Aftercare
### DIRECTOR'S NOTES
- Reid (Voice: Algenib): Warm, intimate, reassuring baritone.
- Narrator (Voice: Zubenelgenubi): Calm, steady heartbeat.
#### TRANSCRIPT
Narrator: No more hiding in dark hallways. Reid's fingers stayed tangled with mine against his chest, his breathing slow and even beneath my ear.
Reid: [low, voiced] "Everything out in the open now. How does that feel?"
Narrator: [low, voiced] "Like I can finally breathe."
Reid: [low, voiced] "Stay right here with me."
""",
    ),
    (
        "story10_lodge_aftercare_master.mp3",
        "outdoor_breeze",
        """# AUDIO PROFILE: Grant & Sam Aftercare
### DIRECTOR'S NOTES
- Grant (Voice: Orus): Deep, comforting mountain lodge warmth.
- Sam (Voice: Charon): Settled, peaceful cadence.
#### TRANSCRIPT
Narrator: The cedar logs settled into glowing embers while the storm passed over the roof. Grant's chest rose and fell in a slow, steady rhythm against my back.
Grant: [low, voiced] "Storm's breaking. You're warm, Sam."
Sam: [low, voiced] "Best night on the mountain."
Grant: [low, voiced] "Rest easy. Morning's a long way off."
""",
    ),
    (
        "story11_vows_aftercare_master.mp3",
        "room_tone",
        """# AUDIO PROFILE: Adrian & Lucas Aftercare
### DIRECTOR'S NOTES
- Adrian (Voice: Algenib): Deep, tender, grounded baritone.
- Lucas (Voice: Puck): Quiet, steady presence.
#### TRANSCRIPT
Narrator: Before unlocking the door, Adrian smoothed the lapels of my jacket, then rested his forehead gently against mine for one quiet breath.
Adrian: [low, voiced] "Whatever happens out there tonight, remember who you're coming home with."
Lucas: [low, voiced] "I know. Every single word."
Adrian: [low, voiced] "Take a breath with me. Ready when you are."
""",
    ),
]


def render_spoken_scene_mp3(
    mp3_path: pathlib.Path,
    ambience_type: str,
    prompt: str,
    sfx_specs: List[Dict[str, object]],
    target_lufs: float = -16.0,
    force: bool = False,
) -> None:
    """Synthesizes multi-speaker speech, mixes subtle ambience + acoustic foley, and masters to MP3."""
    if not force and mp3_path.exists() and mp3_path.stat().st_size > 10000:
        logger.info("Already exists: %s", mp3_path.relative_to(REPO_ROOT))
        return

    work_dir = PILOT_OUTPUT_DIR / "catalog_spoken" / mp3_path.stem
    work_dir.mkdir(parents=True, exist_ok=True)

    dialogue_wav = work_dir / "dialogue.wav"
    ambience_wav = work_dir / "ambience.wav"
    master_wav = work_dir / f"{mp3_path.stem}.wav"

    if force or not dialogue_wav.exists():
        synthesize_speech_local(prompt, str(dialogue_wav), speed=0.92)

    generate_synthetic_ambience(str(ambience_wav), duration_sec=45.0, ambience_type=ambience_type)

    spot_sfx_list = []
    for idx, spec in enumerate(sfx_specs):
        sfx_wav = work_dir / f"sfx_{idx}_{spec['sfx_type']}.wav"
        generate_synthetic_sfx(str(sfx_wav), sfx_type=str(spec["sfx_type"]))
        spot_sfx_list.append({
            "path": str(sfx_wav),
            "time_sec": float(spec["time_sec"]),
            "gain_db": float(spec["gain_db"]),
        })

    mix_soundtrack_and_sfx(
        dialogue_wav=str(dialogue_wav),
        output_wav=str(master_wav),
        ambience_wav=str(ambience_wav),
        spot_sfx_list=spot_sfx_list if spot_sfx_list else None,
        ambience_gain_db=-22.0,
        target_lufs=target_lufs,
        true_peak_dbtp=-1.2,
    )
    convert_wav_to_mp3(str(master_wav), str(mp3_path))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate and sync spoken audio assets to public/audio/")
    parser.add_argument("--force", action="store_true", help="Force clean regeneration of all WAV and MP3 assets")
    args = parser.parse_args()

    if args.force and PILOT_OUTPUT_DIR.exists():
        logger.info("Removing old artifacts in %s for clean regeneration...", PILOT_OUTPUT_DIR)
        shutil.rmtree(PILOT_OUTPUT_DIR)

    PUBLIC_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    AFTERCARE_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Produce the 5 pilot deliverables (with real speech + acoustic foley)
    missing_pilots = [
        name for name in PILOT_MP3_NAMES if not (PILOT_OUTPUT_DIR / name).exists()
    ]
    if args.force or missing_pilots:
        logger.info("Producing 5 pilot deliverables with multi-speaker neural TTS...")
        produce_pilots_main()

    # 2. Copy the 5 pilot deliverables to public/audio/
    for name in PILOT_MP3_NAMES:
        src = PILOT_OUTPUT_DIR / name
        dst = PUBLIC_AUDIO_DIR / name
        shutil.copy2(src, dst)
        logger.info("Synced pilot master -> %s", dst.relative_to(REPO_ROOT))

    # 3. Synthesize spoken scenes for catalog stories 6–12
    for name, amb_type, prompt, sfx_specs in EXTRA_CATALOG_SCENES:
        render_spoken_scene_mp3(
            PUBLIC_AUDIO_DIR / name,
            ambience_type=amb_type,
            prompt=prompt,
            sfx_specs=sfx_specs,
            target_lufs=-16.0,
            force=args.force,
        )

    # 4. Synthesize spoken Aftercare scenes for all 8 paired Aftercare stems
    for name, amb_type, prompt in AFTERCARE_SCENES:
        render_spoken_scene_mp3(
            AFTERCARE_AUDIO_DIR / name,
            ambience_type=amb_type,
            prompt=prompt,
            sfx_specs=[],
            target_lufs=-16.5,
            force=args.force,
        )

    logger.info(
        "Public audio sync complete: %d spoken story tracks in public/audio/, %d spoken aftercare tracks in public/audio/aftercare/",
        len(list(PUBLIC_AUDIO_DIR.glob("*.mp3"))),
        len(list(AFTERCARE_AUDIO_DIR.glob("*.mp3"))),
    )


if __name__ == "__main__":
    main()
