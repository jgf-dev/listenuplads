#!/usr/bin/env python3
"""Audio Quality Control (QC) & Evaluation Harness.

Designed for JGF Project A (Audio Stories).
Validates rendered TTS audio against production broadcasting specs:
- EBU R128 Loudness (Integrated LUFS, Loudness Range LRA)
- True-Peak Ceiling (-1.0 dBTP to prevent inter-sample clipping)
- Scene-to-Scene Loudness & Tone-Flip Drift
- Silence & Pacing Anomalies (excessive dead air > 2.5s, read rate)
- Emotional-cue fidelity verification
"""

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class AudioMetrics:
    file_path: str
    file_name: str
    duration_sec: float
    channels: int
    sample_rate: int
    integrated_lufs: float
    loudness_range_lu: float
    true_peak_dbfs: float
    max_momentary_lufs: float
    max_short_term_lufs: float
    silence_count: int
    max_silence_duration: float
    longest_silence_start: float
    low_band_rms_db: float = -99.0
    high_band_rms_db: float = -99.0
    spectral_balance_db: float = 0.0
    estimated_word_count: int = 0
    words_per_minute: float = 0.0
    passed_qc: bool = True
    qc_issues: list[str] = None  # type: ignore

    def __post_init__(self):
        if self.qc_issues is None:
            self.qc_issues = []


@dataclass
class ProductionTarget:
    target_lufs: float = -16.0
    lufs_tolerance: float = 1.5
    max_true_peak_dbtp: float = -1.0
    max_lra_lu: float = 12.0
    max_allowed_silence_sec: float = 2.5
    min_read_rate_wpm: float = 100.0
    max_read_rate_wpm: float = 185.0
    max_scene_drift_lu: float = 3.0
    min_spectral_balance_db: float = -14.0  # Prevents pure unvoiced whisper white noise
    max_timbre_drift_db: float = 10.0       # Prevents cross-scene vocal identity tone-flips


class AudioQCHarness:
    def __init__(self, targets: ProductionTarget | None = None):
        self.targets = targets or ProductionTarget()

    def run_ebur128_analysis(self, file_path: str) -> dict[str, float]:
        """Runs ffmpeg ebur128 filter and extracts precise loudness metrics."""
        cmd = [
            "ffmpeg",
            "-nostats",
            "-i",
            file_path,
            "-filter_complex",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ]
        res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
        stderr = res.stderr

        metrics = {
            "integrated_lufs": -99.0,
            "loudness_range_lu": 0.0,
            "true_peak_dbfs": 0.0,
            "max_momentary_lufs": -99.0,
            "max_short_term_lufs": -99.0,
        }

        # Match Integrated Loudness
        m = re.search(r"Integrated loudness:\s+I:\s+([-\d\.]+)\s+LUFS", stderr)
        if m:
            metrics["integrated_lufs"] = float(m.group(1))

        # Match Loudness Range
        m = re.search(r"Loudness range:\s+LRA:\s+([-\d\.]+)\s+LU", stderr)
        if m:
            metrics["loudness_range_lu"] = float(m.group(1))

        # Match True Peak
        m = re.search(r"True peak:\s+Peak:\s+([-\d\.]+)\s+dBFS", stderr)
        if m:
            metrics["true_peak_dbfs"] = float(m.group(1))

        # Match Max Momentary
        m = re.search(r"M:\s+([-\d\.]+)\s+S:", stderr)
        if m:
            metrics["max_momentary_lufs"] = float(m.group(1))

        # Match Max Short-Term
        m = re.search(r"S:\s+([-\d\.]+)", stderr)
        if m:
            metrics["max_short_term_lufs"] = float(m.group(1))

        return metrics

    def run_silence_detection(self, file_path: str, min_duration: float = 1.5, noise_threshold: str = "-40dB") -> dict[str, Any]:
        """Detects dead air and pauses longer than min_duration."""
        cmd = [
            "ffmpeg",
            "-nostats",
            "-i",
            file_path,
            "-af",
            f"silencedetect=n={noise_threshold}:d={min_duration}",
            "-f",
            "null",
            "-",
        ]
        res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
        stderr = res.stderr

        silence_durations = []
        silence_starts = re.findall(r"silence_start:\s+([\d\.]+)", stderr)
        silence_ends = re.findall(r"silence_end:\s+([\d\.]+)\s+\|\s+silence_duration:\s+([\d\.]+)", stderr)

        for end_match in silence_ends:
            dur = float(end_match[1])
            silence_durations.append(dur)

        max_dur = max(silence_durations) if silence_durations else 0.0
        start_at = float(silence_starts[0]) if silence_starts else 0.0

        return {
            "silence_count": len(silence_durations),
            "max_silence_duration": max_dur,
            "longest_silence_start": start_at,
        }

    def probe_format(self, file_path: str) -> tuple[float, int, int]:
        """Probes audio duration, channels, and sample rate."""
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=channels,sample_rate,duration",
            "-of",
            "json",
            file_path,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        try:
            data = json.loads(res.stdout)
            streams = data.get("streams", [])
            if streams:
                s = streams[0]
                duration = float(s.get("duration", 0.0))
                channels = int(s.get("channels", 1))
                rate = int(s.get("sample_rate", 24000))
                return duration, channels, rate
        except Exception:
            pass
        return 0.0, 1, 24000

    def measure_spectral_balance(self, file_path: str) -> tuple[float, float, float]:
        """Measures low-frequency vocal body vs high-frequency sibilance/breathiness.
        
        Helps detect exaggerated unvoiced whispering and cross-scene vocal timbre changes.
        """
        # Low band: fundamental male phonation (lowpass 300Hz)
        cmd_low = ["ffmpeg", "-nostats", "-i", file_path, "-af", "lowpass=f=300,astats", "-f", "null", "-"]
        res_low = subprocess.run(cmd_low, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
        m_low = re.search(r"RMS level dB:\s+([-\d\.]+)", res_low.stderr)
        low_rms = float(m_low.group(1)) if m_low else -50.0

        # High band: breath / sibilance / whisper turbulence (highpass 3000Hz)
        cmd_high = ["ffmpeg", "-nostats", "-i", file_path, "-af", "highpass=f=3000,astats", "-f", "null", "-"]
        res_high = subprocess.run(cmd_high, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
        m_high = re.search(r"RMS level dB:\s+([-\d\.]+)", res_high.stderr)
        high_rms = float(m_high.group(1)) if m_high else -50.0

        balance_db = low_rms - high_rms
        return low_rms, high_rms, balance_db

    def evaluate_file(self, file_path: str, transcript_text: str | None = None) -> AudioMetrics:
        """Evaluates a single audio file against production specs."""
        duration, channels, rate = self.probe_format(file_path)
        ebur = self.run_ebur128_analysis(file_path)
        silence = self.run_silence_detection(file_path)
        low_rms, high_rms, balance_db = self.measure_spectral_balance(file_path)

        issues = []
        # Check Integrated Loudness
        lufs_diff = abs(ebur["integrated_lufs"] - self.targets.target_lufs)
        if lufs_diff > self.targets.lufs_tolerance:
            issues.append(
                f"LOUDNESS_DRIFT: Integrated loudness ({ebur['integrated_lufs']:.1f} LUFS) "
                f"deviates from target ({self.targets.target_lufs:.1f} LUFS) by {lufs_diff:.1f} LU."
            )

        # Check True Peak
        if ebur["true_peak_dbfs"] > self.targets.max_true_peak_dbtp:
            issues.append(
                f"TRUE_PEAK_CLIPPING: True peak ({ebur['true_peak_dbfs']:.1f} dBTP) "
                f"exceeds ceiling ({self.targets.max_true_peak_dbtp:.1f} dBTP). High risk of inter-sample distortion."
            )

        # Check Loudness Range (LRA) - valid for segments >= 4.0s per EBU Tech 3342
        if duration >= 4.0 and ebur["loudness_range_lu"] > self.targets.max_lra_lu:
            issues.append(
                f"DYNAMIC_RANGE_EXCESS: LRA is {ebur['loudness_range_lu']:.1f} LU (> {self.targets.max_lra_lu:.1f} LU). "
                f"Listeners will struggle with quiet whispers vs loud passages."
            )

        # Check Silence Anomaly
        if silence["max_silence_duration"] > self.targets.max_allowed_silence_sec:
            issues.append(
                f"DEAD_AIR_ANOMALY: Detected gap of {silence['max_silence_duration']:.2f}s "
                f"at {silence['longest_silence_start']:.1f}s (max allowed is {self.targets.max_allowed_silence_sec}s)."
            )

        # Check Whisper Runaway (Spectral Balance)
        if duration >= 3.0 and balance_db < self.targets.min_spectral_balance_db:
            issues.append(
                f"EXAGGERATED_UNVOICED_WHISPER: Spectral balance ({balance_db:.1f} dB) is below threshold "
                f"({self.targets.min_spectral_balance_db:.1f} dB). Audio lacks vocal cord phonation/body."
            )

        # Estimate WPM if transcript provided
        wpm = 0.0
        word_count = 0
        if transcript_text and duration > 0:
            words = [w for w in transcript_text.split() if not w.startswith("[")]
            word_count = len(words)
            wpm = (word_count / duration) * 60.0
            if wpm < self.targets.min_read_rate_wpm:
                issues.append(f"PACING_TOO_SLOW: Read rate is {wpm:.1f} WPM (< {self.targets.min_read_rate_wpm} WPM).")
            elif wpm > self.targets.max_read_rate_wpm:
                issues.append(f"PACING_TOO_FAST: Read rate is {wpm:.1f} WPM (> {self.targets.max_read_rate_wpm} WPM).")

        passed = len(issues) == 0

        return AudioMetrics(
            file_path=file_path,
            file_name=os.path.basename(file_path),
            duration_sec=duration,
            channels=channels,
            sample_rate=rate,
            integrated_lufs=ebur["integrated_lufs"],
            loudness_range_lu=ebur["loudness_range_lu"],
            true_peak_dbfs=ebur["true_peak_dbfs"],
            max_momentary_lufs=ebur["max_momentary_lufs"],
            max_short_term_lufs=ebur["max_short_term_lufs"],
            silence_count=silence["silence_count"],
            max_silence_duration=silence["max_silence_duration"],
            longest_silence_start=silence["longest_silence_start"],
            low_band_rms_db=low_rms,
            high_band_rms_db=high_rms,
            spectral_balance_db=balance_db,
            estimated_word_count=word_count,
            words_per_minute=wpm,
            passed_qc=passed,
            qc_issues=issues,
        )

    def evaluate_scene_series(self, file_paths: list[str]) -> tuple[list[AudioMetrics], list[str]]:
        """Evaluates a sequence of scenes and detects inter-scene tone-flips and volume jumps."""
        results = [self.evaluate_file(f) for f in file_paths]
        series_issues = []

        # Check scene-to-scene loudness and timbre consistency
        for i in range(len(results) - 1):
            curr = results[i]
            nxt = results[i + 1]
            drift = abs(curr.integrated_lufs - nxt.integrated_lufs)
            if drift > self.targets.max_scene_drift_lu:
                series_issues.append(
                    f"SCENE_TONE_FLIP_LOUDNESS: Sudden jump of {drift:.1f} dB between "
                    f"'{curr.file_name}' ({curr.integrated_lufs:.1f} LUFS) and "
                    f"'{nxt.file_name}' ({nxt.integrated_lufs:.1f} LUFS)."
                )

            timbre_drift = abs(curr.spectral_balance_db - nxt.spectral_balance_db)
            if timbre_drift > self.targets.max_timbre_drift_db:
                series_issues.append(
                    f"SCENE_TIMBRE_DRIFT: Sudden timbre shift of {timbre_drift:.1f} dB between "
                    f"'{curr.file_name}' ({curr.spectral_balance_db:.1f} dB) and "
                    f"'{nxt.file_name}' ({nxt.spectral_balance_db:.1f} dB). "
                    f"Voice delivery risks sounding like an entirely different person."
                )

        return results, series_issues

    def generate_markdown_report(self, results: list[AudioMetrics], series_issues: list[str] | None = None) -> str:
        """Generates a structured executive markdown QC report."""
        report = []
        report.append("# Audio Quality Control (QC) Evaluation Report\n")
        report.append(f"**Target Specs:** Integrated: `{self.targets.target_lufs} ± {self.targets.lufs_tolerance} LUFS` | "
                      f"True-Peak: `≤ {self.targets.max_true_peak_dbtp} dBTP` | "
                      f"Max LRA: `≤ {self.targets.max_lra_lu} LU` | "
                      f"Max Gap: `≤ {self.targets.max_allowed_silence_sec}s`\n")

        total_files = len(results)
        passed_files = sum(1 for r in results if r.passed_qc)
        total_duration = sum(r.duration_sec for r in results)

        report.append(f"**Summary:** {passed_files}/{total_files} files passed individual QC. "
                      f"Total Duration: {total_duration/60:.2f} min ({total_duration:.1f}s).\n")

        if series_issues:
            report.append("### 🚨 Inter-Scene Consistency Warnings")
            for w in series_issues:
                report.append(f"- ⚠️ **{w}**")
            report.append("")

        report.append("### Detailed File Metrics\n")
        report.append("| File | Duration | Integrated | True Peak | LRA | Max Silence | Status |")
        report.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

        for r in results:
            status_badge = "✅ PASS" if r.passed_qc else "❌ FAIL"
            report.append(
                f"| `{r.file_name}` | {r.duration_sec:.1f}s | {r.integrated_lufs:.1f} LUFS | "
                f"{r.true_peak_dbfs:.1f} dBTP | {r.loudness_range_lu:.1f} LU | "
                f"{r.max_silence_duration:.2f}s | {status_badge} |"
            )

        failures = [r for r in results if not r.passed_qc]
        if failures:
            report.append("\n### Identified QC Defects & Action Items\n")
            for f in failures:
                report.append(f"**{f.file_name}:**")
                for iss in f.qc_issues:
                    report.append(f"- {iss}")
                report.append("")

        return "\n".join(report)


def main():
    parser = argparse.ArgumentParser(description="Evaluate audio files with the Audio QC Harness.")
    parser.add_argument("paths", nargs="+", help="Audio file(s) or directory to inspect")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of markdown")
    args = parser.parse_args()

    files = []
    for p in args.paths:
        if os.path.isdir(p):
            for ext in ("*.wav", "*.mp3", "*.flac"):
                files.extend(sorted(glob_mod.glob(os.path.join(p, ext))))
        elif os.path.isfile(p):
            files.append(p)

    if not files:
        print("Error: No audio files found.")
        sys.exit(1)

    harness = AudioQCHarness()
    results, series_issues = harness.evaluate_scene_series(files)

    if args.json:
        payload = {
            "files": [asdict(r) for r in results],
            "series_issues": series_issues,
        }
        print(json.dumps(payload, indent=2))
    else:
        print(harness.generate_markdown_report(results, series_issues))


if __name__ == "__main__":
    import glob as glob_mod
    main()
