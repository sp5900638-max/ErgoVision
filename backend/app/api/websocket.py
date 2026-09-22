"""WebSocket endpoints for real-time telemetry streaming and posture analysis."""
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


@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """ErgoSense 360 WebSocket endpoint for streaming coordinate metrics and posture state

    (Zero video stream transmission).
    """
    await websocket.accept()
    logger.info("Client connected to /ws/telemetry")

    try:
        while True:
            text_data = await websocket.receive_text()
            if not text_data:
                continue

            try:
                payload = json.loads(text_data)
            except json.JSONDecodeError:
                continue

            msg_type = payload.get("type", "telemetry")

            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            elif msg_type == "calibrate":
                await websocket.send_text(
                    json.dumps({
                        "type": "event",
                        "event": "calibrated",
                        "message": "ErgoSense baseline offsets saved",
                    })
                )
                continue

            elif msg_type == "telemetry":
                # Process and acknowledge incoming client-side CV telemetry packet
                rula = payload.get("rula_score", 1)
                cva = payload.get("cva_deg", 50.0)
                ipd_ratio = payload.get("ipd_ratio", 1.0)
                alert_active = payload.get("alert_active", False)

                # Return acknowledgment with server confirmation
                ack_response = {
                    "type": "telemetry_ack",
                    "status": payload.get("status", "Acceptable"),
                    "rula_score": rula,
                    "cva_deg": cva,
                    "ipd_ratio": ipd_ratio,
                    "alert_active": alert_active,
                    "server_time": payload.get("timestamp"),
                }
                await websocket.send_text(json.dumps(ack_response))

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/telemetry")
    except Exception as e:
        logger.error(f"Error in /ws/telemetry: {e}")
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/ws/posture")
async def websocket_posture_endpoint(websocket: WebSocket):
    """Legacy WebSocket endpoint receiving webcam frames (for fallback or testing)."""
    await websocket.accept()
    tracker = get_tracker()
    evaluator = get_evaluator()

    try:
        while True:
            message = await websocket.receive()
            frame: Optional[np.ndarray] = None
            command_type: Optional[str] = None

            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]
                frame = _decode_image_from_bytes(raw_bytes)

            elif "text" in message and message["text"]:
                text_data = message["text"].strip()
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
                            data_payload = cmd.get("data", "")
                            frame = _decode_image_from_base64(data_payload)
                        elif command_type == "ping":
                            await websocket.send_text(json.dumps({"type": "pong"}))
                            continue
                    except json.JSONDecodeError:
                        frame = _decode_image_from_base64(text_data)
                else:
                    frame = _decode_image_from_base64(text_data)

            if frame is None:
                continue

            tracker_result = tracker.process_frame(frame)
            set_latest_result(tracker_result)

            if command_type == "calibrate_frame" and tracker_result.get("detected"):
                evaluator.calibrate(tracker_result.get("metrics"))

            evaluation = evaluator.evaluate(tracker_result)
            await websocket.send_text(json.dumps(evaluation))

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/posture")
    except Exception as e:
        logger.error(f"Unexpected error in /ws/posture: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
