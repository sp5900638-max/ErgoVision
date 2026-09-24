-- ==============================================================================
-- PostgreSQL Production Initialization Script for ErgoSense 360
-- ==============================================================================

-- Enable UUID extension if required
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(128) UNIQUE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    baseline_ipd DOUBLE PRECISION DEFAULT 0.08,
    baseline_cva DOUBLE PRECISION DEFAULT 52.0,
    baseline_shoulder_tilt DOUBLE PRECISION DEFAULT 0.0,
    daily_ergo_score DOUBLE PRECISION DEFAULT 100.0
);

-- Index for session lookup
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);

-- Telemetry Logs Table
CREATE TABLE IF NOT EXISTS ergo_logs (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    rula_score INTEGER DEFAULT 1,
    cva_deg DOUBLE PRECISION DEFAULT 50.0,
    shoulder_tilt_deg DOUBLE PRECISION DEFAULT 0.0,
    trunk_angle_deg DOUBLE PRECISION DEFAULT 0.0,
    ipd_ratio DOUBLE PRECISION DEFAULT 1.0,
    ear_value DOUBLE PRECISION DEFAULT 0.28,
    ambient_lux DOUBLE PRECISION DEFAULT 120.0,
    status VARCHAR(32) DEFAULT 'Acceptable',
    alert_active BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ergo_logs_session_id ON ergo_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_ergo_logs_timestamp ON ergo_logs(timestamp);

-- Stretch Interventions Table
CREATE TABLE IF NOT EXISTS stretch_events (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    stretch_name VARCHAR(64) NOT NULL,
    held_duration_sec DOUBLE PRECISION DEFAULT 5.0,
    completed BOOLEAN DEFAULT TRUE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stretch_events_session_id ON stretch_events(session_id);
