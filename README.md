# ErgoVision — Real-Time AI Posture Monitor

A decoupled, high-performance posture monitoring application featuring a **FastAPI backend** (with WebSockets and MediaPipe Pose computer vision) and a modern **Vite + React + Tailwind CSS frontend**.

---

## Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                                Browser (Frontend)                                 |
|                                                                                   |
|  +-------------------+      +---------------------+      +---------------------+  |
|  | navigator.media-  | ---> | Offscreen Canvas    | ---> | WebSocket Client    |  |
|  | Devices.getUser-  |      | Frame Capture @16fps|      | Binary JPEG Blobs   |  |
|  | Media (Webcam)    |      | (Throttled, scaled) |      | ws://localhost:8000 |  |
|  +-------------------+      +---------------------+      +----------+----------+  |
|            |                                                        |             |
|            v                                                        |             |
|  +-------------------+                                              |             |
|  | <video> element   | <--------------------------------------------+             |
|  | + <canvas>        |   Real-time JSON metrics & normalized coords               |
|  | Skeletal Overlay  |   (Head tilt, shoulder tilt, slouch ratio, score)          |
|  +-------------------+                                                            |
+---------------------------------------------+-------------------------------------+
                                              |
                                   WebSocket  |  REST (/api/calibrate,
                                  /ws/posture |        /api/reset-session)
                                              v
+-----------------------------------------------------------------------------------+
|                                FastAPI Backend                                    |
|                                                                                   |
|  +-----------------------+      +--------------------+      +------------------+  |
|  | WebSocket Endpoint    | ---> | PostureTracker     | ---> | PostureEvaluator |  |
|  | cv2.imdecode(buffer)  |      | MediaPipe Pose     |      | Calibration,     |  |
|  | Binary / Base64       |      | 3D Landmarks &     |      | 0-100 Score,     |  |
|  |                       |      | Angle Extraction   |      | Session Timers   |  |
|  +-----------------------+      +--------------------+      +--------+---------+  |
|                                                                      |            |
|                                 Real-Time JSON Response <------------+            |
+-----------------------------------------------------------------------------------+
```

---

## Directory Structure

```text
c:/CV/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI application entrypoint & CORS middleware
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── endpoints.py      # REST endpoints: /api/health, /api/calibrate, /api/reset-session
│   │   │   └── websocket.py      # WebSocket endpoint: /ws/posture
│   │   └── core/
│   │       ├── __init__.py
│   │       ├── tracker.py        # MediaPipe Pose landmark extraction and angle calculations
│   │       ├── evaluator.py      # Scoring algorithm, calibration, and session counters
│   │       └── state.py          # Shared state singletons for tracker and evaluator
│   ├── tests/
│   │   └── test_backend.py       # Automated unit & integration tests
│   └── requirements.txt          # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx        # Top navigation & system status badge
│   │   │   ├── WebcamFeed.tsx    # Live camera view, indicator border, skeleton overlay canvas
│   │   │   ├── Controls.tsx      # HUD control bar: Start/Stop, Calibrate, Reset, Mute
│   │   │   ├── MetricsCard.tsx   # Real-time posture score gauge, head tilt, shoulder tilt, slouch ratio
│   │   │   ├── AnalyticsCard.tsx # Session duration, Good vs Poor breakdown progress bar, ergonomic tips
│   │   │   └── AlertToast.tsx    # Visual alert banner when alert_triggered is true
│   │   ├── hooks/
│   │   │   ├── useWebcam.ts      # Camera stream, offscreen canvas frame capture at 15-20 FPS
│   │   │   ├── useWebSocket.ts   # WebSocket connection, reconnection, transmission & state
│   │   │   └── useAudioAlert.ts  # Web Audio API procedural chime for posture warnings
│   │   ├── types/
│   │   │   └── posture.ts        # TypeScript interfaces for WebSocket payloads and metrics
│   │   ├── App.tsx               # Main dashboard layout and streaming orchestrator
│   │   ├── main.tsx              # React DOM entrypoint
│   │   └── index.css             # Tailwind directives & theme styles
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── README.md
```

---

## Getting Started

### 1. Prerequisites
- **Python:** 3.10+ (tested on Python 3.12)
- **Node.js:** v18+ (tested on Node v24)
- A working webcam or virtual camera.

---

### 2. Quick Start: Single Unified Server (Integrated Mode)

Run both the React frontend and FastAPI backend together on **one server** (`http://localhost:8000`):

#### Method A: Double-Click
Double-click **`start.bat`** (or **`run.bat`**) in `C:\CV`. It launches the server and automatically opens `http://localhost:8000` in your browser!

#### Method B: Terminal Command
```powershell
# From C:\CV
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

---

### 3. Decoupled Development Mode (Hot Reloading)

If you are developing the frontend and want Vite hot-module replacement (HMR):

1. **Terminal 1 (Backend):**
   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Terminal 2 (Frontend):**
   ```powershell
   cd frontend
   npm.cmd run dev
   ```
   Open **[http://localhost:5173](http://localhost:5173)** in your browser.

2. Install Node dependencies:
   ```powershell
   npm install
   ```

3. Start the Vite development server:
   ```powershell
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

4. (Optional) Build for production:
   ```powershell
   npm run build
   ```

---

## API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status. |
| `POST` | `/api/calibrate` | Sets or recalibrates baseline posture angles using current live metrics. |
| `POST` | `/api/reset-session` | Resets good/poor duration counters and session timers. |

### WebSocket Endpoint (`/ws/posture`)

Connect to `ws://localhost:8000/ws/posture`.

#### Client Messages
- **Binary JPEG bytes:** Directly send `Blob` or `ArrayBuffer` containing a JPEG image captured from the `<canvas>`.
- **Text JSON:**
  - `{"type": "calibrate"}`: Triggers baseline posture calibration.
  - `{"type": "reset"}`: Resets session counters.
  - `{"type": "ping"}`: Returns `{"type": "pong"}` for connection keep-alive.

#### Server JSON Payload
Every processed frame produces a real-time JSON response:
```json
{
  "status": "Good",
  "posture_score": 85,
  "metrics": {
    "head_tilt_angle": 12.4,
    "slouch_ratio": 0.95,
    "shoulder_tilt": 1.2
  },
  "alert_triggered": false,
  "session_stats": {
    "good_time_sec": 120,
    "poor_time_sec": 15
  },
  "landmarks": [
    { "id": 0, "x": 0.51, "y": 0.32, "z": -0.05, "visibility": 0.99 }
  ]
}
```

---

## Posture Evaluation Metrics

1. **Head Tilt Angle (°):**
   Calculated from the angle of the line connecting both ears relative to the horizontal plane. Normal range is < 8°.
2. **Shoulder Tilt (°):**
   Calculated from the angle between the left and right acromion (shoulder) joints relative to horizontal. Normal range is < 5°.
3. **Slouch Ratio:**
   The ratio of vertical distance from head to shoulder girdle divided by the biacromial shoulder span, normalized against the user's calibrated baseline. Ratios < 0.85 indicate cervical spine flexion or thoracic slouching.
4. **Hysteresis Alerting:**
   Visual banner and Web Audio chime activate when a poor posture state persists continuously for more than 3 seconds, preventing false positives from momentary shifts.

---

## Running Automated Tests

Run backend unit and integration tests:
```powershell
python -m pytest backend/tests/test_backend.py -v
```
