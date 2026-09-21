"""Unit and integration tests for posture monitor backend."""
import time
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


def test_tracker_configuration():
    """Verify tracker initialization with model_complexity=2, smooth_landmarks=True, and EMA alpha=0.35."""
    tracker = PostureTracker()
    assert tracker.model_complexity == 2
    assert tracker.smooth_landmarks is True
    assert tracker.ema_alpha == 0.35
    assert tracker.min_detection_confidence == 0.6
    tracker.close()


def test_tracker_confidence_filtering():
    """Verify frames with low/no confidence are marked as confidence_sufficient=False."""
    tracker = PostureTracker()
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    result = tracker.process_frame(blank)
    assert result["detected"] is False
    assert result["confidence_sufficient"] is False
    tracker.close()


def test_evaluator_low_confidence_ignored():
    """Verify that low-confidence frames are ignored without penalizing the user or flipping alerts."""
    evaluator = PostureEvaluator()
    # Good reading first
    mock_good = {
        "detected": True,
        "confidence_sufficient": True,
        "metrics": {
            "head_tilt_angle": 1.0,
            "shoulder_tilt": 1.0,
            "vertical_slouch_ratio": 0.65,
            "ear_shoulder_angle": 12.0,
        },
        "landmarks": [],
    }
    first_eval = evaluator.evaluate(mock_good)
    assert first_eval["status"] == "Good"
    assert first_eval["posture_score"] == 100

    # Low-confidence frame arrives (e.g. occlusion or hand covering face)
    mock_low_conf = {
        "detected": False,
        "confidence_sufficient": False,
        "metrics": {},
        "landmarks": [],
    }
    ignored_eval = evaluator.evaluate(mock_low_conf)
    # Status and score are retained from previous stable evaluation, no false alert
    assert ignored_eval["status"] == "Good"
    assert ignored_eval["posture_score"] == 100
    assert ignored_eval["alert_triggered"] is False


def test_evaluator_alert_grace_window():
    """Verify that alert_triggered requires 5 consecutive seconds of poor posture."""
    evaluator = PostureEvaluator(alert_consecutive_sec=5.0)
    evaluator.calibrate({"vertical_slouch_ratio": 0.70, "ear_shoulder_angle": 10.0})

    mock_poor = {
        "detected": True,
        "confidence_sufficient": True,
        "metrics": {
            "head_tilt_angle": 25.0,
            "shoulder_tilt": 18.0,
            "vertical_slouch_ratio": 0.30,
            "ear_shoulder_angle": 35.0,
        },
        "landmarks": [],
    }

    # First poor frame (t=0)
    e1 = evaluator.evaluate(mock_poor)
    assert e1["status"] == "Poor"
    assert e1["alert_triggered"] is False

    # Simulate 4.0 seconds later (< 5.0 seconds grace window)
    evaluator.poor_start_timestamp = time.time() - 4.0
    e2 = evaluator.evaluate(mock_poor)
    assert e2["status"] == "Poor"
    assert e2["alert_triggered"] is False

    # Simulate 5.1 seconds later (>= 5.0 seconds grace window)
    evaluator.poor_start_timestamp = time.time() - 5.1
    e3 = evaluator.evaluate(mock_poor)
    assert e3["status"] == "Poor"
    assert e3["alert_triggered"] is True

    # Recovers to good posture -> alert flips back immediately
    mock_good = {
        "detected": True,
        "confidence_sufficient": True,
        "metrics": {
            "head_tilt_angle": 1.0,
            "shoulder_tilt": 1.0,
            "vertical_slouch_ratio": 0.70,
            "ear_shoulder_angle": 10.0,
        },
        "landmarks": [],
    }
    e4 = evaluator.evaluate(mock_good)
    assert e4["status"] == "Good"
    assert e4["alert_triggered"] is False


def test_evaluator_angled_view_support():
    """Verify that angled view detection blends ear-shoulder angle and adjusts shoulder tolerance."""
    evaluator = PostureEvaluator()
    evaluator.calibrate({"vertical_slouch_ratio": 0.70, "ear_shoulder_angle": 12.0})

    # Angled view with forward head posture (high ear_shoulder_angle)
    mock_angled = {
        "detected": True,
        "confidence_sufficient": True,
        "is_angled_view": True,
        "metrics": {
            "head_tilt_angle": 2.0,
            "shoulder_tilt": 6.0,  # Within angled tolerance
            "vertical_slouch_ratio": 0.60,
            "ear_shoulder_angle": 28.0,  # Significant forward head tilt
        },
        "landmarks": [],
    }
    angled_eval = evaluator.evaluate(mock_angled)
    assert angled_eval["metrics"]["slouch_ratio"] < 0.85
    assert angled_eval["status"] in ("Warning", "Poor")


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
