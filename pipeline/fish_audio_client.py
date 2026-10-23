#!/usr/bin/env python3
"""Fish Audio API Client for Text-to-Speech & Voice Cloning.

Designed for JGF Project A (Audio Stories).
Supports Fish Audio's S2 generation models (s2.1-pro, s2.1-pro-free, s2-pro):
- Converts dialogue / narration to high-quality audio
- Voice cloning via reference_id
- Pacing & prosody speed controls
- Streaming / direct binary audio output (WAV / MP3)
"""

import json
import logging
import os
import pathlib
import time
from typing import Any, Dict, Optional
import urllib.error
import urllib.request

logger = logging.getLogger("fish_audio_client")


class FishAudioClient:
    """Client for Fish Audio REST TTS API."""

    DEFAULT_BASE_URL = "https://api.fish.audio/v1"
    DEFAULT_MODEL = "s2.1-pro-free"  # Free model window until end of November 2026

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout_sec: float = 90.0,
    ):
        self.api_key = api_key or os.environ.get("FISH_API_KEY", os.environ.get("FISH_AUDIO_API_KEY", ""))
        self.base_url = (base_url or os.environ.get("FISH_AUDIO_BASE_URL", self.DEFAULT_BASE_URL)).rstrip("/")
        self.default_model = default_model or os.environ.get("FISH_AUDIO_MODEL", self.DEFAULT_MODEL)
        self.timeout_sec = timeout_sec

    def synthesize(
        self,
        text: str,
        output_path: Optional[str] = None,
        reference_id: Optional[str] = None,
        model: Optional[str] = None,
        audio_format: str = "wav",
        sample_rate: int = 24000,
        speed: float = 1.0,
        latency: str = "normal",
        retries: int = 3,
        backoff_sec: float = 2.0,
    ) -> bytes:
        """Synthesizes text into audio bytes and optionally saves to output_path.
        
        Args:
            text: Dialogue or narration text to synthesize.
            output_path: Destination file path (optional).
            reference_id: Fish Audio voice model ID for voice cloning.
            model: Model name ('s2.1-pro', 's2.1-pro-free', 's2-pro').
            audio_format: Audio container format ('wav', 'mp3', 'opus').
            sample_rate: Sampling rate (e.g. 24000, 44100).
            speed: Speech rate multiplier (0.5 - 2.0).
            latency: Latency mode ('balanced' or 'normal').
            retries: Number of retry attempts.
            backoff_sec: Exponential backoff delay.
            
        Returns:
            Raw audio bytes.
        """
        chosen_model = model or self.default_model
        endpoint = f"{self.base_url}/tts"

        payload: Dict[str, Any] = {
            "text": text,
            "format": audio_format,
            "sample_rate": sample_rate,
            "latency": latency,
        }
        if reference_id:
            payload["reference_id"] = reference_id
        if speed != 1.0:
            payload["prosody"] = {"speed": speed}

        headers = {
            "Content-Type": "application/json",
            "model": chosen_model,
            "User-Agent": "listenuplads-audio-engine/1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")

        last_err: Optional[Exception] = None
        for attempt in range(1, retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout_sec) as response:
                    audio_bytes = response.read()
                    if output_path:
                        out_dir = os.path.dirname(output_path)
                        if out_dir:
                            os.makedirs(out_dir, exist_ok=True)
                        with open(output_path, "wb") as f:
                            f.write(audio_bytes)
                    return audio_bytes
            except urllib.error.HTTPError as e:
                err_content = e.read().decode("utf-8", errors="replace")
                last_err = RuntimeError(f"Fish Audio HTTP {e.code}: {err_content}")
                logger.warning("Fish Audio request failed (attempt %d/%d): %s", attempt, retries, last_err)
                if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                    time.sleep(backoff_sec * attempt)
                    continue
                raise last_err from e
            except urllib.error.URLError as e:
                last_err = RuntimeError(f"Fish Audio connection error: {e.reason}")
                logger.warning("Fish Audio connection error (attempt %d/%d): %s", attempt, retries, last_err)
                if attempt < retries:
                    time.sleep(backoff_sec * attempt)
                    continue
                raise last_err from e

        raise last_err or RuntimeError("Fish Audio synthesis failed after retries")


if __name__ == "__main__":
    client = FishAudioClient()
    print(f"FishAudioClient initialized (model: {client.default_model}, base_url: {client.base_url})")
    has_key = bool(client.api_key)
    print(f"API key configured: {has_key}")
