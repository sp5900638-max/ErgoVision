"""MediaPipe-based posture tracking and landmark metric extraction."""
from typing import Dict, Any, List, Optional, Tuple
import math
import numpy as np
import cv2
import mediapipe as mp


class PostureTracker:
    """Detects human pose landmarks and computes real-time ergonomic posture metrics."""

    def __init__(
        self,
        static_image_mode: bool = False,
        model_complexity: int = 1,
        smooth_landmarks: bool = True,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=static_image_mode,
            model_complexity=model_complexity,
            smooth_landmarks=smooth_landmarks,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    def _calculate_angle_with_horizontal(
        self, p1: Tuple[float, float], p2: Tuple[float, float]
    ) -> float:
        """Calculates absolute angle in degrees between two points relative to the horizontal plane.

        p1: (x1, y1), p2: (x2, y2)
        """
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        if abs(dx) < 1e-6:
            return 90.0
        angle_rad = math.atan(dy / dx)
        return abs(math.degrees(angle_rad))

    def _euclidean_distance(
        self, p1: Tuple[float, float], p2: Tuple[float, float]
    ) -> float:
        """Calculates Euclidean distance between two 2D points."""
        return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)

    def process_frame(
        self, frame_bgr: np.ndarray
    ) -> Dict[str, Any]:
        """Processes a single BGR image frame and extracts posture metrics and landmarks.

        Args:
            frame_bgr: Decoded OpenCV BGR image matrix.

        Returns:
            Dict containing:
                - detected: bool
                - metrics: { head_tilt_angle, shoulder_tilt, slouch_ratio, raw_head_shoulder_distance }
                - landmarks: List of normalized landmark dicts
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return {
                "detected": False,
                "metrics": {
                    "head_tilt_angle": 0.0,
                    "shoulder_tilt": 0.0,
                    "slouch_ratio": 1.0,
                },
                "landmarks": [],
            }

        # Convert OpenCV BGR to RGB for MediaPipe
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        frame_rgb.flags.writeable = False
        results = self.pose.process(frame_rgb)

        if not results.pose_landmarks:
            return {
                "detected": False,
                "metrics": {
                    "head_tilt_angle": 0.0,
                    "shoulder_tilt": 0.0,
                    "slouch_ratio": 1.0,
                },
                "landmarks": [],
            }

        landmarks_raw = results.pose_landmarks.landmark
        landmarks_list: List[Dict[str, Any]] = [
            {
                "id": idx,
                "x": float(lm.x),
                "y": float(lm.y),
                "z": float(lm.z),
                "visibility": float(lm.visibility),
            }
            for idx, lm in enumerate(landmarks_raw)
        ]

        # Key Landmarks:
        # 0: nose, 7: left_ear, 8: right_ear
        # 11: left_shoulder, 12: right_shoulder
        # 23: left_hip, 24: right_hip
        nose = landmarks_raw[0]
        left_ear = landmarks_raw[7]
        right_ear = landmarks_raw[8]
        left_shoulder = landmarks_raw[11]
        right_shoulder = landmarks_raw[12]
        left_hip = landmarks_raw[23]
        right_hip = landmarks_raw[24]

        # 1. Shoulder Tilt Angle
        p_left_sh = (left_shoulder.x, left_shoulder.y)
        p_right_sh = (right_shoulder.x, right_shoulder.y)
        shoulder_tilt = round(self._calculate_angle_with_horizontal(p_left_sh, p_right_sh), 1)

        # 2. Head Tilt Angle (ear-to-ear deviation with horizontal)
        p_left_ear = (left_ear.x, left_ear.y)
        p_right_ear = (right_ear.x, right_ear.y)
        if left_ear.visibility > 0.4 and right_ear.visibility > 0.4:
            head_tilt = round(self._calculate_angle_with_horizontal(p_left_ear, p_right_ear), 1)
        else:
            # Fallback using nose to mid-shoulder vertical angle
            mid_shoulder_x = (left_shoulder.x + right_shoulder.x) / 2.0
            mid_shoulder_y = (left_shoulder.y + right_shoulder.y) / 2.0
            dx = nose.x - mid_shoulder_x
            dy = mid_shoulder_y - nose.y  # screen y is inverted
            if dy > 0:
                head_tilt = round(abs(math.degrees(math.atan2(dx, dy))), 1)
            else:
                head_tilt = 0.0

        # 3. Slouch Distance / Ratio calculation
        # Shoulder span serves as user scale invariant metric
        shoulder_span = max(self._euclidean_distance(p_left_sh, p_right_sh), 0.05)

        # Midpoints
        mid_shoulder_y = (left_shoulder.y + right_shoulder.y) / 2.0
        if left_ear.visibility > 0.3 and right_ear.visibility > 0.3:
            mid_ear_y = (left_ear.y + right_ear.y) / 2.0
        else:
            mid_ear_y = nose.y

        # Vertical distance from head to shoulder girdle (in screen units, shoulder_y > ear_y)
        head_shoulder_vert_dist = max(mid_shoulder_y - mid_ear_y, 0.01)
        raw_slouch_metric = round(head_shoulder_vert_dist / shoulder_span, 3)

        return {
            "detected": True,
            "metrics": {
                "head_tilt_angle": head_tilt,
                "shoulder_tilt": shoulder_tilt,
                "slouch_ratio": raw_slouch_metric,
                "raw_vertical_distance": round(head_shoulder_vert_dist, 4),
                "shoulder_span": round(shoulder_span, 4),
            },
            "landmarks": landmarks_list,
        }

    def close(self):
        """Release MediaPipe resources."""
        if hasattr(self, "pose") and self.pose:
            self.pose.close()
