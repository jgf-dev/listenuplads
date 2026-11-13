#!/usr/bin/env python3
"""Local Multi-Speaker Neural TTS Engine (Kokoro-82M & Piper ONNX).

Synthesizes natural multi-speaker adult male dialogue and narration from canonical
Director's Chair markdown prompts or raw transcripts when cloud TTS credentials
are not configured. Never generates sine-wave test tones.

Supported Backends:
1. Kokoro-82M (`hexgrad/Kokoro-82M`) via `kokoro` Python package (in active or
   sibling `.venv`) with distinct adult male voices (`am_onyx`, `am_adam`,
   `am_puck`, `am_fenrir`, `am_michael`, `am_liam`, `am_eric`, `am_echo`).
2. Piper Neural TTS (`/home/jgf2/.local/bin/piper` with `en_US-ryan-high.onnx`
   and `en_US-lessac-medium.onnx`) with speaker pitch/formant differentiation.
"""

import json
import logging
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("local_neural_tts")

# Map canonical Gemini / Casting Matrix male voice archetypes to Kokoro-82M male voices
GEMINI_TO_KOKORO_VOICE: Dict[str, str] = {
    "Algenib": "am_onyx",        # Deep, rugged, dominant baritone/bass
    "Orus": "am_adam",           # Warm, gravelly, grounded baritone
    "Alnilam": "am_michael",     # Heavy, commanding male voice
    "Puck": "am_puck",           # Focused, compact partner tenor/baritone
    "Zubenelgenubi": "am_liam",  # Grounded adult male partner
    "Fenrir": "am_fenrir",       # Athletic, energetic, boisterous lead
    "Sadachbia": "am_eric",      # Confident, playful baritone
    "Charon": "am_echo",         # Steady, soothing, patient partner
    "Algieba": "bm_george",      # Deep, warm, steady resonance
    "Enceladus": "am_liam",      # Intimate, close-proximity male voice
}

# Fallback rotation of distinct Kokoro male voices when speaker isn't explicitly mapped
KOKORO_MALE_ROTATION: List[str] = [
    "am_puck",
    "am_onyx",
    "am_adam",
    "am_fenrir",
    "am_michael",
    "am_liam",
    "am_echo",
    "am_eric",
]

# Inline paralinguistic cues and stage directions to strip or convert to natural pauses
INLINE_CUE_RE = re.compile(r"\[([^\]]+)\]")

KOKORO_VENV_CANDIDATES = [
    pathlib.Path("/mnt/1tb-nvme/gitext/voice/story-voice/.venv/bin/python"),
    pathlib.Path("/mnt/1tb-nvme/gitext/voice/story-voice/story_voice/.venv/bin/python"),
]

PIPER_BIN_CANDIDATES = [
    shutil.which("piper"),
    "/home/jgf2/.local/bin/piper",
]

PIPER_VOICE_DIR = pathlib.Path("/home/jgf2/.local/share/piper-voices")


# Non-speaker metadata prefixes that appear in Director's Notes / Audio Profile headers
FORBIDDEN_METADATA_SPEAKERS = {
    "style",
    "pace",
    "accent",
    "setting",
    "mood",
    "narrative perspective",
    "sample context",
    "audio profile",
    "the scene",
    "director's notes",
    "system preamble",
    "transcript",
}

TRANSCRIPT_HEADER_RE = re.compile(r"^\s*#{2,4}\s*TRANSCRIPT\b.*$", re.MULTILINE | re.IGNORECASE)


def isolate_transcript_section(prompt_or_text: str) -> str:
    """Extracts only the body below a standalone `##/###/#### TRANSCRIPT` header line.

    Uses a line-anchored regex (`^\\s*#{2,4}\\s*TRANSCRIPT\\b.*$`) so inline references
    such as `# SYSTEM PREAMBLE: ... under the #### TRANSCRIPT headers` never match.
    """
    m = TRANSCRIPT_HEADER_RE.search(prompt_or_text)
    if m:
        return prompt_or_text[m.end():].strip()
    return prompt_or_text.strip()


def extract_clean_spoken_text(prompt_or_text: str) -> str:
    """Returns pure spoken prose/dialogue stripped of all markdown headers, director notes,
    speaker prefixes, and bracketed stage directions (safe for Fish Audio, Piper, or any standard TTS)."""
    _, turns = parse_dialogue_turns(prompt_or_text)
    return " ".join(utterance for _, utterance, _ in turns)


def parse_dialogue_turns(prompt_or_text: str) -> Tuple[Dict[str, str], List[Tuple[str, str, float]]]:
    """Parses a canonical markdown prompt or plain transcript into speaker-attributed turns.

    Guarantees that `# SYSTEM PREAMBLE`, `# AUDIO PROFILE`, `### THE SCENE`, and
    `### DIRECTOR'S NOTES` (Style, Pace, Accent, bulleted character descriptions)
    are NEVER included in spoken turns.

    Returns:
        (speaker_to_kokoro_voice, turns)
        where each turn is (speaker_name, spoken_text, pause_after_sec).
    """
    text = prompt_or_text.strip()
    speaker_to_gemini: Dict[str, str] = {}

    # 1. Extract explicit voice assignments from markdown notes:
    #    e.g., `- Ewan (Voice: Algenib): ...` or `- **Narrator (Levi)**: puck`
    for raw_line in text.splitlines():
        line_s = raw_line.strip()
        if not line_s or line_s.startswith("#"):
            continue
        m1 = re.search(r"[\*\-]\s*\*{0,2}(.+?)\*{0,2}\s*\([Vv]oice:\s*([A-Za-z0-9_-]+)\)", line_s)
        if m1:
            sp_raw = m1.group(1).strip()
            vc_raw = m1.group(2).strip()
            speaker_to_gemini[sp_raw] = vc_raw
            if "(" in sp_raw and ")" in sp_raw:
                base = sp_raw.split("(", 1)[0].strip()
                alias = sp_raw.split("(", 1)[1].split(")", 1)[0].strip()
                speaker_to_gemini[base] = vc_raw
                speaker_to_gemini[alias] = vc_raw
            continue

        m2 = re.search(r"^[\*\-]\s*\*{0,2}(.+?)\*{0,2}\s*:\s*([A-Za-z0-9_-]+)\s*$", line_s)
        if m2:
            sp_raw = m2.group(1).strip()
            vc_raw = m2.group(2).strip()
            if sp_raw.lower() not in FORBIDDEN_METADATA_SPEAKERS:
                speaker_to_gemini[sp_raw] = vc_raw
                if "(" in sp_raw and ")" in sp_raw:
                    base = sp_raw.split("(", 1)[0].strip()
                    alias = sp_raw.split("(", 1)[1].split(")", 1)[0].strip()
                    speaker_to_gemini[base] = vc_raw
                    speaker_to_gemini[alias] = vc_raw

    # 2. Isolate the transcript section using line-anchored regex
    transcript_body = isolate_transcript_section(text)

    # 3. Parse line-by-line turns, strictly skipping any residual directive/profile lines
    turns: List[Tuple[str, str, float]] = []
    current_speaker = "Narrator"
    in_metadata_block = False

    for raw_line in transcript_body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("<!--"):
            continue

        # Check for markdown section headers
        if line.startswith("#"):
            header_upper = line.lstrip("#").strip().upper()
            if any(
                h in header_upper
                for h in ("SYSTEM PREAMBLE", "AUDIO PROFILE", "THE SCENE", "DIRECTOR'S NOTES", "SAMPLE CONTEXT")
            ):
                in_metadata_block = True
            elif "TRANSCRIPT" in header_upper:
                in_metadata_block = False
            continue

        if in_metadata_block:
            continue

        # Never read bulleted character profile lines (e.g., `- Ewan (Voice: Algenib): ...`)
        if line.startswith(("- ", "* ")) and ("(Voice:" in line or "**" in line):
            continue

        # Handle bracketed speaker header on its own line: `[Narrator (Levi)]`
        if line.startswith("[") and line.endswith("]") and ":" not in line:
            inner = line[1:-1].strip()
            if inner.lower() not in (
                "low, voiced", "tight", "breath catch", "heavy breath", "pant",
                "sighs", "gasp", "deep breath", "short pause", "medium pause",
                "long pause", "slow", "groan", "chuckles", "adoration", "interest",
            ) and inner.lower() not in FORBIDDEN_METADATA_SPEAKERS:
                current_speaker = inner
                continue

        # Standard `Speaker: text` line
        m_sp = re.match(r"^([A-Za-z][A-Za-z0-9_ ().'-]{0,28}):\s*(.*)$", line)
        if m_sp:
            candidate_speaker = m_sp.group(1).strip()
            utterance = m_sp.group(2).strip()
            # Filter out metadata keys like `Style:`, `Pace:`, `Accent:`, `Setting:`
            if candidate_speaker.lower() in FORBIDDEN_METADATA_SPEAKERS:
                continue
            current_speaker = candidate_speaker
        else:
            utterance = line

        if not utterance:
            continue

        # Determine pause duration from paralinguistic cues before stripping them
        pause_after = 0.28
        cues = [c.lower().strip() for c in INLINE_CUE_RE.findall(utterance)]
        if any("long pause" in c for c in cues):
            pause_after = 0.75
        elif any("medium pause" in c for c in cues):
            pause_after = 0.50
        elif any(c in ("heavy breath", "deep breath", "sighs", "pant") for c in cues):
            pause_after = 0.40

        # Strip bracketed stage directions so TTS never reads "[low, voiced]" aloud
        cleaned = INLINE_CUE_RE.sub(" ", utterance)
        # Strip quotation marks while preserving internal apostrophes
        cleaned = cleaned.replace('"', " ").replace("“", " ").replace("”", " ")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

        if cleaned:
            turns.append((current_speaker, cleaned, pause_after))

    # 4. Map each speaker to a distinct Kokoro male voice
    speaker_to_kokoro: Dict[str, str] = {}
    used_voices: List[str] = []

    for sp, _, _ in turns:
        if sp in speaker_to_kokoro:
            continue
        gem_voice = speaker_to_gemini.get(sp)
        if not gem_voice and sp == "Narrator":
            for k, v in speaker_to_gemini.items():
                if "narrator" in k.lower():
                    gem_voice = v
                    break
        if gem_voice and gem_voice in GEMINI_TO_KOKORO_VOICE:
            chosen = GEMINI_TO_KOKORO_VOICE[gem_voice]
        else:
            avail = [v for v in KOKORO_MALE_ROTATION if v not in used_voices]
            chosen = avail[0] if avail else KOKORO_MALE_ROTATION[len(speaker_to_kokoro) % len(KOKORO_MALE_ROTATION)]

        speaker_to_kokoro[sp] = chosen
        used_voices.append(chosen)

    return speaker_to_kokoro, turns


def _find_kokoro_python() -> Optional[str]:
    """Finds a Python interpreter that has `kokoro` and `soundfile` installed."""
    try:
        import kokoro  # noqa: F401
        import soundfile  # noqa: F401
        return sys.executable
    except ImportError:
        pass

    for candidate in KOKORO_VENV_CANDIDATES:
        if candidate.exists():
            return str(candidate)
    return None


def _synthesize_with_kokoro_subprocess(
    kokoro_python: str,
    speaker_to_voice: Dict[str, str],
    turns: List[Tuple[str, str, float]],
    output_wav: str,
    speed: float = 0.94,
) -> bool:
    """Runs Kokoro-82M multi-speaker synthesis via the Kokoro Python environment."""
    payload = {
        "speaker_to_voice": speaker_to_voice,
        "turns": turns,
        "output_wav": os.path.abspath(output_wav),
        "speed": speed,
    }

    helper_code = """
import json, sys, numpy as np, soundfile as sf, torch
from kokoro import KPipeline

data = json.loads(sys.stdin.read())
speaker_to_voice = data["speaker_to_voice"]
turns = data["turns"]
output_wav = data["output_wav"]
speed = float(data.get("speed", 0.94))

pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
sample_rate = 24000
segments = []

for speaker, text, pause_sec in turns:
    voice = speaker_to_voice.get(speaker, "am_puck")
    # Adjust speed slightly per voice for natural contrast
    sp_speed = speed * (0.95 if voice in ("am_onyx", "am_adam", "am_michael") else 1.0)
    for _, _, audio in pipe(text, voice=voice, speed=sp_speed):
        if audio is not None and len(audio) > 0:
            arr = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio, dtype=np.float32)
            segments.append(arr)
    if pause_sec > 0:
        segments.append(np.zeros(int(sample_rate * pause_sec), dtype=np.float32))

if not segments:
    sys.exit(2)

full_audio = np.concatenate(segments, axis=0)
sf.write(output_wav, full_audio, sample_rate, subtype="PCM_16")
"""
    venv_dir = str(pathlib.Path(kokoro_python).parent.parent)
    venv_bin = str(pathlib.Path(kokoro_python).parent)
    env = os.environ.copy()
    env["VIRTUAL_ENV"] = venv_dir
    env["PATH"] = f"{venv_bin}:{env.get('PATH', '')}"
    env.setdefault("HF_HOME", "/home/jgf2/mnt/xstore/.cache/huggingface")

    try:
        res = subprocess.run(
            [kokoro_python, "-c", helper_code],
            input=json.dumps(payload),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            timeout=180,
        )
        if res.returncode == 0 and os.path.exists(output_wav) and os.path.getsize(output_wav) > 2000:
            return True
        logger.warning("Kokoro subprocess returned %d: %s", res.returncode, res.stderr[-400:])
    except Exception as e:
        logger.warning("Kokoro synthesis exception: %s", e)
    return False


def _synthesize_with_piper(
    speaker_to_voice: Dict[str, str],
    turns: List[Tuple[str, str, float]],
    output_wav: str,
) -> bool:
    """Fallback local neural synthesis using Piper ONNX (`en_US-ryan-high.onnx`)."""
    piper_bin = next((p for p in PIPER_BIN_CANDIDATES if p and os.path.exists(p)), None)
    ryan_model = PIPER_VOICE_DIR / "en_US-ryan-high.onnx"
    if not piper_bin or not ryan_model.exists():
        return False

    # Assign subtle pitch/rate shifts per speaker so multi-speaker dialogue stays distinct
    speakers = list(speaker_to_voice.keys())
    speaker_pitch: Dict[str, float] = {}
    pitch_presets = [1.0, 0.88, 0.94, 0.84]
    for idx, sp in enumerate(speakers):
        v = speaker_to_voice[sp]
        if v in ("am_onyx", "am_adam", "am_michael"):
            speaker_pitch[sp] = 0.87
        elif v in ("am_fenrir", "am_eric"):
            speaker_pitch[sp] = 0.93
        else:
            speaker_pitch[sp] = pitch_presets[idx % len(pitch_presets)]

    with tempfile.TemporaryDirectory() as tmpdir:
        part_files: List[str] = []
        for idx, (speaker, text, pause_sec) in enumerate(turns):
            raw_turn = os.path.join(tmpdir, f"turn_{idx:03d}_raw.wav")
            proc_turn = os.path.join(tmpdir, f"turn_{idx:03d}.wav")
            res = subprocess.run(
                [
                    piper_bin,
                    "--model", str(ryan_model),
                    "--output_file", raw_turn,
                    "--length_scale", "1.18",
                    "--sentence_silence", "0.40",
                ],
                input=text,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                timeout=60,
            )
            if res.returncode != 0 or not os.path.exists(raw_turn):
                continue

            pitch = speaker_pitch.get(speaker, 1.0)
            pad_ms = max(450, int(pause_sec * 1000))
            af = (
                f"asetrate=22050*{pitch:.3f},aresample=24000,atempo={0.92 / max(0.8, min(1.2, pitch)):.3f},"
                f"apad=pad_dur={pad_ms}ms"
            )
            subprocess.run(
                ["ffmpeg", "-y", "-i", raw_turn, "-af", af, "-ar", "24000", "-ac", "1", proc_turn],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            part_files.append(proc_turn)

        if not part_files:
            return False

        inputs: List[str] = []
        for p in part_files:
            inputs.extend(["-i", p])
        concat_str = "".join(f"[{i}:a]" for i in range(len(part_files)))
        filter_complex = f"{concat_str}concat=n={len(part_files)}:v=0:a=1[outa]"
        subprocess.run(
            ["ffmpeg", "-y", *inputs, "-filter_complex", filter_complex, "-map", "[outa]", "-ar", "24000", "-ac", "1", output_wav],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return os.path.exists(output_wav) and os.path.getsize(output_wav) > 2000


def _synthesize_with_espeak(
    turns: List[Tuple[str, str, float]],
    output_wav: str,
) -> bool:
    """Last-resort spoken speech fallback via espeak-ng (for minimal CI containers)."""
    espeak_bin = shutil.which("espeak-ng") or shutil.which("espeak")
    if not espeak_bin:
        return False

    full_text = " ... ".join(t[1] for t in turns)
    with tempfile.TemporaryDirectory() as tmpdir:
        raw_wav = os.path.join(tmpdir, "espeak_raw.wav")
        subprocess.run(
            [espeak_bin, "-v", "en-us+m3", "-p", "32", "-s", "145", "-w", raw_wav, full_text],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", raw_wav,
                "-af", "highpass=f=80,lowpass=f=6500,volume=-6dB,apad=pad_dur=400ms",
                "-ar", "24000", "-ac", "1", output_wav,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return os.path.exists(output_wav) and os.path.getsize(output_wav) > 1000


def synthesize_speech_local(
    prompt_or_text: str,
    output_wav: str,
    speed: float = 0.94,
    prefer_fast: bool = False,
) -> str:
    """Synthesizes multi-speaker speech to `output_wav` using local neural TTS.

    Priority:
    1. Kokoro-82M multi-speaker neural TTS (unless `prefer_fast=True` and Piper is available)
    2. Piper ONNX neural TTS (`en_US-ryan-high.onnx`)
    3. espeak-ng spoken synthesis
    """
    out_dir = os.path.dirname(output_wav)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    speaker_to_voice, turns = parse_dialogue_turns(prompt_or_text)
    logger.info(
        "Local neural TTS: %d dialogue turns across speakers %s",
        len(turns),
        speaker_to_voice,
    )

    if prefer_fast and _synthesize_with_piper(speaker_to_voice, turns, output_wav):
        logger.info("Synthesized speech via Piper ONNX -> %s", output_wav)
        return output_wav

    kokoro_py = _find_kokoro_python()
    if kokoro_py and _synthesize_with_kokoro_subprocess(
        kokoro_py, speaker_to_voice, turns, output_wav, speed=speed
    ):
        logger.info("Synthesized multi-speaker speech via Kokoro-82M -> %s", output_wav)
        return output_wav

    if _synthesize_with_piper(speaker_to_voice, turns, output_wav):
        logger.info("Synthesized speech via Piper ONNX -> %s", output_wav)
        return output_wav

    if _synthesize_with_espeak(turns, output_wav):
        logger.info("Synthesized speech via espeak-ng -> %s", output_wav)
        return output_wav

    raise RuntimeError("No local TTS engine (Kokoro, Piper, or espeak-ng) succeeded.")
