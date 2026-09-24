import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { LiveViewport } from './components/LiveViewport';
import { Controls } from './components/Controls';
import { RULAGaugeCard } from './components/RULAGaugeCard';
import { KinematicsCard } from './components/KinematicsCard';
import { VisionHealthCard } from './components/VisionHealthCard';
import { GuidedStretchModal } from './components/GuidedStretchModal';
import { AnalyticsReportModal } from './components/AnalyticsReportModal';
import { AlertToast } from './components/AlertToast';

import { useWebcam } from './hooks/useWebcam';
import { useMediaPipe } from './hooks/useMediaPipe';
import { useAudioDetection } from './hooks/useAudioDetection';
import { useAudioAlert } from './hooks/useAudioAlert';
import { useVisionHealth } from './hooks/useVisionHealth';
import { useTelemetryWebSocket } from './hooks/useTelemetryWebSocket';
import { evaluateRULA } from './core/kinematics';
import type { Point3D, KinematicsMetrics, RulaEvaluation } from './types/ergosense';

export const App: React.FC = () => {
  // Session State
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return 'session_' + Math.random().toString(36).substring(2, 11);
  });
  const [privacyShield, setPrivacyShield] = useState<boolean>(false);
  const [isStretchModalOpen, setIsStretchModalOpen] = useState<boolean>(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Score & Session Counters
  const [goodSeconds, setGoodSeconds] = useState<number>(0);
  const [poorSeconds, setPoorSeconds] = useState<number>(0);
  const [stretchesCompleted, setStretchesCompleted] = useState<number>(0);

  // Canvas ref for wireframe overlay
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Webcam Hook
  const {
    videoRef,
    isStreaming,
    error: webcamError,
    clearError: clearWebcamError,
    startCamera,
    stopCamera,
  } = useWebcam();

  // 2. Audio Speech Activity Detection Hook (auto-mutes chimes when speaking)
  const {
    userSpeaking,
    isMicActive,
    toggleMic,
  } = useAudioDetection();

  // 3. Audio Alert Chime Hook
  const { isMuted, toggleMute, playAlertSound } = useAudioAlert({
    throttleSeconds: 5.0,
    userSpeaking,
  });

  // 4. Vision Health & 20-20-20 Rule Hook
  const {
    visionMetrics,
    resetTwentyRule,
    processVisionFrame,
  } = useVisionHealth();

  // 5. In-Browser MediaPipe Computer Vision Inference Hook
  const onPoorThresholdReached = useCallback(() => {
    // Automatically trigger guided stretch modal after 3 consecutive poor posture events
    setIsStretchModalOpen(true);
  }, []);

  const {
    isLoading: isMediaPipeLoading,
    modelLoaded,
    error: mediaPipeError,
    kinematics: liveKinematics,
    rula: liveRula,
    earValue: liveEarValue,
    ipdRaw: liveIpdRaw,
    baselines,
    calibrate: calibrateLocal,
    alertActive: liveAlertActive,
    poorPostureDurationSec: livePoorPostureDurationSec,
    consecutivePoorCount: liveConsecutivePoorCount,
    resetAlert: resetLiveAlert,
    landmarks: liveLandmarks,
    startInference,
    stopInference,
    fps: liveFps,
  } = useMediaPipe(onPoorThresholdReached);

  // Simulation state values
  const [simKinematics, setSimKinematics] = useState<KinematicsMetrics>({
    cva_deg: 53.0,
    shoulder_tilt_deg: 1.5,
    trunk_angle_deg: 6.0,
  });
  const [simRula, setSimRula] = useState<RulaEvaluation>(evaluateRULA(53.0, 1.5, 6.0, 1.0));
  const [simLandmarks, setSimLandmarks] = useState<Point3D[]>([]);
  const [simAlertActive, setSimAlertActive] = useState<boolean>(false);
  const [simPoorDuration, setSimPoorDuration] = useState<number>(0);
  const simIntervalRef = useRef<number | null>(null);
  const simStepRef = useRef<number>(0);

  // Resolve active states depending on whether live or simulation mode is running
  const kinematics = isSimulating ? simKinematics : liveKinematics;
  const rula = isSimulating ? simRula : liveRula;
  const landmarks = isSimulating ? simLandmarks : liveLandmarks;
  const alertActive = isSimulating ? simAlertActive : liveAlertActive;
  const poorPostureDurationSec = isSimulating ? simPoorDuration : livePoorPostureDurationSec;
  const consecutivePoorCount = liveConsecutivePoorCount;
  const fps = isSimulating ? 30 : liveFps;
  const isLive = isStreaming || isSimulating;

  // 6. WebSocket Telemetry Hook (streams numeric metrics, ZERO raw video)
  const {
    connectionState,
    sendTelemetry,
    sendStretchEvent,
    sendCalibration,
  } = useTelemetryWebSocket({
    sessionToken,
    enabled: true,
  });

  // Initialize backend session on load
  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch('/api/sessions/start', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.session_token) {
            setSessionToken(data.session_token);
          }
        }
      } catch (err) {
        console.warn('Backend session init deferred, using local session token:', err);
      }
    }
    initSession();
  }, []);

  // Connect webcam to MediaPipe inference loop with synchronization on model load
  useEffect(() => {
    if (isStreaming && videoRef.current) {
      startInference(videoRef.current, canvasRef.current || undefined);
    } else {
      stopInference();
    }
    return () => {
      stopInference();
    };
  }, [isStreaming, modelLoaded, videoRef, canvasRef, startInference, stopInference]);

  // Procedural Simulation Loop for testing without camera
  useEffect(() => {
    if (!isSimulating) {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
      return;
    }

    // Stop webcam if running while switching to simulation
    if (isStreaming) {
      stopCamera();
    }

    simIntervalRef.current = window.setInterval(() => {
      simStepRef.current += 1;
      const t = simStepRef.current;
      // Cycle: 0-15s upright, 15-30s gradual slouch, 30-45s poor posture alert, 45-60s recovery
      const cycle = t % 60;
      let cva = 54.0;
      let tilt = 1.2;
      let trunk = 6.0;
      let ipdRat = 1.0;

      if (cycle < 18) {
        // Ideal upright posture
        cva = 52.0 + Math.sin(t * 0.2) * 2.0;
        tilt = 1.0 + Math.cos(t * 0.1) * 1.0;
        trunk = 5.0 + Math.sin(t * 0.15) * 1.5;
        ipdRat = 1.0;
        setSimPoorDuration(0);
        setSimAlertActive(false);
      } else if (cycle < 32) {
        // Moderate slouching forward
        cva = 44.0 + Math.sin(t * 0.2) * 2.0;
        tilt = 5.0 + Math.sin(t * 0.1) * 2.0;
        trunk = 14.0 + Math.cos(t * 0.15) * 2.0;
        ipdRat = 1.15;
        const dur = cycle - 18;
        setSimPoorDuration(dur);
        setSimAlertActive(dur >= 10);
      } else if (cycle < 48) {
        // Severe forward head posture (Tech Neck)
        cva = 35.0 + Math.sin(t * 0.3) * 2.0;
        tilt = 8.0 + Math.cos(t * 0.2) * 2.0;
        trunk = 19.0 + Math.sin(t * 0.2) * 2.5;
        ipdRat = 1.32;
        const dur = cycle - 18;
        setSimPoorDuration(dur);
        setSimAlertActive(dur >= 10);
      } else {
        // Posture correction / stretch recovery
        cva = 55.0 + Math.sin(t * 0.2) * 1.5;
        tilt = 1.0;
        trunk = 5.0;
        ipdRat = 1.0;
        setSimPoorDuration(0);
        setSimAlertActive(false);
      }

      const evalRes = evaluateRULA(cva, tilt, trunk, ipdRat);
      setSimKinematics({
        cva_deg: Math.round(cva * 10) / 10,
        shoulder_tilt_deg: Math.round(tilt * 10) / 10,
        trunk_angle_deg: Math.round(trunk * 10) / 10,
      });
      setSimRula(evalRes);

      // Procedural synthetic wireframe landmarks
      const slouchOffset = (54.0 - cva) * 0.003;
      const noseY = 0.32 + slouchOffset;
      const earY = 0.30 + slouchOffset;
      const shY = 0.62;
      const tiltOffset = (tilt / 10.0) * 0.03;

      setSimLandmarks([
        { x: 0.50, y: noseY, z: -0.05, visibility: 0.95 },
        { x: 0.43, y: earY - tiltOffset, z: 0.0, visibility: 0.95 },
        { x: 0.57, y: earY + tiltOffset, z: 0.0, visibility: 0.95 },
        { x: 0.33, y: shY - tiltOffset, z: 0.05, visibility: 0.95 },
        { x: 0.67, y: shY + tiltOffset, z: 0.05, visibility: 0.95 },
        { x: 0.38, y: 0.92, z: 0.05, visibility: 0.85 },
        { x: 0.62, y: 0.92, z: 0.05, visibility: 0.85 },
      ]);
    }, 200);

    return () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null;
      }
    };
  }, [isSimulating, isStreaming, stopCamera]);

  // Periodic Vision Health evaluation
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      const ear = isSimulating ? 0.28 : liveEarValue;
      const ipd = isSimulating ? 0.08 : liveIpdRaw;
      processVisionFrame(
        ear,
        ipd,
        baselines.baseline_ipd,
        videoRef.current
      );
    }, 250);

    return () => clearInterval(interval);
  }, [isLive, isSimulating, liveEarValue, liveIpdRaw, baselines.baseline_ipd, videoRef, processVisionFrame]);

  // Alert Sound Trigger on 10s Continuous Poor Posture
  useEffect(() => {
    if (alertActive) {
      playAlertSound();
    }
  }, [alertActive, playAlertSound]);

  // Track session duration & calculate daily ergonomic score
  useEffect(() => {
    if (!isLive) return;

    const timer = setInterval(() => {
      if (rula.rula_score <= 2) {
        setGoodSeconds((g) => g + 1);
      } else {
        setPoorSeconds((p) => p + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isLive, rula.rula_score]);

  // Periodic Telemetry Streaming to Backend (1 packet per second)
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      sendTelemetry({
        session_token: sessionToken,
        rula_score: rula.rula_score,
        cva_deg: kinematics.cva_deg,
        shoulder_tilt_deg: kinematics.shoulder_tilt_deg,
        trunk_angle_deg: kinematics.trunk_angle_deg,
        ipd_ratio: visionMetrics.ipd_ratio,
        ear_value: visionMetrics.ear_value,
        ambient_lux: visionMetrics.ambient_lux,
        status: rula.status,
        alert_active: alertActive,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    isLive,
    sendTelemetry,
    sessionToken,
    rula.rula_score,
    rula.status,
    kinematics,
    visionMetrics,
    alertActive,
  ]);

  // Daily Ergo Score calculation: 100 max, penalizes poor posture time
  const totalSeconds = goodSeconds + poorSeconds;
  const goodPosturePercentage =
    totalSeconds > 0 ? Math.round((goodSeconds / totalSeconds) * 100) : 100;
  const dailyErgoScore = Math.max(0, Math.min(100, goodPosturePercentage));

  // Handlers
  const handleToggleCamera = useCallback(() => {
    if (isSimulating) {
      setIsSimulating(false);
    }
    if (isStreaming) {
      stopCamera();
    } else {
      clearWebcamError();
      startCamera();
    }
  }, [isSimulating, isStreaming, startCamera, stopCamera, clearWebcamError]);

  const handleToggleSimulation = useCallback(() => {
    if (isSimulating) {
      setIsSimulating(false);
    } else {
      if (isStreaming) {
        stopCamera();
      }
      clearWebcamError();
      setIsSimulating(true);
    }
  }, [isSimulating, isStreaming, stopCamera, clearWebcamError]);

  const handleCalibrate = useCallback(async () => {
    calibrateLocal();
    const currentIpd = isSimulating ? 0.08 : liveIpdRaw;
    const baselinesPayload = {
      session_token: sessionToken,
      baseline_ipd: currentIpd > 0.01 ? currentIpd : 0.08,
      baseline_cva: kinematics.cva_deg,
      baseline_shoulder_tilt: kinematics.shoulder_tilt_deg,
    };
    sendCalibration({
      ipd: baselinesPayload.baseline_ipd,
      cva: baselinesPayload.baseline_cva,
      shoulder_tilt: baselinesPayload.baseline_shoulder_tilt,
    });

    try {
      await fetch('/api/sessions/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baselinesPayload),
      });
    } catch {
      // non-blocking
    }
  }, [calibrateLocal, isSimulating, liveIpdRaw, sessionToken, kinematics, sendCalibration]);

  const handleResetSession = useCallback(async () => {
    setGoodSeconds(0);
    setPoorSeconds(0);
    resetLiveAlert();
    setSimPoorDuration(0);
    setSimAlertActive(false);
    try {
      await fetch('/api/reset-session', { method: 'POST' });
    } catch {
      // non-blocking
    }
  }, [resetLiveAlert]);

  const handleLogCompletedStretch = useCallback(
    async (stretchName: string, heldDurationSec: number) => {
      setStretchesCompleted((s) => s + 1);
      sendStretchEvent(stretchName, heldDurationSec);

      try {
        await fetch('/api/sessions/stretch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: sessionToken,
            stretch_name: stretchName,
            held_duration_sec: heldDurationSec,
            completed: true,
          }),
        });
      } catch {
        // non-blocking
      }
    },
    [sendStretchEvent, sessionToken]
  );

  const displayError = webcamError || mediaPipeError;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-indigo-600 selection:text-white">
      {/* Header */}
      <Header
        connectionState={connectionState}
        isStreaming={isLive}
        fps={isLive ? fps : 0}
        userSpeaking={userSpeaking}
        privacyShield={privacyShield}
      />

      {/* Main Dashboard Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live Viewport with Privacy Shield and HUD Controls (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <LiveViewport
              videoRef={videoRef}
              canvasRef={canvasRef}
              isStreaming={isStreaming}
              isSimulating={isSimulating}
              modelLoaded={modelLoaded}
              isModelLoading={isMediaPipeLoading}
              error={displayError}
              privacyShield={privacyShield}
              onTogglePrivacyShield={() => setPrivacyShield((prev) => !prev)}
              rula={rula}
              landmarks={landmarks}
              alertActive={alertActive}
              poorPostureDurationSec={poorPostureDurationSec}
              fps={fps}
            />

            <Controls
              isStreaming={isStreaming}
              isSimulating={isSimulating}
              onToggleCamera={handleToggleCamera}
              onToggleSimulation={handleToggleSimulation}
              modelLoaded={modelLoaded}
              isModelLoading={isMediaPipeLoading}
              onCalibrate={handleCalibrate}
              onResetSession={handleResetSession}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              userSpeaking={userSpeaking}
              isMicActive={isMicActive}
              onToggleMic={toggleMic}
              onOpenStretchModal={() => setIsStretchModalOpen(true)}
              onOpenAnalyticsModal={() => setIsAnalyticsModalOpen(true)}
              consecutivePoorCount={consecutivePoorCount}
            />
          </div>

          {/* Right Column: RULA Meter, 3D Kinematics, Vision Health (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <RULAGaugeCard
              rula={rula}
              dailyErgoScore={dailyErgoScore}
              goodPosturePercentage={goodPosturePercentage}
              stretchesCompleted={stretchesCompleted}
            />

            <KinematicsCard
              kinematics={kinematics}
              baselines={baselines}
            />

            <VisionHealthCard
              vision={visionMetrics}
              onResetTwentyRule={resetTwentyRule}
            />
          </div>
        </div>
      </main>

      {/* Modals & Toasts */}
      <GuidedStretchModal
        isOpen={isStretchModalOpen}
        onClose={() => setIsStretchModalOpen(false)}
        kinematics={kinematics}
        onLogCompletedStretch={handleLogCompletedStretch}
      />

      <AnalyticsReportModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        sessionToken={sessionToken}
      />

      <AlertToast
        showAlert={alertActive}
        onDismiss={resetLiveAlert}
      />
    </div>
  );
};

export default App;
