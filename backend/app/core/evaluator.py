"""Posture evaluator for scoring, status classification, calibration, and session tracking."""
from typing import Dict, Any, Optional
import time


class PostureEvaluator:
    """Evaluates ergonomic posture scores, maintains calibration, tracks session time, and fires alerts."""

    def __init__(
        self,
        alert_consecutive_sec: float = 3.0,
        good_score_threshold: int = 80,
        warning_score_threshold: int = 60,
    ):
        self.alert_consecutive_sec = alert_consecutive_sec
        self.good_score_threshold = good_score_threshold
        self.warning_score_threshold = warning_score_threshold

        # Calibration baselines
        self.is_calibrated: bool = False
        self.baseline_head_tilt: float = 0.0
        self.baseline_shoulder_tilt: float = 0.0
        self.baseline_slouch_metric: float = 0.70  # Typical ratio of head-to-shoulder vert dist / shoulder span

        # Session metrics
        self.good_time_sec: float = 0.0
        self.poor_time_sec: float = 0.0
        self.last_frame_timestamp: Optional[float] = None

        # Alert state tracking
        self.poor_start_timestamp: Optional[float] = None
        self.alert_triggered: bool = False

    def calibrate(self, metrics: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Sets the baseline metrics for head tilt, shoulder tilt, and slouch distance."""
        if metrics:
            self.baseline_head_tilt = float(metrics.get("head_tilt_angle", 0.0))
            self.baseline_shoulder_tilt = float(metrics.get("shoulder_tilt", 0.0))
            raw_slouch = float(metrics.get("slouch_ratio", 0.70))
            # Protect against anomalous values
            if raw_slouch > 0.1:
                self.baseline_slouch_metric = raw_slouch
        self.is_calibrated = True
        return {
            "calibrated": True,
            "baseline_head_tilt": self.baseline_head_tilt,
            "baseline_shoulder_tilt": self.baseline_shoulder_tilt,
            "baseline_slouch_metric": self.baseline_slouch_metric,
        }

    def reset_session(self) -> Dict[str, Any]:
        """Resets session duration and time counters."""
        self.good_time_sec = 0.0
        self.poor_time_sec = 0.0
        self.last_frame_timestamp = None
        self.poor_start_timestamp = None
        self.alert_triggered = False
        return {
            "reset": True,
            "good_time_sec": 0,
            "poor_time_sec": 0,
        }

    def evaluate(self, tracker_result: Dict[str, Any]) -> Dict[str, Any]:
        """Calculates posture score, status, session statistics, and alert states.

        Returns payload conforming to API specifications.
        """
        now = time.time()
        detected = tracker_result.get("detected", False)
        raw_metrics = tracker_result.get("metrics", {})
        landmarks = tracker_result.get("landmarks", [])

        # Time delta tracking for session duration
        delta_sec = 0.0
        if self.last_frame_timestamp is not None:
            raw_delta = now - self.last_frame_timestamp
            # Clamp delta in case of pauses or network lag
            delta_sec = min(max(raw_delta, 0.0), 1.0)
        self.last_frame_timestamp = now

        if not detected:
            # When no person is detected, pause status accumulation
            return {
                "status": "Warning",
                "posture_score": 0,
                "metrics": {
                    "head_tilt_angle": 0.0,
                    "slouch_ratio": 1.0,
                    "shoulder_tilt": 0.0,
                },
                "alert_triggered": False,
                "session_stats": {
                    "good_time_sec": round(self.good_time_sec),
                    "poor_time_sec": round(self.poor_time_sec),
                },
                "landmarks": [],
            }

        head_tilt = float(raw_metrics.get("head_tilt_angle", 0.0))
        shoulder_tilt = float(raw_metrics.get("shoulder_tilt", 0.0))
        raw_slouch = float(raw_metrics.get("slouch_ratio", 0.70))

        # Relative slouch ratio relative to baseline (1.0 = ideal, <0.85 = slouching)
        if self.baseline_slouch_metric > 0:
            slouch_ratio = round(raw_slouch / self.baseline_slouch_metric, 2)
        else:
            slouch_ratio = 1.0

        # Deviations from calibrated baselines
        head_tilt_dev = abs(head_tilt - self.baseline_head_tilt)
        shoulder_tilt_dev = abs(shoulder_tilt - self.baseline_shoulder_tilt)

        # 100-point Posture Scoring algorithm
        score = 100.0

        # Head tilt deduction (e.g. 1.5 pts per degree past 6 degrees)
        if head_tilt_dev > 6.0:
            score -= min((head_tilt_dev - 6.0) * 1.5, 30.0)

        # Shoulder tilt deduction (e.g. 2.0 pts per degree past 4 degrees)
        if shoulder_tilt_dev > 4.0:
            score -= min((shoulder_tilt_dev - 4.0) * 2.0, 30.0)

        # Slouch deduction (slouch_ratio < 0.90 begins deduction)
        if slouch_ratio < 0.92:
            slouch_loss = (0.92 - slouch_ratio) * 100.0 * 1.8
            score -= min(slouch_loss, 40.0)

        posture_score = max(0, min(100, int(round(score))))

        # Status categorization
        if posture_score >= self.good_score_threshold:
            status = "Good"
        elif posture_score >= self.warning_score_threshold:
            status = "Warning"
        else:
            status = "Poor"

        # Session time accumulation
        if status == "Good":
            self.good_time_sec += delta_sec
            self.poor_start_timestamp = None
            self.alert_triggered = False
        else:
            self.poor_time_sec += delta_sec
            if self.poor_start_timestamp is None:
                self.poor_start_timestamp = now
            elif (now - self.poor_start_timestamp) >= self.alert_consecutive_sec:
                self.alert_triggered = True

        return {
            "status": status,
            "posture_score": posture_score,
            "metrics": {
                "head_tilt_angle": round(head_tilt, 1),
                "slouch_ratio": round(slouch_ratio, 2),
                "shoulder_tilt": round(shoulder_tilt, 1),
            },
            "alert_triggered": self.alert_triggered,
            "session_stats": {
                "good_time_sec": round(self.good_time_sec),
                "poor_time_sec": round(self.poor_time_sec),
            },
            "landmarks": landmarks,
        }
