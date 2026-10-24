#!/usr/bin/env python3
"""Comprehensive Unit & Verification Tests for Audio Production Pipeline.

Tests:
- Quality Control (QC) Harness & Metric Calculation
- EBU R128 Mastering & Dynamic Sidechain Ducking
- OpenRouter Client Configuration & Canonical Prompt Generation
- Fish Audio Client Configuration & Model Options
- Casting Matrix Structure & Archetype Voice Mappings
- Pipeline Orchestration & 2-Voice Transcript Splitting
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

# Ensure pipeline modules are importable
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "pipeline"))

from qc_harness import AudioMetrics, AudioQCHarness, ProductionTarget
from mastering import (
    generate_synthetic_ambience,
    generate_synthetic_sfx,
    layer_ambience_bed,
    master_single_track,
    mix_soundtrack_and_sfx,
    stitch_parts,
)
from openrouter_client import OpenRouterClient
from fish_audio_client import FishAudioClient
from gemini_tts_client import GeminiTTSClient
from tts_orchestrator import AudioPipelineOrchestrator, SceneSpec


class TestAudioPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.work_dir = pathlib.Path(cls.temp_dir.name)

        # Generate a 6-second test WAV file with speech-like modulation using ffmpeg
        cls.sample_wav = str(cls.work_dir / "sample_speech.wav")
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=220:duration=6.0",
            "-af",
            "volume=-18dB,tremolo=f=1.5:d=0.3",
            "-ar",
            "24000",
            "-ac",
            "1",
            cls.sample_wav,
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        # Generate a background ambience bed
        cls.ambience_wav = str(cls.work_dir / "room_ambience.wav")
        cmd_amb = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anoisesrc=d=5.0:c=pink:r=24000:a=0.05",
            "-af",
            "volume=-25dB",
            cls.ambience_wav,
        ]
        subprocess.run(cmd_amb, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_qc_harness_probe_and_analysis(self):
        harness = AudioQCHarness()
        duration, channels, rate = harness.probe_format(self.sample_wav)
        self.assertAlmostEqual(duration, 6.0, delta=0.2)
        self.assertEqual(channels, 1)
        self.assertEqual(rate, 24000)

        metrics = harness.run_ebur128_analysis(self.sample_wav)
        self.assertIn("integrated_lufs", metrics)
        self.assertIn("true_peak_dbfs", metrics)
        self.assertIn("loudness_range_lu", metrics)

    def test_mastering_and_qc_pass(self):
        mastered_wav = str(self.work_dir / "mastered_sample.wav")
        master_single_track(self.sample_wav, mastered_wav, target_lufs=-16.0, true_peak_dbtp=-1.0)
        self.assertTrue(os.path.exists(mastered_wav))

        harness = AudioQCHarness()
        res = harness.evaluate_file(mastered_wav)
        self.assertAlmostEqual(res.integrated_lufs, -16.0, delta=1.5)
        self.assertLessEqual(res.true_peak_dbfs, -0.9)
        self.assertTrue(res.passed_qc)

    def test_stitch_parts(self):
        part1 = str(self.work_dir / "part1.wav")
        part2 = str(self.work_dir / "part2.wav")
        for p in (part1, part2):
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=f=300:d=1.5", "-ar", "24000", "-ac", "1", p],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
        stitched_wav = str(self.work_dir / "stitched.wav")
        stitch_parts([part1, part2], stitched_wav, gap_duration_sec=0.4)
        self.assertTrue(os.path.exists(stitched_wav))

        harness = AudioQCHarness()
        dur, _, _ = harness.probe_format(stitched_wav)
        self.assertGreater(dur, 2.8)

    def test_layer_ambience_bed(self):
        mixed_wav = str(self.work_dir / "mixed_layered.wav")
        layer_ambience_bed(self.sample_wav, self.ambience_wav, mixed_wav, duck_amount_db=-14.0)
        self.assertTrue(os.path.exists(mixed_wav))

        harness = AudioQCHarness()
        res = harness.evaluate_file(mixed_wav)
        self.assertTrue(res.passed_qc)

    def test_openrouter_client_init(self):
        client = OpenRouterClient(api_key="test-key", default_model="google/gemini-2.5-flash")
        self.assertEqual(client.default_model, "google/gemini-2.5-flash")
        self.assertEqual(client.base_url, "https://openrouter.ai/api/v1")

    def test_fish_audio_client_init(self):
        client = FishAudioClient(api_key="test-fish-key", default_model="s2.1-pro-free")
        self.assertEqual(client.default_model, "s2.1-pro-free")
        self.assertEqual(client.base_url, "https://api.fish.audio/v1")

    def test_casting_matrix_has_all_archetypes_and_providers(self):
        matrix_path = REPO_ROOT / "pipeline" / "casting_matrix.json"
        self.assertTrue(matrix_path.exists())
        with open(matrix_path, "r") as f:
            data = json.load(f)

        archetypes = data.get("archetypes", [])
        self.assertGreaterEqual(len(archetypes), 5)

        for arch in archetypes:
            voices = arch.get("voices", {})
            self.assertIn("gemini", voices)
            self.assertIn("fish_audio", voices)
            self.assertIn("chatterbox", voices)
            self.assertIn("orpheus_3b", voices)

    def test_transcript_splitting_limit_2_voices(self):
        orchestrator = AudioPipelineOrchestrator(output_dir=str(self.work_dir / "orch_out"))
        multi_speaker_transcript = """
Narrator: The locker room was quiet after practice.
Marcus: You played great today, Julian.
Julian: Thanks, Marcus. You weren't bad yourself.
Coach: Good hustle, both of you. Hit the showers.
Marcus: See you tomorrow, Coach.
Julian: Goodnight, sir.
"""
        chunks = orchestrator.split_transcript_by_speakers(multi_speaker_transcript, max_speakers=2)
        # Should split when Coach enters (3rd speaker)
        self.assertGreaterEqual(len(chunks), 2)
        for chunk in chunks:
            lines = [l for l in chunk.split("\n") if ":" in l]
            speakers = {l.split(":", 1)[0].strip() for l in lines}
            self.assertLessEqual(len(speakers), 2)

    def test_orchestrator_scene_processing(self):
        orchestrator = AudioPipelineOrchestrator(output_dir=str(self.work_dir / "orch_out"))
        scene = SceneSpec(
            scene_id="scene_test_001",
            title="Late Night Study",
            setting="A quiet dorm room late at night.",
            intimacy_level="medium",
            characters={
                "Julian": {"voice": "Enceladus", "profile": "Soft and thoughtful"},
                "Marcus": {"voice": "Algenib", "profile": "Warm and protective"},
            },
            transcript="Julian: Hey Marcus, did you finish the assignment?\nMarcus: Just wrapping it up now.",
            ambience_path=self.ambience_wav,
        )
        result = orchestrator.process_scene(scene)
        self.assertEqual(result.scene_id, "scene_test_001")
        self.assertTrue(os.path.exists(result.stitched_master_wav))
        self.assertTrue(os.path.exists(result.final_layered_wav))
        self.assertTrue(result.passed_qc)

    def test_soundtrack_and_sfx_mixing(self):
        sfx_wav = str(self.work_dir / "test_thud.wav")
        generate_synthetic_sfx(sfx_wav, sfx_type="thud")
        self.assertTrue(os.path.exists(sfx_wav))

        mixed_out = str(self.work_dir / "mixed_sfx_soundtrack.wav")
        mix_soundtrack_and_sfx(
            dialogue_wav=self.sample_wav,
            output_wav=mixed_out,
            ambience_wav=self.ambience_wav,
            spot_sfx_list=[{"path": sfx_wav, "time_sec": 1.0, "gain_db": -6.0}],
        )
        self.assertTrue(os.path.exists(mixed_out))
        harness = AudioQCHarness()
        qc = harness.evaluate_file(mixed_out)
        self.assertTrue(qc.passed_qc)

    def test_gender_casting_policy_auto_remapping(self):
        orchestrator = AudioPipelineOrchestrator(output_dir=str(self.work_dir / "orch_out"))
        scene = SceneSpec(
            scene_id="scene_gender_test",
            title="Male Character Remap Test",
            setting="Locker room",
            intimacy_level="none",
            characters={
                "Narrator": {"voice": "Kore", "profile": "Erroneously assigned female voice"},
            },
            transcript="Narrator: Testing male voice enforcement.",
        )
        result = orchestrator.process_scene(scene)
        self.assertEqual(result.scene_id, "scene_gender_test")
        # Character voice should have been remapped away from Kore to default male fallback
        self.assertEqual(scene.characters["Narrator"]["voice"], "Zubenelgenubi")

    def test_spectral_balance_and_timbre_drift(self):
        harness = AudioQCHarness()
        low, high, balance = harness.measure_spectral_balance(self.sample_wav)
        self.assertIsInstance(balance, float)
        # Running series check on identical file should have 0 drift
        results, issues = harness.evaluate_scene_series([self.sample_wav, self.sample_wav])
        self.assertEqual(len(issues), 0)

    def test_gemini_tts_client_speaker_parsing_and_remapping(self):
        client = GeminiTTSClient()
        prompt = """# SYSTEM PREAMBLE: Synthesize speech ONLY for the transcripts under the #### TRANSCRIPT headers.
# AUDIO PROFILE: Test Remap
### DIRECTOR'S NOTES
- Narrator (Voice: Kore)
- Partner (Voice: Algenib)
#### TRANSCRIPT
[Narrator]
Narrator: [sighs] Intimate moment.
Partner: [whispers] Right here.
"""
        sp_to_vc, active = client.parse_speakers_from_markdown(prompt)
        self.assertIn("Narrator", active)
        self.assertIn("Partner", active)

        speech_config = client.build_speech_config(active, sp_to_vc)
        # Google GenAI requires exactly 2 speaker voice configs
        self.assertEqual(len(speech_config), 2)
        # Feminine voice 'Kore' must be remapped to male fallback
        self.assertNotEqual(speech_config[0]["voice"], "Kore")
        self.assertEqual(speech_config[0]["voice"], "Zubenelgenubi")
        self.assertEqual(speech_config[1]["voice"], "Algenib")

    def test_gemini_tts_speech_config_multi_speaker_constraint(self):
        client = GeminiTTSClient()
        # Single active speaker test
        speech_config = client.build_speech_config(["SoloProtagonist"], {"SoloProtagonist": "Algenib"})
        self.assertEqual(len(speech_config), 2)
        self.assertEqual(speech_config[0]["speaker"], "SoloProtagonist")
        self.assertEqual(speech_config[0]["voice"], "Algenib")
        self.assertEqual(speech_config[1]["speaker"], "DummySecondary")
        self.assertEqual(speech_config[1]["voice"], "Puck")


if __name__ == "__main__":
    unittest.main()
