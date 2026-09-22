"""Unit tests for 3D Kinematics and RULA evaluation engine."""
from backend.app.core.kinematics import (
    calculate_cva_3d,
    calculate_shoulder_tilt_3d,
    calculate_trunk_angle_3d,
    compute_rula_score,
    calculate_ipd_proximity,
)


def test_cva_upright_posture():
    """Verify that an upright head position yields a Craniovertebral Angle (CVA) >= 50 degrees."""
    # Shoulder at (0, 0.5, 0), Tragus at (0.05, 0.2, 0.02)
    shoulder_c7 = (0.0, 0.5, 0.0)
    tragus_upright = (0.04, 0.2, 0.02)  # High vertical drop relative to horizontal offset
    cva = calculate_cva_3d(tragus_upright, shoulder_c7)
    assert cva >= 50.0, f"Expected CVA >= 50 deg, got {cva}"


def test_cva_forward_head_slouch():
    """Verify that forward head posture (tragus displaced forward) drops CVA < 45 degrees."""
    shoulder_c7 = (0.0, 0.5, 0.0)
    tragus_slouched = (0.28, 0.35, 0.20)  # Large horizontal projection
    cva = calculate_cva_3d(tragus_slouched, shoulder_c7)
    assert cva < 45.0, f"Expected CVA < 45 deg, got {cva}"


def test_shoulder_tilt():
    """Verify horizontal shoulder tilt calculation."""
    # Leveled shoulders
    left_level = (-0.2, 0.5, 0.0)
    right_level = (0.2, 0.5, 0.0)
    tilt_level = calculate_shoulder_tilt_3d(left_level, right_level)
    assert tilt_level <= 1.0

    # Tilted shoulder (e.g. right shoulder lower)
    right_tilted = (0.2, 0.58, 0.0)
    tilt_high = calculate_shoulder_tilt_3d(left_level, right_tilted)
    assert tilt_high > 10.0


def test_trunk_angle():
    """Verify trunk flexion angle relative to vertical."""
    # Upright spine
    mid_hip = (0.0, 0.9, 0.0)
    mid_shoulder_upright = (0.0, 0.4, 0.0)
    trunk_upright = calculate_trunk_angle_3d(mid_hip, mid_shoulder_upright)
    assert trunk_upright <= 5.0

    # Forward flexed spine
    mid_shoulder_slouched = (0.15, 0.5, 0.15)
    trunk_slouched = calculate_trunk_angle_3d(mid_hip, mid_shoulder_slouched)
    assert trunk_slouched > 15.0


def test_rula_score_mapping():
    """Verify RULA ergonomic risk category mappings."""
    # 1. Optimal Upright -> RULA 1-2 (Acceptable)
    rula_good = compute_rula_score(cva_deg=55.0, trunk_angle_deg=4.0, shoulder_tilt_deg=1.5)
    assert rula_good["rula_score"] in (1, 2)
    assert rula_good["risk_level"] == "Acceptable"

    # 2. Moderate Slouch -> RULA 3-4 (Further Investigation)
    rula_moderate = compute_rula_score(cva_deg=46.0, trunk_angle_deg=12.0, shoulder_tilt_deg=4.0)
    assert rula_moderate["rula_score"] in (2, 3, 4)

    # 3. Severe Poor Posture -> RULA 5-7 (Change Soon / Immediate Action)
    rula_severe = compute_rula_score(cva_deg=32.0, trunk_angle_deg=30.0, shoulder_tilt_deg=14.0)
    assert rula_severe["rula_score"] >= 5
    assert rula_severe["risk_level"] in ("Change Soon", "Immediate Action")


def test_ipd_proximity_alert():
    """Verify screen proximity warning when IPD increases by > 25%."""
    baseline_ipd = 0.08

    # Normal sitting distance
    normal_ipd = 0.082
    res_normal = calculate_ipd_proximity(normal_ipd, baseline_ipd)
    assert res_normal["too_close"] is False
    assert res_normal["ipd_ratio"] <= 1.25

    # Leaned forward close to screen (< 45cm)
    close_ipd = 0.11  # +37.5%
    res_close = calculate_ipd_proximity(close_ipd, baseline_ipd)
    assert res_close["too_close"] is True
    assert res_close["ipd_ratio"] > 1.25
    assert res_close["warning"] is not None
