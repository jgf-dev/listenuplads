#!/usr/bin/env python3
"""OpenRouter API Client for Flexible Story Analysis & Director Prompt Generation.

Designed for JGF Project A (Audio Stories).
Provides model-agnostic LLM routing through OpenRouter's unified API endpoint:
- Story analysis & scene segmentation
- Dynamic Director's Notes & Audio Profile formatting
- Emotional cue & paralinguistic tag insertion (M4M intimacy palette)
- Support for Claude 3.5 Sonnet, Gemini 2.5/3, Llama 3.3, and DeepSeek
"""

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request

logger = logging.getLogger("openrouter_client")


class OpenRouterClient:
    """Client for OpenRouter's OpenAI-compatible completions API."""

    DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
    DEFAULT_MODEL = "google/gemini-2.5-flash"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        timeout_sec: float = 60.0,
    ):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.base_url = (base_url or os.environ.get("OPENROUTER_BASE_URL", self.DEFAULT_BASE_URL)).rstrip("/")
        self.default_model = default_model or os.environ.get("OPENROUTER_MODEL", self.DEFAULT_MODEL)
        self.timeout_sec = timeout_sec

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        retries: int = 3,
        backoff_sec: float = 2.0,
    ) -> Dict[str, Any]:
        """Executes a chat completion request via OpenRouter."""
        chosen_model = model or self.default_model
        endpoint = f"{self.base_url}/chat/completions"

        payload: Dict[str, Any] = {
            "model": chosen_model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/jgf-dev/listenuplads",
            "X-Title": "Project A Audio Stories Pipeline",
            "User-Agent": "listenuplads-audio-engine/1.0",
        }
        if extra_headers:
            headers.update(extra_headers)

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")

        last_err: Optional[Exception] = None
        for attempt in range(1, retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout_sec) as response:
                    res_body = response.read().decode("utf-8")
                    return json.loads(res_body)
            except urllib.error.HTTPError as e:
                err_content = e.read().decode("utf-8", errors="replace")
                last_err = RuntimeError(f"OpenRouter HTTP {e.code}: {err_content}")
                logger.warning("OpenRouter request failed (attempt %d/%d): %s", attempt, retries, last_err)
                if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                    time.sleep(backoff_sec * attempt)
                    continue
                raise last_err from e
            except urllib.error.URLError as e:
                last_err = RuntimeError(f"OpenRouter connection error: {e.reason}")
                logger.warning("OpenRouter connection error (attempt %d/%d): %s", attempt, retries, last_err)
                if attempt < retries:
                    time.sleep(backoff_sec * attempt)
                    continue
                raise last_err from e

        raise last_err or RuntimeError("OpenRouter request failed after retries")

    def generate_scene_prompt(
        self,
        scene_title: str,
        scene_setting: str,
        characters: Dict[str, Dict[str, Any]],
        dialogue_transcript: str,
        intimacy_level: str = "medium",
        model: Optional[str] = None,
    ) -> str:
        """Generates a canonical TTS scene prompt with system preamble and director notes.
        
        Follows the JGF Canonical Prompt Schema:
        # SYSTEM PREAMBLE
        # AUDIO PROFILE
        ### THE SCENE
        ### DIRECTOR'S NOTES
        #### TRANSCRIPT
        """
        system_instruction = (
            "You are an expert audio drama director specializing in intimate, emotionally authentic gay male fiction. "
            "Your task is to take raw dialogue and scene details, format it into the Canonical Audio Story Prompt Schema, "
            "and embed safe paralinguistic intimacy cues without theatrical melodrama."
        )

        char_descriptions = []
        for name, info in characters.items():
            voice = info.get("voice", "Algenib")
            profile = info.get("profile", "Intimate, grounded")
            char_descriptions.append(f"- {name} (Voice: {voice}): {profile}")

        user_content = f"""Convert this scene into the canonical audio story prompt:
Scene Title: {scene_title}
Setting / Atmosphere: {scene_setting}
Intimacy Level: {intimacy_level}

Character Voices:
{chr(10).join(char_descriptions)}

Raw Dialogue / Transcript:
{dialogue_transcript}

Strict Requirements:
1. Always start with exact header:
# SYSTEM PREAMBLE: Synthesize speech ONLY for the transcripts under the #### TRANSCRIPT headers. Do NOT read aloud the section titles, scene descriptions, actor names, or director notes.
2. Include # AUDIO PROFILE: [Scene Title]
3. Include ### THE SCENE: [Atmosphere, lighting, proximity]
4. Include ### DIRECTOR'S NOTES with Style, Pace, and Accent
5. Include #### TRANSCRIPT with speaker labels and inline tags like [whispers], [sighs], [gasp], [short pause], [long pause].
6. Never place consecutive tags together without spaces (e.g. use '[sighs] [whispers]', NOT '[sighs][whispers]').
7. During intimacy, NEVER use [shouting], [excited], [loud], or [anger].
"""

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_content},
        ]

        resp = self.chat_completion(messages, model=model)
        choices = resp.get("choices", [])
        if not choices:
            raise ValueError("No response returned from OpenRouter.")
        return choices[0]["message"]["content"].strip()


if __name__ == "__main__":
    # Test client instantiation
    client = OpenRouterClient()
    print(f"OpenRouterClient initialized (model: {client.default_model}, base_url: {client.base_url})")
    has_key = bool(client.api_key)
    print(f"API key configured: {has_key}")
