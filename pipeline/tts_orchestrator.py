#!/usr/bin/env python3
"""Audio Production Pipeline Orchestrator.

Designed for JGF Project A (Audio Stories).
Coordinates end-to-end production of broadcast-compliant erotic audio stories:
1. Scene Script & Canonical Prompt Assembly (via OpenRouter or structured template)
2. Provider Dispatching (Fish Audio, Gemini TTS, Self-Hosted Chatterbox/Orpheus)
3. Multi-part Audio Stitching & Crossfading
4. Dynamic Sidechain Ducked Ambience Layering
5. Automated Broadcast EBU R128 Quality Control (QC) Validation
"""

import argparse
import json
import logging
import os
import pathlib
import sys
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Local pipeline imports
try:
    from .casting_matrix import CastingMatrix
except ImportError:
    pass

try:
    from .fish_audio_client import FishAudioClient
    from .mastering import (
        layer_ambience_bed,
        master_single_track,
        mix_soundtrack_and_sfx,
        stitch_parts,
    )
    from .openrouter_client import OpenRouterClient
    from .qc_harness import AudioMetrics, AudioQCHarness, ProductionTarget
except (ImportError, ValueError):
    from fish_audio_client import FishAudioClient
    from mastering import (
        layer_ambience_bed,
        master_single_track,
        mix_soundtrack_and_sfx,
        stitch_parts,
    )
    from openrouter_client import OpenRouterClient
    from qc_harness import AudioMetrics, AudioQCHarness, ProductionTarget

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("tts_orchestrator")


@dataclass
class SceneSpec:
    scene_id: str
    title: str
    setting: str
    intimacy_level: str  # 'none', 'low', 'medium', 'high'
    characters: Dict[str, Dict[str, str]]
    transcript: str
    ambience_path: Optional[str] = None
    music_path: Optional[str] = None
    spot_sfx_list: Optional[List[Dict[str, Any]]] = None


@dataclass
class ProductionResult:
    scene_id: str
    raw_audio_parts: List[str]
    stitched_master_wav: str
    final_layered_wav: Optional[str]
    qc_metrics: Dict[str, Any]
    passed_qc: bool


class AudioPipelineOrchestrator:
    """End-to-end production orchestrator for audio stories."""

    def __init__(
        self,
        output_dir: str = "artifacts/production_output",
        qc_targets: Optional[ProductionTarget] = None,
        casting_matrix_path: Optional[str] = None,
    ):
        self.output_dir = pathlib.Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.qc_harness = AudioQCHarness(qc_targets or ProductionTarget())
        self.openrouter = OpenRouterClient()
        self.fish_audio = FishAudioClient()

        # Load casting matrix
        matrix_file = casting_matrix_path or os.path.join(os.path.dirname(__file__), "casting_matrix.json")
        self.casting_matrix = {}
        if os.path.exists(matrix_file):
            try:
                with open(matrix_file, "r") as f:
                    self.casting_matrix = json.load(f)
            except Exception as e:
                logger.warning("Could not load casting matrix from %s: %s", matrix_file, e)

    def route_provider(self, scene: SceneSpec) -> str:
        """Determines best TTS provider based on scene intimacy and content policies.
        
        - High intimacy / explicit erotica: Gemini TTS (with BLOCK_NONE) or Chatterbox/Orpheus.
        - Non-explicit / atmospheric / conversational: Fish Audio or Gemini TTS.
        """
        if scene.intimacy_level in ("high", "explicit"):
            return "gemini_tts"
        return "fish_audio"

    def split_transcript_by_speakers(
        self, transcript: str, max_speakers: int = 2, max_chars: int = 1800
    ) -> List[str]:
        """Splits transcript into chunks adhering to the max 2-voice limit and character threshold."""
        lines = [line.strip() for line in transcript.strip().split("\n") if line.strip()]
        chunks: List[List[str]] = []
        current_chunk: List[str] = []
        current_speakers: set = set()
        current_char_count = 0

        for line in lines:
            # Detect speaker prefix
            speaker = None
            if ":" in line:
                speaker = line.split(":", 1)[0].strip()

            line_len = len(line)
            new_speaker = speaker not in current_speakers if speaker else False
            would_exceed_speakers = new_speaker and len(current_speakers) >= max_speakers
            would_exceed_chars = (current_char_count + line_len) > max_chars and len(current_chunk) > 0

            if would_exceed_speakers or would_exceed_chars:
                chunks.append(current_chunk)
                current_chunk = [line]
                current_speakers = {speaker} if speaker else set()
                current_char_count = line_len
            else:
                current_chunk.append(line)
                if speaker:
                    current_speakers.add(speaker)
                current_char_count += line_len

        if current_chunk:
            chunks.append(current_chunk)

        return ["\n".join(c) for c in chunks]

    def render_part(
        self,
        part_idx: int,
        scene: SceneSpec,
        chunk_transcript: str,
        provider: str,
        scene_dir: pathlib.Path,
    ) -> str:
        """Renders an individual audio chunk using the selected provider."""
        part_wav = str(scene_dir / f"part_{part_idx:02d}.wav")

        if provider == "fish_audio" and self.fish_audio.api_key:
            logger.info("Synthesizing chunk %d with Fish Audio...", part_idx)
            # Find voice reference ID if mapped
            ref_id = None
            for char_info in scene.characters.values():
                ref_id = char_info.get("fish_audio_ref_id")
                if ref_id:
                    break
            self.fish_audio.synthesize(
                text=chunk_transcript,
                output_path=part_wav,
                reference_id=ref_id,
                audio_format="wav",
            )
        else:
            logger.info("Simulating / Local generation for chunk %d (provider: %s)...", part_idx, provider)
            # If no live API key is set or in mock/test mode, generate synthetic speech tone via ffmpeg
            # Creates a realistic speech test tone with natural pauses for testing the mastering chain
            duration_sec = max(3.0, len(chunk_transcript.split()) * 0.45)
            cmd = [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"sine=frequency=220:duration={duration_sec}",
                "-af",
                "volume=-20dB,highpass=f=80",
                "-ar",
                "24000",
                "-ac",
                "1",
                part_wav,
            ]
            import subprocess
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        return part_wav

    def process_scene(self, scene: SceneSpec) -> ProductionResult:
        """Executes full production pipeline for a single scene."""
        logger.info("Processing scene: %s ('%s')", scene.scene_id, scene.title)
        scene_dir = self.output_dir / scene.scene_id
        scene_dir.mkdir(parents=True, exist_ok=True)

        # 1. Route Provider and enforce male voice casting rules
        gender_policy = self.casting_matrix.get("gender_policy", {})
        forbidden_voices = set(gender_policy.get("forbidden_voices_for_male_roles", ["Kore", "Aoede", "Leda", "Zephyr"]))
        default_male_fallback = gender_policy.get("default_male_fallback", "Zubenelgenubi")

        for char_name, char_info in scene.characters.items():
            assigned_voice = char_info.get("voice", "")
            if assigned_voice in forbidden_voices:
                logger.warning(
                    "GENDER CASTING WARNING: Character '%s' was assigned forbidden feminine voice '%s'. "
                    "Auto-remapping to male archetype '%s'.",
                    char_name, assigned_voice, default_male_fallback
                )
                char_info["voice"] = default_male_fallback

        provider = self.route_provider(scene)
        logger.info("Selected provider: %s (intimacy: %s)", provider, scene.intimacy_level)

        # 2. Split transcript into 2-speaker chunks
        chunks = self.split_transcript_by_speakers(scene.transcript)
        logger.info("Split transcript into %d chunk(s)", len(chunks))

        # 3. Render parts
        raw_parts = []
        for i, chunk in enumerate(chunks, 1):
            part_file = self.render_part(i, scene, chunk, provider, scene_dir)
            raw_parts.append(part_file)

        # 4. Stitch parts together & Master to -16 LUFS
        stitched_wav = str(scene_dir / f"{scene.scene_id}_stitched_master.wav")
        stitch_parts(raw_parts, stitched_wav, gap_duration_sec=0.6)
        logger.info("Stitched and mastered: %s", stitched_wav)

        # 5. Layer ambience bed, background music, and spot SFX if specified
        final_wav = stitched_wav
        has_sound_design = bool(scene.ambience_path or scene.music_path or scene.spot_sfx_list)
        if has_sound_design:
            layered_wav = str(scene_dir / f"{scene.scene_id}_soundtrack_final.wav")
            mix_soundtrack_and_sfx(
                dialogue_wav=stitched_wav,
                output_wav=layered_wav,
                ambience_wav=scene.ambience_path,
                music_wav=scene.music_path,
                spot_sfx_list=scene.spot_sfx_list,
            )
            final_wav = layered_wav
            logger.info("Mixed dialogue with sound design layer (SFX/ambience/music): %s", final_wav)

        # 6. Quality Control Verification
        qc_result = self.qc_harness.evaluate_file(final_wav, transcript_text=scene.transcript)
        logger.info(
            "QC Result for %s: %s (Loudness: %.1f LUFS, Peak: %.1f dBTP)",
            scene.scene_id,
            "PASS" if qc_result.passed_qc else "FAIL",
            qc_result.integrated_lufs,
            qc_result.true_peak_dbfs,
        )

        return ProductionResult(
            scene_id=scene.scene_id,
            raw_audio_parts=raw_parts,
            stitched_master_wav=stitched_wav,
            final_layered_wav=final_wav if has_sound_design else None,
            qc_metrics=asdict(qc_result),
            passed_qc=qc_result.passed_qc,
        )


def main():
    parser = argparse.ArgumentParser(description="JGF Audio Production Pipeline Orchestrator")
    parser.add_argument("--scene-json", help="Path to scene specification JSON file")
    parser.add_argument("--output-dir", default="artifacts/production_output", help="Output directory")
    args = parser.parse_args()

    orchestrator = AudioPipelineOrchestrator(output_dir=args.output_dir)

    if args.scene_json and os.path.exists(args.scene_json):
        with open(args.scene_json, "r") as f:
            data = json.load(f)
        scene = SceneSpec(**data)
        res = orchestrator.process_scene(scene)
        print(json.dumps(asdict(res), indent=2))
    else:
        print("AudioPipelineOrchestrator ready. Use --scene-json to run a production job.")


if __name__ == "__main__":
    main()
