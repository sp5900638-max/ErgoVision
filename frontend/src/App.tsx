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

export const App: React.FC = () => {
  // Session State
  const [sessionToken, setSessionToken] = useState<string>(() => {
    return 'session_' + Math.random().toString(36).substring(2, 11);
  });
  const [privacyShield, setPrivacyShield] = useState<boolean>(false);
  const [isStretchModalOpen, setIsStretchModalOpen] = useState<boolean>(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState<boolean>(false);

  // Score & Session Counters
  const [goodSeconds, setGoodSeconds] = useState<number>(0);
  const [poorSeconds, setPoorSeconds] = useState<number>(0);
  const [stretchesCompleted, setStretchesCompleted] = useState<number>(0);

  // Canvas ref for wireframe & ambient lighting sampling
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Webcam Hook
  const {
    videoRef,
    isStreaming,
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
    kinematics,
    rula,
    earValue,
    ipdRaw,
    baselines,
    calibrate: calibrateLocal,
    alertActive,
    poorPostureDurationSec,
    consecutivePoorCount,
    resetAlert,
    landmarks,
    startInference,
    stopInference,
  } = useMediaPipe(onPoorThresholdReached);

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

  // Connect webcam to MediaPipe inference loop
  useEffect(() => {
    if (isStreaming && videoRef.current) {
      startInference(videoRef.current, canvasRef.current || undefined);
    } else {
      stopInference();
    }
    return () => {
      stopInference();
    };
  }, [isStreaming, videoRef, canvasRef, startInference, stopInference]);

  // Periodic Vision Health & Canvas Lighting evaluation
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d') || undefined;
      processVisionFrame(
        earValue,
        ipdRaw,
        baselines.baseline_ipd,
        ctx,
        canvas?.width,
        canvas?.height
      );
    }, 200);

    return () => clearInterval(interval);
  }, [isStreaming, earValue, ipdRaw, baselines.baseline_ipd, processVisionFrame]);

  // Alert Sound Trigger on 10s Continuous Poor Posture
  useEffect(() => {
    if (alertActive) {
      playAlertSound();
    }
  }, [alertActive, playAlertSound]);

  // Track session duration & calculate daily ergonomic score
  useEffect(() => {
    if (!isStreaming) return;

    const timer = setInterval(() => {
      if (rula.rula_score <= 2) {
        setGoodSeconds((g) => g + 1);
      } else {
        setPoorSeconds((p) => p + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isStreaming, rula.rula_score]);

  // Periodic Telemetry Streaming to Backend (1 packet per second)
  useEffect(() => {
    if (!isStreaming) return;

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
    isStreaming,
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
    if (isStreaming) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [isStreaming, startCamera, stopCamera]);

  const handleCalibrate = useCallback(async () => {
    calibrateLocal();
    const baselinesPayload = {
      session_token: sessionToken,
      baseline_ipd: ipdRaw > 0.01 ? ipdRaw : 0.08,
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
    } catch (e) {
      // non-blocking
    }
  }, [calibrateLocal, sessionToken, ipdRaw, kinematics, sendCalibration]);

  const handleResetSession = useCallback(async () => {
    setGoodSeconds(0);
    setPoorSeconds(0);
    resetAlert();
    try {
      await fetch('/api/reset-session', { method: 'POST' });
    } catch (e) {
      // non-blocking
    }
  }, [resetAlert]);

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
      } catch (e) {
        // non-blocking
      }
    },
    [sendStretchEvent, sessionToken]
  );

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-indigo-600 selection:text-white">
      {/* Header */}
      <Header
        connectionState={connectionState}
        isStreaming={isStreaming}
        fps={isStreaming ? 24 : 0}
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
              privacyShield={privacyShield}
              onTogglePrivacyShield={() => setPrivacyShield((prev) => !prev)}
              rula={rula}
              landmarks={landmarks}
              alertActive={alertActive}
              poorPostureDurationSec={poorPostureDurationSec}
              fps={isStreaming ? 24 : 0}
            />

            <Controls
              isStreaming={isStreaming}
              onToggleCamera={handleToggleCamera}
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
        onDismiss={resetAlert}
      />
    </div>
  );
};

export default App;
