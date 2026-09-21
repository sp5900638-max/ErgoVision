"""Posture evaluator with angled/frontal math, confidence filtering, and 5s alert grace period."""
from typing import Dict, Any, Optional
import time


class PostureEvaluator:
    """Evaluates ergonomic posture scores with support for frontal and angled viewpoints,

    enforces a 5-second alert grace window, and ignores low-confidence frames.
    """

    def __init__(
        self,
        alert_consecutive_sec: float = 5.0,
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
        self.baseline_vertical_slouch: float = 0.65  # Vertical distance / shoulder span
        self.baseline_ear_shoulder_angle: float = 12.0  # Angle of ear-shoulder vector with vertical

        # Session metrics
        self.good_time_sec: float = 0.0
        self.poor_time_sec: float = 0.0
        self.last_frame_timestamp: Optional[float] = None

        # Alert state tracking (requires 5 consecutive seconds of poor posture)
        self.poor_start_timestamp: Optional[float] = None
        self.alert_triggered: bool = False

        # Last valid evaluation state to preserve continuity during low-confidence frames
        self.last_valid_evaluation: Optional[Dict[str, Any]] = None

    def calibrate(self, metrics: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Sets baseline calibration metrics from user's current seated upright posture."""
        if metrics:
            self.baseline_head_tilt = float(metrics.get("head_tilt_angle", 0.0))
            self.baseline_shoulder_tilt = float(metrics.get("shoulder_tilt", 0.0))

            vert_slouch = float(metrics.get("vertical_slouch_ratio", metrics.get("slouch_ratio", 0.65)))
            if vert_slouch > 0.1:
                self.baseline_vertical_slouch = vert_slouch

            ear_sh_angle = float(metrics.get("ear_shoulder_angle", 12.0))
            if ear_sh_angle >= 0.0:
                self.baseline_ear_shoulder_angle = ear_sh_angle

        self.is_calibrated = True
        return {
            "calibrated": True,
            "baseline_head_tilt": self.baseline_head_tilt,
            "baseline_shoulder_tilt": self.baseline_shoulder_tilt,
            "baseline_vertical_slouch": self.baseline_vertical_slouch,
            "baseline_ear_shoulder_angle": self.baseline_ear_shoulder_angle,
        }

    def reset_session(self) -> Dict[str, Any]:
        """Resets session duration counters and alert states."""
        self.good_time_sec = 0.0
        self.poor_time_sec = 0.0
        self.last_frame_timestamp = None
        self.poor_start_timestamp = None
        self.alert_triggered = False
        self.last_valid_evaluation = None
        return {
            "reset": True,
            "good_time_sec": 0,
            "poor_time_sec": 0,
        }

    def evaluate(self, tracker_result: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluates posture metrics.

        - Ignores frames where detection confidence < 0.6.
        - Supports both frontal and angled viewpoints.
        - Requires 5 consecutive seconds of poor posture before triggering alerts.
        """
        now = time.time()
        detected = tracker_result.get("detected", False)
        confidence_sufficient = tracker_result.get("confidence_sufficient", True)

        # 1. Ignore frames where landmark detection confidence falls below 0.6 or no person detected
        if not detected or not confidence_sufficient:
            # When ignoring low-confidence frame, do not falsely penalize user or flip alert
            if self.last_valid_evaluation is not None:
                # Retain previous stable reading and update session stats
                return {
                    **self.last_valid_evaluation,
                    "session_stats": {
                        "good_time_sec": round(self.good_time_sec),
                        "poor_time_sec": round(self.poor_time_sec),
                    },
                    "alert_triggered": self.alert_triggered,
                }
            # Fallback if no valid frame has ever been received
            return {
                "status": "Good",
                "posture_score": 100,
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

        # 2. Time delta tracking for session duration
        delta_sec = 0.0
        if self.last_frame_timestamp is not None:
            raw_delta = now - self.last_frame_timestamp
            delta_sec = min(max(raw_delta, 0.0), 1.0)
        self.last_frame_timestamp = now

        raw_metrics = tracker_result.get("metrics", {})
        landmarks = tracker_result.get("landmarks", [])
        is_angled_view = tracker_result.get("is_angled_view", False)

        head_tilt = float(raw_metrics.get("head_tilt_angle", 0.0))
        shoulder_tilt = float(raw_metrics.get("shoulder_tilt", 0.0))
        vert_slouch = float(raw_metrics.get("vertical_slouch_ratio", raw_metrics.get("slouch_ratio", 0.65)))
        ear_sh_angle = float(raw_metrics.get("ear_shoulder_angle", 12.0))

        # 3. Posture Evaluation Supporting Frontal and Angled Views
        # A. Slouch Ratio (normalized vs baseline, 1.0 = upright, <0.88 = slouching)
        if self.baseline_vertical_slouch > 0:
            vert_ratio = round(vert_slouch / self.baseline_vertical_slouch, 2)
        else:
            vert_ratio = 1.0

        # In angled views, forward head posture increases ear_sh_angle
        ear_angle_dev = max(0.0, ear_sh_angle - self.baseline_ear_shoulder_angle)

        if is_angled_view:
            # Blend vertical ratio and ear-shoulder forward projection
            slouch_factor = vert_ratio - (ear_angle_dev / 80.0)
            slouch_ratio = round(max(0.2, min(1.2, slouch_factor)), 2)
        else:
            slouch_ratio = vert_ratio

        # Deviations from calibrated baselines
        head_tilt_dev = abs(head_tilt - self.baseline_head_tilt)
        shoulder_tilt_dev = abs(shoulder_tilt - self.baseline_shoulder_tilt)

        # 4. Posture Scoring (0 to 100)
        score = 100.0

        # Head tilt deduction
        if head_tilt_dev > 7.0:
            score -= min((head_tilt_dev - 7.0) * 1.5, 30.0)

        # Shoulder tilt deduction (more forgiving in angled views due to perspective foreshortening)
        shoulder_tolerance = 8.0 if is_angled_view else 5.0
        if shoulder_tilt_dev > shoulder_tolerance:
            score -= min((shoulder_tilt_dev - shoulder_tolerance) * 1.8, 25.0)

        # Slouch deduction
        if slouch_ratio < 0.90:
            loss = (0.90 - slouch_ratio) * 100.0 * 2.0
            score -= min(loss, 45.0)

        posture_score = max(0, min(100, int(round(score))))

        # 5. Status Categorization
        if posture_score >= self.good_score_threshold:
            status = "Good"
        elif posture_score >= self.warning_score_threshold:
            status = "Warning"
        else:
            status = "Poor"

        # 6. Session Timers and 5-Second Alert Grace Window
        if status == "Good":
            self.good_time_sec += delta_sec
            self.poor_start_timestamp = None
            self.alert_triggered = False
        elif status == "Warning":
            self.poor_time_sec += delta_sec
            # Warnings do not escalate to full alert_triggered unless continuously Poor
            self.poor_start_timestamp = None
            self.alert_triggered = False
        else:  # Status == "Poor"
            self.poor_time_sec += delta_sec
            if self.poor_start_timestamp is None:
                self.poor_start_timestamp = now
            elif (now - self.poor_start_timestamp) >= self.alert_consecutive_sec:
                # 5 consecutive seconds of poor posture reached
                self.alert_triggered = True

        evaluation = {
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

        self.last_valid_evaluation = evaluation
        return evaluation
