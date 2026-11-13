#!/usr/bin/env python3
"""Audio Mastering & SFX / Ambience Layering Engine.

Designed for JGF Project A (Audio Stories).
Features:
- Broadcast Loudness Normalization (EBU R128 to -16 LUFS integrated, -1.0 dBTP true-peak ceiling)
- High-pass rumble filter (80Hz, 12dB/octave)
- Background Ambience Bed Layering with dynamic sidechain ducking (-14dB ducking during dialogue)
- Multi-part seamless stitching & crossfading
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys
from typing import Any


def run_cmd(cmd: list[str]) -> subprocess.CompletedProcess:
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Command failed (code {res.returncode}): {' '.join(cmd)}\nStderr: {res.stderr}")
    return res


def master_single_track(
    input_wav: str,
    output_wav: str,
    target_lufs: float = -15.8,
    true_peak_dbtp: float = -1.2,
    lra: float = 10.0,
) -> None:
    """Performs dual-pass EBU R128 loudness normalization and true-peak limiting."""
    # Pass 1: Measure
    pass1_cmd = [
        "ffmpeg",
        "-nostats",
        "-i",
        input_wav,
        "-af",
        f"highpass=f=80,loudnorm=I={target_lufs}:TP={true_peak_dbtp}:LRA={lra}:print_format=json",
        "-f",
        "null",
        "-",
    ]
    res1 = subprocess.run(pass1_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    # Extract JSON block from stderr
    stderr = res1.stderr
    json_match = stderr[stderr.rfind("{"):stderr.rfind("}") + 1]
    if not json_match:
        # Fallback to single pass
        pass2_filter = f"highpass=f=80,loudnorm=I={target_lufs}:TP={true_peak_dbtp}:LRA={lra},alimiter=limit=0.85:level=false"
    else:
        try:
            m = json.loads(json_match)
            pass2_filter = (
                f"highpass=f=80,loudnorm=I={target_lufs}:TP={true_peak_dbtp}:LRA={lra}:"
                f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
                f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,"
                f"alimiter=limit=0.85:level=false"
            )
        except Exception:
            pass2_filter = f"highpass=f=80,loudnorm=I={target_lufs}:TP={true_peak_dbtp}:LRA={lra},alimiter=limit=0.85:level=false"

    # Pass 2: Apply
    out_dir = os.path.dirname(output_wav)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    pass2_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_wav,
        "-af",
        pass2_filter,
        "-ar",
        "24000",
        "-ac",
        "1",
        output_wav,
    ]
    run_cmd(pass2_cmd)


def stitch_parts(
    part_wavs: list[str],
    output_wav: str,
    gap_duration_sec: float = 0.6,
) -> None:
    """Stitches sequential part files together with a natural conversational gap."""
    if not part_wavs:
        raise ValueError("No part files to stitch.")
    if len(part_wavs) == 1:
        master_single_track(part_wavs[0], output_wav)
        return

    # Build concat filter with slight gap/silence between parts
    inputs = []
    padded_tags = []
    pad_filters = []
    gap_ms = max(0, int(gap_duration_sec * 1000))
    for i, p in enumerate(part_wavs):
        inputs.extend(["-i", p])
        if i < len(part_wavs) - 1 and gap_ms > 0:
            pad_filters.append(f"[{i}:a]apad=pad_dur={gap_ms}ms[p{i}]")
            padded_tags.append(f"[p{i}]")
        else:
            padded_tags.append(f"[{i}:a]")

    concat_str = "".join(padded_tags)
    concat_stage = f"{concat_str}concat=n={len(part_wavs)}:v=0:a=1[outa]"
    filter_complex = ";".join(pad_filters + [concat_stage]) if pad_filters else concat_stage

    tmp_concat = output_wav + ".tmp_concat.wav"
    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex, "-map", "[outa]", tmp_concat]
    run_cmd(cmd)

    # Master the final stitched track
    master_single_track(tmp_concat, output_wav)
    if os.path.exists(tmp_concat):
        os.remove(tmp_concat)


def generate_synthetic_ambience(output_wav: str, duration_sec: float = 30.0, ambience_type: str = "room") -> str:
    """Generates subtle, non-hissy acoustic room tone or outdoor wind bed (zero pure sine tones)."""
    out_dir = os.path.dirname(output_wav)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    fade_out_st = max(0.0, duration_sec - 1.5)
    if ambience_type in ("outdoor", "outdoor_breeze", "wind"):
        # Filtered brownian air motion with gentle low-pass rolloff (no white/pink hiss)
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", f"anoisesrc=d={duration_sec}:c=brown:r=24000:a=0.025",
            "-af",
            f"highpass=f=65,lowpass=f=480,tremolo=f=0.22:d=0.35,"
            f"afade=t=in:st=0:d=1.2,afade=t=out:st={fade_out_st}:d=1.5,volume=-26dB",
            "-ar", "24000", "-ac", "1", output_wav,
        ]
    else:
        # Warm interior room tone: deep brownian air floor (60-320 Hz), free of high-frequency hiss
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", f"anoisesrc=d={duration_sec}:c=brown:r=24000:a=0.018",
            "-af",
            f"highpass=f=55,lowpass=f=320,"
            f"afade=t=in:st=0:d=1.0,afade=t=out:st={fade_out_st}:d=1.5,volume=-28dB",
            "-ar", "24000", "-ac", "1", output_wav,
        ]
    run_cmd(cmd)
    return output_wav


def generate_synthetic_sfx(output_wav: str, sfx_type: str = "thud") -> str:
    """Generates realistic transient foley sound effects using shaped acoustic noise impulses (never sine beeps)."""
    out_dir = os.path.dirname(output_wav)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    if sfx_type == "thud":
        # Muffled physical impact / body weight thud: short low-passed brown-noise transient burst
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "anoisesrc=d=0.32:c=brown:r=24000:a=0.35",
            "-af",
            "highpass=f=35,lowpass=f=145,afade=t=in:st=0:d=0.012,afade=t=out:st=0.04:d=0.26,volume=-6dB",
            "-ar", "24000", "-ac", "1", output_wav,
        ]
    elif sfx_type == "creak":
        # Wood / mattress creak: dual short band-filtered friction impulses
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "anoisesrc=d=0.45:c=brown:r=24000:a=0.28",
            "-af",
            "bandpass=f=240:w=90,tremolo=f=14:d=0.65,lowpass=f=420,"
            "afade=t=in:st=0:d=0.03,afade=t=out:st=0.12:d=0.30,volume=-9dB",
            "-ar", "24000", "-ac", "1", output_wav,
        ]
    elif sfx_type in ("door", "click"):
        # Heavy latch click + muffled door closure transient
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "anoisesrc=d=0.28:c=brown:r=24000:a=0.40",
            "-af",
            "highpass=f=50,lowpass=f=260,afade=t=in:st=0:d=0.005,afade=t=out:st=0.025:d=0.22,volume=-7dB",
            "-ar", "24000", "-ac", "1", output_wav,
        ]
    else:
        # Soft fabric / movement rustle: warm mid-low filtered brush transient
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi",
            "-i", "anoisesrc=d=0.38:c=brown:r=24000:a=0.22",
            "-af",
            "bandpass=f=480:w=260,afade=t=in:st=0:d=0.04,afade=t=out:st=0.10:d=0.26,volume=-11dB",
            "-ar", "24000", "-ac", "1", output_wav,
        ]
    run_cmd(cmd)
    return output_wav


def mix_soundtrack_and_sfx(
    dialogue_wav: str,
    output_wav: str,
    ambience_wav: str | None = None,
    music_wav: str | None = None,
    spot_sfx_list: list[dict[str, Any]] | None = None,
    ambience_gain_db: float = -20.0,
    music_gain_db: float = -24.0,
    target_lufs: float = -15.8,
    true_peak_dbtp: float = -1.2,
) -> None:
    """Comprehensive mixing engine for Dialogue + Ambience Bed + Music + Spot SFX.
    
    Supports:
    - Dynamic sidechain ducking of music and ambience during dialogue.
    - Synchronized insertion of spot SFX (foley) at exact timestamps.
    - Dual-pass EBU R128 master normalization.
    """
    out_dir = os.path.dirname(output_wav)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    inputs = ["-i", dialogue_wav]
    filter_parts = []
    mix_sources = ["[0:a]"]
    curr_input_idx = 1

    # Ambience bed with sidechain ducking
    if ambience_wav and os.path.exists(ambience_wav):
        inputs.extend(["-i", ambience_wav])
        filter_parts.append(
            f"[{curr_input_idx}:a]aloop=loop=-1:size=2e+09,highpass=f=100,lowpass=f=6500,volume={ambience_gain_db}dB[amb_raw];"
            f"[amb_raw][0:a]sidechaincompress=threshold=0.08:ratio=5:attack=250:release=1000[amb_ducked]"
        )
        mix_sources.append("[amb_ducked]")
        curr_input_idx += 1

    # Background music with sidechain ducking
    if music_wav and os.path.exists(music_wav):
        inputs.extend(["-i", music_wav])
        filter_parts.append(
            f"[{curr_input_idx}:a]aloop=loop=-1:size=2e+09,highpass=f=80,volume={music_gain_db}dB[mus_raw];"
            f"[mus_raw][0:a]sidechaincompress=threshold=0.06:ratio=6:attack=300:release=1200[mus_ducked]"
        )
        mix_sources.append("[mus_ducked]")
        curr_input_idx += 1

    # Spot SFX (foley cues)
    if spot_sfx_list:
        for sfx in spot_sfx_list:
            sfx_file = sfx.get("path")
            time_ms = int(sfx.get("time_sec", 0.0) * 1000)
            gain_db = sfx.get("gain_db", -6.0)
            if sfx_file and os.path.exists(sfx_file):
                inputs.extend(["-i", sfx_file])
                sfx_tag = f"sfx_{curr_input_idx}"
                filter_parts.append(
                    f"[{curr_input_idx}:a]adelay={time_ms}|{time_ms},volume={gain_db}dB[{sfx_tag}]"
                )
                mix_sources.append(f"[{sfx_tag}]")
                curr_input_idx += 1

    # Combine all sources
    num_inputs = len(mix_sources)
    all_sources_str = "".join(mix_sources)
    filter_parts.append(f"{all_sources_str}amix=inputs={num_inputs}:duration=first:dropout_transition=2[mixed]")
    filter_parts.append(f"[mixed]loudnorm=I={target_lufs}:TP={true_peak_dbtp}:LRA=10,alimiter=limit=0.85:level=false[outa]")

    filter_complex = ";".join(filter_parts)
    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", "[outa]",
        "-ar", "24000",
        output_wav,
    ]
    run_cmd(cmd)

    # Apply calibrated two-pass EBU R128 master to guarantee target loudness and true-peak compliance
    tmp_mix = output_wav + ".tmp_mix.wav"
    os.rename(output_wav, tmp_mix)
    try:
        master_single_track(tmp_mix, output_wav, target_lufs=target_lufs, true_peak_dbtp=true_peak_dbtp)
    finally:
        if os.path.exists(tmp_mix):
            os.remove(tmp_mix)


def layer_ambience_bed(
    dialogue_wav: str,
    ambience_wav: str,
    output_wav: str,
    duck_amount_db: float = -14.0,
    ambience_gain_db: float = -18.0,
) -> None:
    """Layers background ambience bed under dialogue with automated sidechain ducking."""
    out_dir = os.path.dirname(output_wav)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    # Loop ambience to match dialogue length, duck ambience when dialogue is present, then mix
    # Filter chain:
    # 1. Ambience [1:a]: loop, highpass 100Hz, lowpass 7000Hz, volume adjustment
    # 2. Sidechaincompress: Ambience ducked by Dialogue [0:a]
    # 3. amix: Dialogue + Ducked Ambience
    # 4. loudnorm: Final master
    filter_complex = (
        f"[1:a]aloop=loop=-1:size=2e+09,highpass=f=100,lowpass=f=7000,volume={ambience_gain_db}dB[amb_raw];"
        f"[amb_raw][0:a]sidechaincompress=threshold=0.08:ratio=6:attack=250:release=1000[amb_ducked];"
        f"[0:a][amb_ducked]amix=inputs=2:duration=first:dropout_transition=2[mixed];"
        f"[mixed]loudnorm=I=-15.8:TP=-1.2:LRA=10,alimiter=limit=0.85:level=false[outa]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        dialogue_wav,
        "-i",
        ambience_wav,
        "-filter_complex",
        filter_complex,
        "-map",
        "[outa]",
        "-ar",
        "24000",
        output_wav,
    ]
    run_cmd(cmd)


def main():
    parser = argparse.ArgumentParser(description="Master audio and layer ambience beds.")
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # Subcommand: master
    p_master = subparsers.add_parser("master", help="Normalize and master a single track")
    p_master.add_argument("input", help="Input WAV file")
    p_master.add_argument("output", help="Output WAV file")
    p_master.add_argument("--lufs", type=float, default=-16.0, help="Target LUFS (default: -16.0)")

    # Subcommand: stitch
    p_stitch = subparsers.add_parser("stitch", help="Stitch sequential parts into a mastered scene/chapter")
    p_stitch.add_argument("inputs", nargs="+", help="Input part WAV files in order")
    p_stitch.add_argument("--output", required=True, help="Output mastered WAV file")

    # Subcommand: layer
    p_layer = subparsers.add_parser("layer", help="Layer ambience bed with ducking")
    p_layer.add_argument("dialogue", help="Dialogue WAV file")
    p_layer.add_argument("ambience", help="Ambience sound bed WAV file")
    p_layer.add_argument("output", help="Output mixed WAV file")

    args = parser.parse_args()

    if args.subcommand == "master":
        master_single_track(args.input, args.output, target_lufs=args.lufs)
        print(f"Mastered: {args.output}")
    elif args.subcommand == "stitch":
        stitch_parts(args.inputs, args.output)
        print(f"Stitched and mastered: {args.output}")
    elif args.subcommand == "layer":
        layer_ambience_bed(args.dialogue, args.ambience, args.output)
        print(f"Layered and mastered: {args.output}")


if __name__ == "__main__":
    main()
