#!/usr/bin/env python3
"""Google Gemini TTS Client for Audio Story Generation.

Designed for JGF Project A (Audio Stories).
Supports Gemini TTS models (gemini-3.1-flash-tts-preview) via Google GenAI SDK:
- Enforces strict male-only casting guardrails (auto-remaps Kore, Aoede, Leda, Zephyr).
- Directs speech synthesis with Director's Chair canonical prompts.
- Manages multi-speaker voice configurations (strictly 2 speakers required by Google API).
- Manages stateful session continuity and scene-boundary state isolation.
- Outputs 24kHz 16-bit mono PCM WAV audio.
"""

import base64
import json
import logging
import os
import pathlib
import re
import time
import wave
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("gemini_tts_client")

try:
    from google import genai
    from google.genai.client import Client
    HAVE_GOOGLE_GENAI = True
except ImportError:
    HAVE_GOOGLE_GENAI = False
    logger.warning("google-genai package not found. GeminiTTSClient will run in simulation mode.")


class GeminiTTSClient:
    """Client for Google Gemini TTS via Interactions API."""

    DEFAULT_MODEL = "gemini-3.1-flash-tts-preview"
    DEFAULT_SAMPLE_RATE = 24000
    FORBIDDEN_FEMALE_VOICES = {"Kore", "Aoede", "Leda", "Zephyr"}
    DEFAULT_MALE_FALLBACK = "Zubenelgenubi"
    SECONDARY_DUMMY_VOICE = "Puck"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        casting_matrix_path: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.model = model or os.environ.get("GEMINI_TTS_MODEL", self.DEFAULT_MODEL)
        self.casting_matrix = self._load_casting_matrix(casting_matrix_path)
        self._client: Optional[Any] = None

        if HAVE_GOOGLE_GENAI and self.api_key:
            try:
                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.error("Failed to initialize Google GenAI client: %s", e)

    def _load_casting_matrix(self, path: Optional[str]) -> Dict[str, Any]:
        matrix_path = path or os.path.join(os.path.dirname(__file__), "casting_matrix.json")
        if os.path.exists(matrix_path):
            try:
                with open(matrix_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning("Could not load casting matrix from %s: %s", matrix_path, e)
        return {}

    def remap_voice_if_forbidden(self, voice: str, speaker_name: str = "") -> str:
        """Enforces male-only voice policy to prevent female voice fallback defect (Artefact 2)."""
        gender_policy = self.casting_matrix.get("gender_policy", {})
        forbidden = set(gender_policy.get("forbidden_voices_for_male_roles", self.FORBIDDEN_FEMALE_VOICES))
        fallback = gender_policy.get("default_male_fallback", self.DEFAULT_MALE_FALLBACK)

        if voice in forbidden:
            logger.warning(
                "GENDER POLICY ENFORCEMENT: Forbidden feminine voice '%s' detected for '%s'. "
                "Remapping to male archetype '%s'.",
                voice, speaker_name or "Character", fallback
            )
            return fallback
        return voice

    def build_speech_config(
        self,
        active_speakers: List[str],
        speaker_to_voice: Dict[str, str],
    ) -> List[Dict[str, str]]:
        """Builds speech config array adhering to Gemini's 2-speaker requirement and gender policy."""
        speech_config: List[Dict[str, str]] = []

        for sp in active_speakers:
            assigned_voice = speaker_to_voice.get(sp)
            if not assigned_voice and sp == "Narrator":
                for alias_k, alias_v in speaker_to_voice.items():
                    if alias_k.lower() not in ("style", "pace", "setting", "mood"):
                        assigned_voice = alias_v
                        break
            if not assigned_voice:
                assigned_voice = self.DEFAULT_MALE_FALLBACK
            safe_voice = self.remap_voice_if_forbidden(assigned_voice, sp)
            speech_config.append({"speaker": sp, "voice": safe_voice})
            if len(speech_config) == 2:
                break

        # Fallback to configured speaker_to_voice dictionary if no active speakers found in transcript
        if not speech_config:
            for sp, vc in list(speaker_to_voice.items())[:2]:
                safe_vc = self.remap_voice_if_forbidden(vc, sp)
                speech_config.append({"speaker": sp, "voice": safe_vc})

        # Ensure single or multi-speaker compliance
        if not speech_config:
            # Single speaker voice fallback (strictly male archetype)
            speech_config.append({"voice": self.DEFAULT_MALE_FALLBACK})
        elif len(speech_config) == 1:
            # Multi-speaker requirement in Gemini requires exactly 2 speaker entries
            dummy_speaker = "DummySecondary"
            dummy_voice = self.remap_voice_if_forbidden(self.SECONDARY_DUMMY_VOICE, dummy_speaker)
            speech_config.append({"speaker": dummy_speaker, "voice": dummy_voice})

        return speech_config

    def parse_speakers_from_markdown(self, content: str) -> Tuple[Dict[str, str], List[str]]:
        """Extracts speaker-to-voice mappings and active speakers from canonical or legacy markdown."""
        speaker_to_voice: Dict[str, str] = {}
        active_speakers: List[str] = []

        # 1. Parse Voice mappings from AUDIO PROFILE or DIRECTOR'S NOTES
        for line in content.split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Match: - Cody (Voice: Enceladus): ... or - Levi (Voice: Enceladus)
            m1 = re.search(r"[\*\-]\s*\*{0,2}(.+?)\*{0,2}\s*\(Voice:\s*([A-Za-z0-9_-]+)\)", line)
            if m1:
                name = m1.group(1).strip()
                vc = m1.group(2).strip()
                speaker_to_voice[name] = vc
                if "(" in name and ")" in name:
                    short_name = name.split("(")[1].split(")")[0].strip()
                    speaker_to_voice[short_name] = vc
                continue

            # Match: - **Narrator (Levi)**: puck or - **Ewan**: charon
            m2 = re.search(r"[\*\-]\s*\*{0,2}(.+?)\*{0,2}\s*:\s*([A-Za-z0-9_-]+)", line)
            if m2:
                name = m2.group(1).strip()
                vc = m2.group(2).strip()
                # Exclude section headers like Style:, Pace:, Setting:
                if name.lower() not in ("style", "pace", "setting", "mood", "narrative perspective"):
                    speaker_to_voice[name] = vc
                    if "(" in name and ")" in name:
                        short_name = name.split("(")[1].split(")")[0].strip()
                        speaker_to_voice[short_name] = vc
                continue

        # 2. Extract active speakers in transcript section
        # Use regex to find the section header line rather than matching inside the preamble
        transcript_match = re.search(r"^\s*#{2,4}\s*TRANSCRIPT\b.*$", content, re.MULTILINE)
        if transcript_match:
            transcript_content = content[transcript_match.end():]
        else:
            transcript_content = content

        for line in transcript_content.split("\n"):
            line = line.strip()
            # Ignore headers or empty lines
            if not line or line.startswith("#"):
                continue

            # Match bracketed: [Narrator (Levi)] or [Ewan]
            m_br = re.match(r"^\[([A-Za-z0-9_\-\s\(\)]+)\]", line)
            if m_br:
                sp = m_br.group(1).strip()
                if sp.lower() not in ("style", "pace", "setting", "mood") and sp not in active_speakers:
                    active_speakers.append(sp)
                continue

            # Match standard colon: Levi: [sighs] ...
            m_col = re.match(r"^([A-Za-z0-9_\-]+)\s*:", line)
            if m_col:
                sp = m_col.group(1).strip()
                if sp.lower() not in ("style", "pace", "setting", "mood") and sp not in active_speakers:
                    active_speakers.append(sp)
                continue

        return speaker_to_voice, active_speakers

    def save_wav(self, output_path: str, pcm_bytes: bytes, sample_rate: int = 24000) -> None:
        """Writes raw PCM bytes to WAV file."""
        out_dir = os.path.dirname(output_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        with wave.open(output_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_bytes)

    def synthesize(
        self,
        prompt_content: str,
        output_path: str,
        speech_config: Optional[List[Dict[str, str]]] = None,
        previous_interaction_id: Optional[str] = None,
        retries: int = 3,
        backoff_sec: float = 2.0,
    ) -> Tuple[str, Optional[str]]:
        """Synthesizes audio from prompt content using Gemini TTS.
        
        Returns:
            Tuple of (output_path, next_interaction_id).
        """
        if not self._client:
            raise RuntimeError("Google GenAI client is not initialized or GEMINI_API_KEY is missing.")

        if speech_config is None:
            sp_to_vc, active_sps = self.parse_speakers_from_markdown(prompt_content)
            speech_config = self.build_speech_config(active_sps, sp_to_vc)

        logger.info("Synthesizing audio via %s with speech_config: %s", self.model, speech_config)

        last_err: Optional[Exception] = None
        current_prev_id = previous_interaction_id

        for attempt in range(1, retries + 1):
            try:
                # Note: gemini-3.1-flash-tts-preview does not support audio modality in multi-turn history.
                # Passing previous_interaction_id containing audio causes 400: 'Audio input modality is not enabled for this model'.
                # Each chunk/scene must carry self-contained Director's Notes and voice config.
                interaction_kwargs = {
                    "model": self.model,
                    "input": prompt_content,
                    "response_modalities": ["audio"],
                    "generation_config": {"speech_config": speech_config},
                }
                if current_prev_id:
                    interaction_kwargs["previous_interaction_id"] = current_prev_id

                interaction = self._client.interactions.create(**interaction_kwargs)

                if not (interaction.output_audio and interaction.output_audio.data):
                    raise RuntimeError("Interaction returned without output_audio data.")

                audio_bytes = base64.b64decode(interaction.output_audio.data)
                sample_rate = self.DEFAULT_SAMPLE_RATE
                mime_type = getattr(interaction.output_audio, "mime_type", None)
                if mime_type:
                    rate_match = re.search(r"rate=(\d+)", mime_type)
                    if rate_match:
                        sample_rate = int(rate_match.group(1))

                self.save_wav(output_path, audio_bytes, sample_rate=sample_rate)
                next_id = getattr(interaction, "id", None)
                logger.info("Successfully synthesized audio to %s (%d bytes, %d Hz)", output_path, len(audio_bytes), sample_rate)
                return output_path, next_id

            except Exception as e:
                err_str = str(e).lower()
                last_err = e
                logger.warning("Gemini TTS synthesis attempt %d/%d failed: %s", attempt, retries, e)

                # If session not found or 404, reset previous_interaction_id
                if "404" in err_str or "not_found" in err_str:
                    logger.warning("Session %s expired/not found. Retrying without previous_interaction_id.", current_prev_id)
                    current_prev_id = None
                    continue

                # If audio modality error or 400 occurs with previous_id, retry without it
                if current_prev_id and ("modality" in err_str or "400" in err_str or "invalid_request" in err_str):
                    logger.warning("TTS model does not accept audio in multi-turn history. Retrying without previous_interaction_id.")
                    current_prev_id = None
                    continue

                if attempt < retries:
                    time.sleep(backoff_sec * attempt)

        raise last_err or RuntimeError(f"Gemini TTS synthesis failed after {retries} attempts")


if __name__ == "__main__":
    client = GeminiTTSClient()
    print("GeminiTTSClient initialized. Client active:", client._client is not None)
