"""Integration test suite for ErgoSense 360 REST endpoints, session persistence, and SPA serving."""
import pytest
from starlette.testclient import TestClient
from backend.app.main import app
from backend.app.db.database import Base, engine


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    return TestClient(app)


def test_serve_spa_root(client):
    """Verifies that FastAPI serves the built React SPA at root /."""
    response = client.get("/")
    assert response.status_code == 200
    assert "<!doctype html>" in response.text.lower()
    assert 'id="root"' in response.text


def test_session_lifecycle(client):
    """Tests starting a session, calibrating baselines, logging telemetry, and retrieving reports."""
    # 1. Start session
    start_resp = client.post("/api/sessions/start")
    assert start_resp.status_code == 200
    start_data = start_resp.json()
    assert "session_token" in start_data
    token = start_data["session_token"]

    # 2. Calibrate session
    calib_resp = client.post(
        "/api/sessions/calibrate",
        json={
            "session_token": token,
            "baseline_ipd": 0.082,
            "baseline_cva": 53.5,
            "baseline_shoulder_tilt": 1.2,
        },
    )
    assert calib_resp.status_code == 200
    assert calib_resp.json()["status"] == "calibrated"

    # 3. Log telemetry
    log_resp = client.post(
        "/api/sessions/log",
        json={
            "session_token": token,
            "rula_score": 2,
            "cva_deg": 52.0,
            "shoulder_tilt_deg": 1.5,
            "trunk_angle_deg": 6.8,
            "ipd_ratio": 1.02,
            "ear_value": 0.29,
            "ambient_lux": 135.0,
            "status": "Acceptable",
            "alert_active": False,
        },
    )
    assert log_resp.status_code == 200
    assert log_resp.json()["status"] == "recorded"

    # 4. Log stretch event
    stretch_resp = client.post(
        "/api/sessions/stretch",
        json={
            "session_token": token,
            "stretch_name": "chin_tuck",
            "held_duration_sec": 5.0,
            "completed": True,
        },
    )
    assert stretch_resp.status_code == 200
    assert stretch_resp.json()["status"] == "recorded"

    # 5. Fetch report
    report_resp = client.get(f"/api/sessions/report?session_token={token}")
    assert report_resp.status_code == 200
    report_data = report_resp.json()
    assert report_data["session_token"] == token
    assert report_data["stretches_completed"] == 1
    assert report_data["average_rula"] == 2.0
    assert report_data["good_posture_percentage"] == 100.0
