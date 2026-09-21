"""WebSocket endpoint for real-time posture analysis streaming."""
import json
import base64
import logging
from typing import Optional, Dict, Any
import numpy as np
import cv2
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..core.state import get_tracker, get_evaluator, set_latest_result

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


def _decode_image_from_bytes(data: bytes) -> Optional[np.ndarray]:
    """Decodes binary JPEG/PNG bytes into an OpenCV BGR image."""
    try:
        np_arr = np.frombuffer(data, dtype=np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        return frame
    except Exception as e:
        logger.error(f"Error decoding binary frame: {e}")
        return None


def _decode_image_from_base64(data_str: str) -> Optional[np.ndarray]:
    """Decodes base64 string or data URL into an OpenCV BGR image."""
    try:
        if "," in data_str:
            data_str = data_str.split(",", 1)[1]
        decoded = base64.b64decode(data_str)
        return _decode_image_from_bytes(decoded)
    except Exception as e:
        logger.error(f"Error decoding base64 frame: {e}")
        return None


@router.websocket("/ws/posture")
async def websocket_posture_endpoint(websocket: WebSocket):
    """WebSocket endpoint receiving webcam frames and returning real-time posture analysis."""
    await websocket.accept()
    tracker = get_tracker()
    evaluator = get_evaluator()

    try:
        while True:
            # WebSocket messages can arrive as binary bytes or text
            message = await websocket.receive()

            frame: Optional[np.ndarray] = None
            command_type: Optional[str] = None

            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]
                frame = _decode_image_from_bytes(raw_bytes)

            elif "text" in message and message["text"]:
                text_data = message["text"].strip()

                # Check if it's a JSON command
                if text_data.startswith("{") and text_data.endswith("}"):
                    try:
                        cmd = json.loads(text_data)
                        command_type = cmd.get("type")

                        if command_type == "calibrate":
                            evaluator.calibrate()
                            await websocket.send_text(
                                json.dumps({
                                    "type": "event",
                                    "event": "calibrated",
                                    "message": "Posture calibrated to current baseline",
                                })
                            )
                            continue
                        elif command_type == "reset":
                            evaluator.reset_session()
                            await websocket.send_text(
                                json.dumps({
                                    "type": "event",
                                    "event": "reset",
                                    "message": "Session counters reset",
                                })
                            )
                            continue
                        elif command_type == "frame":
                            # Base64 payload wrapped in JSON
                            data_payload = cmd.get("data", "")
                            frame = _decode_image_from_base64(data_payload)
                        elif command_type == "ping":
                            await websocket.send_text(json.dumps({"type": "pong"}))
                            continue
                    except json.JSONDecodeError:
                        # Fall back to checking if it is raw base64
                        frame = _decode_image_from_base64(text_data)
                else:
                    # Direct base64 string
                    frame = _decode_image_from_base64(text_data)

            if frame is None:
                # If no valid frame was decoded, wait for the next message
                continue

            # Process frame with tracker
            tracker_result = tracker.process_frame(frame)
            set_latest_result(tracker_result)

            # If this frame was marked for calibration, calibrate now
            if command_type == "calibrate_frame" and tracker_result.get("detected"):
                evaluator.calibrate(tracker_result.get("metrics"))

            # Evaluate posture
            evaluation = evaluator.evaluate(tracker_result)

            # Send back the required real-time JSON payload
            await websocket.send_text(json.dumps(evaluation))

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/posture")
    except Exception as e:
        logger.error(f"Unexpected error in /ws/posture: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
