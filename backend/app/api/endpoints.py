"""REST endpoints for health, calibration, and session control."""
from typing import Optional, Dict, Any
from fastapi import APIRouter
from pydantic import BaseModel
from ..core.state import get_evaluator, get_latest_result

router = APIRouter(prefix="/api", tags=["API"])


class CalibrateRequest(BaseModel):
    head_tilt_angle: Optional[float] = None
    shoulder_tilt: Optional[float] = None
    slouch_ratio: Optional[float] = None


@router.get("/health")
def health_check() -> Dict[str, Any]:
    """Returns application health and status."""
    return {
        "status": "ok",
        "service": "posture-monitor-backend",
        "version": "1.0.0",
    }


@router.post("/calibrate")
def calibrate_posture(payload: Optional[CalibrateRequest] = None) -> Dict[str, Any]:
    """Trigger or reset baseline posture calibration.

    If request body is empty, uses latest tracked frame metrics if available.
    """
    evaluator = get_evaluator()
    metrics_to_use: Dict[str, Any] = {}

    if payload and (
        payload.head_tilt_angle is not None
        or payload.shoulder_tilt is not None
        or payload.slouch_ratio is not None
    ):
        if payload.head_tilt_angle is not None:
            metrics_to_use["head_tilt_angle"] = payload.head_tilt_angle
        if payload.shoulder_tilt is not None:
            metrics_to_use["shoulder_tilt"] = payload.shoulder_tilt
        if payload.slouch_ratio is not None:
            metrics_to_use["slouch_ratio"] = payload.slouch_ratio
    else:
        latest = get_latest_result()
        if latest and latest.get("detected"):
            metrics_to_use = latest.get("metrics", {})

    result = evaluator.calibrate(metrics_to_use if metrics_to_use else None)
    return {
        "message": "Calibration updated successfully",
        **result,
    }


@router.post("/reset-session")
def reset_session() -> Dict[str, Any]:
    """Resets session duration and time counters."""
    evaluator = get_evaluator()
    result = evaluator.reset_session()
    return {
        "message": "Session reset successfully",
        **result,
    }
