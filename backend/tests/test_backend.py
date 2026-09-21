"""Unit and integration tests for posture monitor backend."""
import numpy as np
import cv2
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.app.core.tracker import PostureTracker
from backend.app.core.evaluator import PostureEvaluator


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    """Test GET /api/health endpoint."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "posture-monitor-backend"


def test_calibrate_endpoint(client):
    """Test POST /api/calibrate endpoint."""
    response = client.post(
        "/api/calibrate",
        json={"head_tilt_angle": 5.0, "shoulder_tilt": 2.0, "slouch_ratio": 0.85},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["calibrated"] is True
    assert data["baseline_head_tilt"] == 5.0
    assert data["baseline_shoulder_tilt"] == 2.0


def test_reset_session_endpoint(client):
    """Test POST /api/reset-session endpoint."""
    response = client.post("/api/reset-session")
    assert response.status_code == 200
    data = response.json()
    assert data["reset"] is True
    assert data["good_time_sec"] == 0
    assert data["poor_time_sec"] == 0


def test_tracker_empty_frame():
    """Test PostureTracker with empty / blank frame."""
    tracker = PostureTracker()
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    result = tracker.process_frame(blank)
    assert "detected" in result
    assert "metrics" in result
    assert "landmarks" in result
    tracker.close()


def test_evaluator_scoring_logic():
    """Test PostureEvaluator score calculation and status categorization."""
    evaluator = PostureEvaluator(alert_consecutive_sec=1.0)
    evaluator.calibrate({"head_tilt_angle": 0.0, "shoulder_tilt": 0.0, "slouch_ratio": 0.80})

    # Good posture input
    mock_good = {
        "detected": True,
        "metrics": {
            "head_tilt_angle": 1.0,
            "shoulder_tilt": 1.0,
            "slouch_ratio": 0.80,
        },
        "landmarks": [],
    }
    eval_good = evaluator.evaluate(mock_good)
    assert eval_good["status"] == "Good"
    assert eval_good["posture_score"] >= 80

    # Poor posture input (severe tilt and slouch)
    mock_poor = {
        "detected": True,
        "metrics": {
            "head_tilt_angle": 25.0,
            "shoulder_tilt": 18.0,
            "slouch_ratio": 0.40,
        },
        "landmarks": [],
    }
    eval_poor = evaluator.evaluate(mock_poor)
    assert eval_poor["status"] == "Poor"
    assert eval_poor["posture_score"] < 60


def test_websocket_stream(client):
    """Test /ws/posture WebSocket endpoint with simulated frames and commands."""
    with client.websocket_connect("/ws/posture") as websocket:
        # 1. Test ping command
        websocket.send_text('{"type": "ping"}')
        resp = websocket.receive_json()
        assert resp.get("type") == "pong"

        # 2. Test binary JPEG frame
        test_img = np.zeros((240, 320, 3), dtype=np.uint8)
        _, buffer = cv2.imencode(".jpg", test_img)
        websocket.send_bytes(buffer.tobytes())

        payload = websocket.receive_json()
        assert "status" in payload
        assert "posture_score" in payload
        assert "metrics" in payload
        assert "session_stats" in payload
        assert "alert_triggered" in payload
