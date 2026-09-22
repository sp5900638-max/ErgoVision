"""REST API endpoints for session calibration, telemetry ingestion, and health analytics reports."""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import uuid
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import SessionModel, ErgoLog, StretchEvent
from ..core.state import get_evaluator

router = APIRouter(prefix="/api", tags=["ErgoSense API"])


# Pydantic Schemas
class CalibrateRequest(BaseModel):
    session_token: Optional[str] = None
    baseline_ipd: Optional[float] = None
    baseline_cva: Optional[float] = None
    baseline_shoulder_tilt: Optional[float] = None


class LogTelemetryRequest(BaseModel):
    session_token: str
    rula_score: int
    cva_deg: float
    shoulder_tilt_deg: float
    trunk_angle_deg: float
    ipd_ratio: float
    ear_value: float
    ambient_lux: float
    status: str
    alert_active: bool = False


class StretchEventRequest(BaseModel):
    session_token: str
    stretch_name: str
    held_duration_sec: float
    completed: bool = True


@router.get("/health")
def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "posture-monitor-backend",
        "platform": "ErgoSense 360",
        "version": "2.0.0",
        "privacy_mode": "in-browser inference (zero video telemetry)",
    }


@router.post("/calibrate")
def legacy_calibrate(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Legacy calibration endpoint for backward compatibility."""
    evaluator = get_evaluator()
    res = evaluator.calibrate(payload or {})
    return res


@router.post("/reset-session")
def legacy_reset_session() -> Dict[str, Any]:
    """Legacy session reset endpoint for backward compatibility."""
    evaluator = get_evaluator()
    return evaluator.reset_session()


@router.post("/sessions/start")
def start_session(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Creates a new tracking session and returns a session token."""
    token = str(uuid.uuid4())
    session_obj = SessionModel(session_token=token)
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)

    return {
        "session_id": session_obj.id,
        "session_token": session_obj.session_token,
        "started_at": session_obj.started_at.isoformat(),
        "baselines": {
            "ipd": session_obj.baseline_ipd,
            "cva": session_obj.baseline_cva,
            "shoulder_tilt": session_obj.baseline_shoulder_tilt,
        },
    }


@router.post("/sessions/calibrate")
def calibrate_session(
    payload: CalibrateRequest, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Saves user baseline metric offsets (IPD, CVA, shoulder tilt) for the active session."""
    session_obj = None
    if payload.session_token:
        session_obj = (
            db.query(SessionModel)
            .filter(SessionModel.session_token == payload.session_token)
            .first()
        )

    if not session_obj:
        # Create default session if token not found
        token = payload.session_token or str(uuid.uuid4())
        session_obj = SessionModel(session_token=token)
        db.add(session_obj)

    if payload.baseline_ipd is not None:
        session_obj.baseline_ipd = float(payload.baseline_ipd)
    if payload.baseline_cva is not None:
        session_obj.baseline_cva = float(payload.baseline_cva)
    if payload.baseline_shoulder_tilt is not None:
        session_obj.baseline_shoulder_tilt = float(payload.baseline_shoulder_tilt)

    db.commit()
    db.refresh(session_obj)

    return {
        "status": "calibrated",
        "message": "Session baseline calibrated successfully",
        "session_token": session_obj.session_token,
        "baselines": {
            "baseline_ipd": session_obj.baseline_ipd,
            "baseline_cva": session_obj.baseline_cva,
            "baseline_shoulder_tilt": session_obj.baseline_shoulder_tilt,
        },
    }


@router.post("/sessions/log")
def log_telemetry(
    payload: LogTelemetryRequest, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Ingests interval posture logs and RULA ratings into SQLite."""
    session_obj = (
        db.query(SessionModel)
        .filter(SessionModel.session_token == payload.session_token)
        .first()
    )

    if not session_obj:
        session_obj = SessionModel(session_token=payload.session_token)
        db.add(session_obj)
        db.commit()
        db.refresh(session_obj)

    log_entry = ErgoLog(
        session_id=session_obj.id,
        rula_score=payload.rula_score,
        cva_deg=payload.cva_deg,
        shoulder_tilt_deg=payload.shoulder_tilt_deg,
        trunk_angle_deg=payload.trunk_angle_deg,
        ipd_ratio=payload.ipd_ratio,
        ear_value=payload.ear_value,
        ambient_lux=payload.ambient_lux,
        status=payload.status,
        alert_active=payload.alert_active,
    )
    db.add(log_entry)
    db.commit()

    return {"status": "recorded", "log_id": log_entry.id}


@router.post("/sessions/stretch")
def record_stretch(
    payload: StretchEventRequest, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Records a completed guided stretch verification event."""
    session_obj = (
        db.query(SessionModel)
        .filter(SessionModel.session_token == payload.session_token)
        .first()
    )

    if not session_obj:
        session_obj = SessionModel(session_token=payload.session_token)
        db.add(session_obj)
        db.commit()
        db.refresh(session_obj)

    stretch_entry = StretchEvent(
        session_id=session_obj.id,
        stretch_name=payload.stretch_name,
        held_duration_sec=payload.held_duration_sec,
        completed=payload.completed,
    )
    db.add(stretch_entry)
    db.commit()

    return {"status": "recorded", "stretch_id": stretch_entry.id}


@router.get("/sessions/report")
def generate_health_report(
    session_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Generates aggregated posture degradation statistics, RULA distributions,

    and compliance metrics for health analytics heatmaps.
    """
    query = db.query(ErgoLog)
    if session_token:
        session_obj = (
            db.query(SessionModel)
            .filter(SessionModel.session_token == session_token)
            .first()
        )
        if session_obj:
            query = query.filter(ErgoLog.session_id == session_obj.id)

    logs: List[ErgoLog] = query.order_by(ErgoLog.timestamp.desc()).limit(500).all()

    if not logs:
        return {
            "total_samples": 0,
            "average_rula": 1.0,
            "compliance_score": 100.0,
            "rula_distribution": {"acceptable": 100, "investigation": 0, "change_soon": 0, "immediate": 0},
            "hourly_degradation": [],
            "completed_stretches": 0,
            "vision_stats": {"avg_ipd_ratio": 1.0, "avg_lux": 150.0, "avg_ear": 0.28},
        }

    total = len(logs)
    avg_rula = round(sum(l.rula_score for l in logs) / total, 2)
    avg_cva = round(sum(l.cva_deg for l in logs) / total, 1)
    avg_ipd = round(sum(l.ipd_ratio for l in logs) / total, 2)
    avg_lux = round(sum(l.ambient_lux for l in logs) / total, 1)
    avg_ear = round(sum(l.ear_value for l in logs) / total, 3)

    # RULA Distribution breakdown
    acceptable_count = sum(1 for l in logs if l.rula_score <= 2)
    investigation_count = sum(1 for l in logs if l.rula_score in (3, 4))
    change_soon_count = sum(1 for l in logs if l.rula_score in (5, 6))
    immediate_count = sum(1 for l in logs if l.rula_score >= 7)

    compliance_score = round((acceptable_count / total) * 100.0, 1)

    # Hourly degradation heatmap bins (up to last 12 intervals)
    logs_chronological = list(reversed(logs))
    chunk_size = max(1, len(logs_chronological) // 8)
    hourly_bins = []
    for i in range(0, len(logs_chronological), chunk_size):
        chunk = logs_chronological[i : i + chunk_size]
        if chunk:
            hourly_bins.append({
                "time_label": chunk[-1].timestamp.strftime("%H:%M:%S"),
                "avg_rula": round(sum(c.rula_score for c in chunk) / len(chunk), 1),
                "avg_cva": round(sum(c.cva_deg for c in chunk) / len(chunk), 1),
                "poor_percentage": round(sum(1 for c in chunk if c.rula_score > 2) / len(chunk) * 100.0, 1),
            })

    # Stretches count
    if session_obj:
        stretches_count = db.query(StretchEvent).filter(StretchEvent.session_id == session_obj.id).count()
    else:
        stretches_count = db.query(StretchEvent).count()

    return {
        "session_token": session_token or "global",
        "total_samples": total,
        "total_duration_sec": total * 5,
        "average_rula": avg_rula,
        "average_cva": avg_cva,
        "compliance_score": compliance_score,
        "good_posture_percentage": compliance_score,
        "completed_stretches": stretches_count,
        "stretches_completed": stretches_count,
        "rula_distribution": {
            "acceptable": round((acceptable_count / total) * 100, 1),
            "investigation": round((investigation_count / total) * 100, 1),
            "change_soon": round((change_soon_count / total) * 100, 1),
            "immediate": round((immediate_count / total) * 100, 1),
        },
        "hourly_degradation": hourly_bins,
        "vision_stats": {
            "avg_ipd_ratio": avg_ipd,
            "avg_lux": avg_lux,
            "avg_ear": avg_ear,
        },
    }
