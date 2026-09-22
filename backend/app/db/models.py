"""SQLAlchemy database models for sessions, posture telemetry logs, and stretch interventions."""
from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_token = Column(String, unique=True, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    # Calibrated baselines
    baseline_ipd = Column(Float, nullable=True, default=0.08)
    baseline_cva = Column(Float, nullable=True, default=52.0)
    baseline_shoulder_tilt = Column(Float, nullable=True, default=0.0)

    daily_ergo_score = Column(Float, default=100.0)

    logs = relationship("ErgoLog", back_populates="session", cascade="all, delete-orphan")
    stretches = relationship("StretchEvent", back_populates="session", cascade="all, delete-orphan")


class ErgoLog(Base):
    __tablename__ = "ergo_logs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Biomechanical & Vision metrics
    rula_score = Column(Integer, default=1)
    cva_deg = Column(Float, default=50.0)
    shoulder_tilt_deg = Column(Float, default=0.0)
    trunk_angle_deg = Column(Float, default=0.0)
    ipd_ratio = Column(Float, default=1.0)
    ear_value = Column(Float, default=0.28)
    ambient_lux = Column(Float, default=120.0)

    status = Column(String, default="Acceptable")
    alert_active = Column(Boolean, default=False)

    session = relationship("SessionModel", back_populates="logs")


class StretchEvent(Base):
    __tablename__ = "stretch_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), index=True)
    stretch_name = Column(String)  # "chin_tuck", "shoulder_retraction"
    held_duration_sec = Column(Float, default=5.0)
    completed = Column(Boolean, default=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    session = relationship("SessionModel", back_populates="stretches")
