"""MediaPipe-based posture tracking with model complexity 2 and EMA temporal smoothing."""
from typing import Dict, Any, List, Optional, Tuple
import math
import numpy as np
import cv2
import mediapipe as mp


class PostureTracker:
    """Detects human pose landmarks with high complexity, temporal EMA smoothing,

    and robust angled/frontal posture metric extraction.
    """

    def __init__(
        self,
        static_image_mode: bool = False,
        model_complexity: int = 2,
        smooth_landmarks: bool = True,
        min_detection_confidence: float = 0.6,
        min_tracking_confidence: float = 0.6,
        ema_alpha: float = 0.35,
    ):
        self.model_complexity = model_complexity
        self.smooth_landmarks = smooth_landmarks
        self.min_detection_confidence = min_detection_confidence
        self.min_tracking_confidence = min_tracking_confidence
        self.ema_alpha = ema_alpha

        # MediaPipe Pose instance with resilient import fallback
        self.mp_pose = None
        self.pose = None
        try:
            import mediapipe.python.solutions.pose as mp_pose
            self.mp_pose = mp_pose
            self.pose = self.mp_pose.Pose(
                static_image_mode=static_image_mode,
                model_complexity=model_complexity,
                smooth_landmarks=smooth_landmarks,
                min_detection_confidence=min_detection_confidence,
                min_tracking_confidence=min_tracking_confidence,
            )
        except Exception:
            try:
                import mediapipe as mp
                if hasattr(mp, "solutions") and hasattr(mp.solutions, "pose"):
                    self.mp_pose = mp.solutions.pose
                    self.pose = self.mp_pose.Pose(
                        static_image_mode=static_image_mode,
                        model_complexity=model_complexity,
                        smooth_landmarks=smooth_landmarks,
                        min_detection_confidence=min_detection_confidence,
                        min_tracking_confidence=min_tracking_confidence,
                    )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("MediaPipe Pose solutions not initialized: %s", e)

        # Temporal EMA filter state: { landmark_id: (x, y, z) }
        self.ema_landmarks: Optional[Dict[int, Tuple[float, float, float]]] = None

    def reset_smoothing(self) -> None:
        """Clears the temporal smoothing state (e.g. on stream restart)."""
        self.ema_landmarks = None

    def _apply_ema_smoothing(
        self, landmarks_raw: Any
    ) -> List[Dict[str, Any]]:
        """Applies Exponential Moving Average (EMA) smoothing to all landmark coordinates.

        S_t = alpha * P_t + (1 - alpha) * S_{t-1}
        """
        smoothed_list: List[Dict[str, Any]] = []
        new_ema: Dict[int, Tuple[float, float, float]] = {}

        is_initial = self.ema_landmarks is None

        for idx, lm in enumerate(landmarks_raw):
            raw_x, raw_y, raw_z = float(lm.x), float(lm.y), float(lm.z)
            visibility = float(lm.visibility)

            if is_initial or idx not in self.ema_landmarks:
                smoothed_x = raw_x
                smoothed_y = raw_y
                smoothed_z = raw_z
            else:
                prev_x, prev_y, prev_z = self.ema_landmarks[idx]
                smoothed_x = self.ema_alpha * raw_x + (1.0 - self.ema_alpha) * prev_x
                smoothed_y = self.ema_alpha * raw_y + (1.0 - self.ema_alpha) * prev_y
                smoothed_z = self.ema_alpha * raw_z + (1.0 - self.ema_alpha) * prev_z

            new_ema[idx] = (smoothed_x, smoothed_y, smoothed_z)
            smoothed_list.append({
                "id": idx,
                "x": smoothed_x,
                "y": smoothed_y,
                "z": smoothed_z,
                "visibility": visibility,
            })

        self.ema_landmarks = new_ema
        return smoothed_list

    def _calculate_angle_with_horizontal(
        self, p1: Tuple[float, float], p2: Tuple[float, float]
    ) -> float:
        """Calculates absolute angle in degrees between two points relative to the horizontal plane."""
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        if abs(dx) < 1e-6:
            return 90.0
        angle_rad = math.atan(dy / dx)
        return abs(math.degrees(angle_rad))

    def _euclidean_distance_2d(
        self, p1: Tuple[float, float], p2: Tuple[float, float]
    ) -> float:
        """Calculates 2D Euclidean distance."""
        return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)

    def _euclidean_distance_3d(
        self, p1: Tuple[float, float, float], p2: Tuple[float, float, float]
    ) -> float:
        """Calculates 3D Euclidean distance."""
        return math.sqrt(
            (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2 + (p1[2] - p2[2]) ** 2
        )

    def process_frame(self, frame_bgr: np.ndarray) -> Dict[str, Any]:
        """Processes a BGR image frame and extracts posture metrics and smoothed landmarks.

        Frames with landmark detection confidence below 0.6 are flagged.
        """
        if not self.pose or frame_bgr is None or frame_bgr.size == 0:
            return {
                "detected": False,
                "confidence": 0.0,
                "confidence_sufficient": False,
                "metrics": {
                    "head_tilt_angle": 0.0,
                    "shoulder_tilt": 0.0,
                    "slouch_ratio": 1.0,
                    "ear_shoulder_angle": 0.0,
                    "vertical_slouch_ratio": 1.0,
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
                "confidence": 0.0,
                "confidence_sufficient": False,
                "metrics": {
                    "head_tilt_angle": 0.0,
                    "shoulder_tilt": 0.0,
                    "slouch_ratio": 1.0,
                    "ear_shoulder_angle": 0.0,
                    "vertical_slouch_ratio": 1.0,
                },
                "landmarks": [],
            }

        landmarks_raw = results.pose_landmarks.landmark

        # Key landmark indices:
        # 0: Nose, 7: Left Ear, 8: Right Ear, 9: Mouth Left, 10: Mouth Right
        # 11: Left Shoulder, 12: Right Shoulder
        # 23: Left Hip, 24: Right Hip
        key_indices = [0, 7, 8, 11, 12]
        key_visibilities = [float(landmarks_raw[i].visibility) for i in key_indices]
        mean_confidence = sum(key_visibilities) / len(key_visibilities)

        # Ignore frames where key landmark confidence falls below 0.6
        if mean_confidence < 0.60:
            return {
                "detected": False,
                "confidence": round(mean_confidence, 2),
                "confidence_sufficient": False,
                "metrics": {
                    "head_tilt_angle": 0.0,
                    "shoulder_tilt": 0.0,
                    "slouch_ratio": 1.0,
                    "ear_shoulder_angle": 0.0,
                    "vertical_slouch_ratio": 1.0,
                },
                "landmarks": [],
            }

        # Apply Exponential Moving Average (EMA) smoothing (alpha=0.35)
        smoothed_landmarks = self._apply_ema_smoothing(landmarks_raw)

        # Helper mapping for smoothed coordinates: id -> (x, y, z, vis)
        lm_map = {
            lm["id"]: (lm["x"], lm["y"], lm["z"], lm["visibility"])
            for lm in smoothed_landmarks
        }

        nose = lm_map[0]
        left_ear = lm_map[7]
        right_ear = lm_map[8]
        mouth_l = lm_map.get(9, nose)
        mouth_r = lm_map.get(10, nose)
        left_shoulder = lm_map[11]
        right_shoulder = lm_map[12]

        # 1. Shoulder Tilt Angle (degrees with horizontal)
        p_l_sh_2d = (left_shoulder[0], left_shoulder[1])
        p_r_sh_2d = (right_shoulder[0], right_shoulder[1])
        shoulder_tilt = round(self._calculate_angle_with_horizontal(p_l_sh_2d, p_r_sh_2d), 1)

        # 2. Head Tilt Angle (degrees with horizontal)
        p_l_ear_2d = (left_ear[0], left_ear[1])
        p_r_ear_2d = (right_ear[0], right_ear[1])
        if left_ear[3] > 0.5 and right_ear[3] > 0.5:
            head_tilt = round(self._calculate_angle_with_horizontal(p_l_ear_2d, p_r_ear_2d), 1)
        else:
            # Fallback for angled/partial profile view using nose-to-mid-shoulder lateral offset
            mid_sh_x = (left_shoulder[0] + right_shoulder[0]) / 2.0
            mid_sh_y = (left_shoulder[1] + right_shoulder[1]) / 2.0
            dx = nose[0] - mid_sh_x
            dy = mid_sh_y - nose[1]
            if dy > 0:
                head_tilt = round(abs(math.degrees(math.atan2(dx, dy))), 1)
            else:
                head_tilt = 0.0

        # 3. Slouch Calculations Supporting Both Frontal & Angled Views:
        # A. Perspective-invariant scale reference (3D shoulder span)
        p_l_sh_3d = (left_shoulder[0], left_shoulder[1], left_shoulder[2])
        p_r_sh_3d = (right_shoulder[0], right_shoulder[1], right_shoulder[2])
        shoulder_span_3d = max(self._euclidean_distance_3d(p_l_sh_3d, p_r_sh_3d), 0.05)
        shoulder_span_2d = max(self._euclidean_distance_2d(p_l_sh_2d, p_r_sh_2d), 0.05)

        # Determine if view is angled (foreshortened 2D shoulders or large z-depth difference)
        is_angled_view = (abs(left_shoulder[2] - right_shoulder[2]) > 0.12) or (shoulder_span_2d / shoulder_span_3d < 0.70)

        # B. Vertical drop: nose/chin to shoulder midpoint
        # Use mouth/chin midpoint if visible, else nose
        if mouth_l[3] > 0.5 and mouth_r[3] > 0.5:
            chin_y = (mouth_l[1] + mouth_r[1]) / 2.0
        else:
            chin_y = nose[1]

        mid_shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2.0
        head_vert_drop = max(mid_shoulder_y - chin_y, 0.01)
        vertical_slouch_ratio = round(head_vert_drop / shoulder_span_3d, 3)

        # C. Ear-Shoulder Angle (Profile / Angled Forward Head Displacement)
        # Calculates angle from vertical for the ear-to-shoulder vector
        angle_left = 0.0
        angle_right = 0.0
        if left_ear[3] > 0.4 and left_shoulder[3] > 0.4:
            dx_l = abs(left_ear[0] - left_shoulder[0])
            dy_l = max(left_shoulder[1] - left_ear[1], 0.001)
            angle_left = math.degrees(math.atan2(dx_l, dy_l))

        if right_ear[3] > 0.4 and right_shoulder[3] > 0.4:
            dx_r = abs(right_ear[0] - right_shoulder[0])
            dy_r = max(right_shoulder[1] - right_ear[1], 0.001)
            angle_right = math.degrees(math.atan2(dx_r, dy_r))

        # Select most confident side or average
        if left_ear[3] > right_ear[3] + 0.2:
            ear_shoulder_angle = round(angle_left, 1)
        elif right_ear[3] > left_ear[3] + 0.2:
            ear_shoulder_angle = round(angle_right, 1)
        else:
            ear_shoulder_angle = round((angle_left + angle_right) / 2.0, 1)

        # D. Unified Slouch Metric
        # If in angled view, ear_shoulder_angle provides direct forward-head signal;
        # In frontal view, vertical drop ratio is the primary indicator.
        # We normalize both around 1.0 (where 1.0 is upright).
        raw_slouch_metric = vertical_slouch_ratio

        return {
            "detected": True,
            "confidence": round(mean_confidence, 2),
            "confidence_sufficient": True,
            "is_angled_view": is_angled_view,
            "metrics": {
                "head_tilt_angle": head_tilt,
                "shoulder_tilt": shoulder_tilt,
                "slouch_ratio": raw_slouch_metric,
                "vertical_slouch_ratio": vertical_slouch_ratio,
                "ear_shoulder_angle": ear_shoulder_angle,
                "shoulder_span_3d": round(shoulder_span_3d, 4),
            },
            "landmarks": smoothed_landmarks,
        }

    def close(self):
        """Release MediaPipe resources."""
        if hasattr(self, "pose") and self.pose:
            self.pose.close()
