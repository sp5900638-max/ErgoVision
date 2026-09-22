"""3D Kinematics and RULA Ergonomic Evaluation Engine."""
from typing import Tuple, Dict, Any
import math


def euclidean_distance_3d(
    p1: Tuple[float, float, float], p2: Tuple[float, float, float]
) -> float:
    """Calculates Euclidean distance between two 3D points."""
    return math.sqrt(
        (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2 + (p1[2] - p2[2]) ** 2
    )


def calculate_cva_3d(
    tragus: Tuple[float, float, float], c7_mid_shoulder: Tuple[float, float, float]
) -> float:
    """Calculates the Craniovertebral Angle (CVA) in 3D world space.

    Formed by the horizontal plane through C7/mid-shoulder and the tragus-to-C7 line.
    Normal upright CVA is >= 50 degrees; forward head posture drops < 45-50 degrees.
    """
    dx = tragus[0] - c7_mid_shoulder[0]
    dy = c7_mid_shoulder[1] - tragus[1]  # In standard coordinates, head Y is higher (smaller value)
    dz = tragus[2] - c7_mid_shoulder[2]

    # Horizontal plane projection distance
    d_horizontal = math.sqrt(dx * dx + dz * dz)
    if d_horizontal < 1e-6:
        return 90.0

    angle_rad = math.atan2(abs(dy), d_horizontal)
    cva_deg = math.degrees(angle_rad)
    return round(cva_deg, 1)


def calculate_shoulder_tilt_3d(
    left_shoulder: Tuple[float, float, float], right_shoulder: Tuple[float, float, float]
) -> float:
    """Calculates horizontal tilt angle between left and right shoulders."""
    dx = right_shoulder[0] - left_shoulder[0]
    dy = right_shoulder[1] - left_shoulder[1]
    if abs(dx) < 1e-6:
        return 90.0
    tilt_rad = math.atan(dy / dx)
    return round(abs(math.degrees(tilt_rad)), 1)


def calculate_trunk_angle_3d(
    mid_hip: Tuple[float, float, float], mid_shoulder: Tuple[float, float, float]
) -> float:
    """Calculates spine trunk angle deviation relative to the vertical axis (0, 1, 0)."""
    dx = mid_shoulder[0] - mid_hip[0]
    dy = mid_hip[1] - mid_shoulder[1]  # Height
    dz = mid_shoulder[2] - mid_hip[2]

    norm = math.sqrt(dx * dx + dy * dy + dz * dz)
    if norm < 1e-6:
        return 0.0

    # Angle with vertical axis
    cos_theta = max(-1.0, min(1.0, abs(dy) / norm))
    trunk_angle_rad = math.acos(cos_theta)
    return round(math.degrees(trunk_angle_rad), 1)


def compute_rula_score(
    cva_deg: float, trunk_angle_deg: float, shoulder_tilt_deg: float
) -> Dict[str, Any]:
    """Maps Craniovertebral Angle (CVA), trunk angle, and shoulder tilt to standard RULA scores (1–7).

    Returns:
        {
            "rula_score": int (1..7),
            "risk_level": str,
            "action_required": str,
            "color": str
        }
    """
    # 1. Neck score from CVA
    if cva_deg >= 52.0:
        neck_score = 1
    elif cva_deg >= 45.0:
        neck_score = 2
    elif cva_deg >= 38.0:
        neck_score = 3
    else:
        neck_score = 4

    # 2. Trunk flexion score
    if trunk_angle_deg <= 8.0:
        trunk_score = 1
    elif trunk_angle_deg <= 16.0:
        trunk_score = 2
    elif trunk_angle_deg <= 28.0:
        trunk_score = 3
    else:
        trunk_score = 4

    # 3. Shoulder / Upper body alignment score
    if shoulder_tilt_deg <= 4.0:
        shoulder_score = 1
    elif shoulder_tilt_deg <= 10.0:
        shoulder_score = 2
    else:
        shoulder_score = 3

    # Composite RULA mapping
    combined = max(neck_score, trunk_score)
    if shoulder_score > 1:
        combined += 1
    if neck_score >= 3 and trunk_score >= 3:
        combined += 1

    rula = max(1, min(7, combined))

    if rula <= 2:
        risk_level = "Acceptable"
        action = "Posture is acceptable if not maintained for prolonged periods."
        color = "#10b981"  # Emerald
    elif rula <= 4:
        risk_level = "Further Investigation"
        action = "Further investigation needed; minor adjustments recommended."
        color = "#f59e0b"  # Amber
    elif rula <= 6:
        risk_level = "Change Soon"
        action = "Investigation and changes required soon to avoid strain."
        color = "#f97316"  # Orange
    else:
        risk_level = "Immediate Action"
        action = "Immediate postural intervention and ergonomic changes required."
        color = "#ef4444"  # Rose/Red

    return {
        "rula_score": rula,
        "risk_level": risk_level,
        "action_required": action,
        "color": color,
        "sub_scores": {
            "neck": neck_score,
            "trunk": trunk_score,
            "shoulder": shoulder_score,
        },
    }


def calculate_ipd_proximity(
    current_ipd: float, baseline_ipd: float
) -> Dict[str, Any]:
    """Calculates screen proximity ratio using Inter-Pupillary Distance (IPD).

    Alert triggers if IPD increases by > 25% (indicates leaning closer than ~45 cm).
    """
    if baseline_ipd <= 1e-6:
        ratio = 1.0
    else:
        ratio = round(current_ipd / baseline_ipd, 2)

    too_close = ratio > 1.25  # Leaning closer than 45cm

    # Estimate viewing distance in centimeters (assuming 60cm baseline)
    estimated_distance_cm = round(60.0 / max(0.5, ratio), 1)

    return {
        "ipd_ratio": ratio,
        "too_close": too_close,
        "estimated_distance_cm": estimated_distance_cm,
        "warning": "Screen proximity too close (< 45cm)! Sit back." if too_close else None,
    }
