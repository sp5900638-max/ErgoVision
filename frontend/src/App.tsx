import React, { useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { WebcamFeed } from './components/WebcamFeed';
import { Controls } from './components/Controls';
import { MetricsCard } from './components/MetricsCard';
import { AnalyticsCard } from './components/AnalyticsCard';
import { AlertToast } from './components/AlertToast';

import { useWebcam } from './hooks/useWebcam';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioAlert } from './hooks/useAudioAlert';
import type { PosturePayload } from './types/posture';

export const App: React.FC = () => {
  const {
    videoRef,
    isStreaming,
    error: webcamError,
    startCamera,
    stopCamera,
    captureFrameBlob,
  } = useWebcam();

  const {
    connectionState,
    latestData,
    sendFrame,
    sendCommand,
    fps,
  } = useWebSocket();

  const { isMuted, toggleMute, playAlertSound } = useAudioAlert(4.0);

  // In-flight transmission lock to avoid network buffer bloat
  const isSendingRef = useRef(false);
  const streamIntervalRef = useRef<number | null>(null);

  // Default fallback data when no live data has arrived yet
  const defaultData: PosturePayload = {
    status: 'Good',
    posture_score: 100,
    metrics: {
      head_tilt_angle: 0.0,
      slouch_ratio: 1.0,
      shoulder_tilt: 0.0,
    },
    alert_triggered: false,
    session_stats: {
      good_time_sec: 0,
      poor_time_sec: 0,
    },
    landmarks: [],
  };

  const activeData = latestData || defaultData;

  // Real-time Frame Capture and Streaming Pipeline (15-20 FPS -> ~60ms throttle)
  useEffect(() => {
    if (!isStreaming || connectionState !== 'connected') {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      return;
    }

    const captureIntervalMs = 60; // ~16.6 FPS

    streamIntervalRef.current = window.setInterval(async () => {
      if (isSendingRef.current) return;

      try {
        isSendingRef.current = true;
        const blob = await captureFrameBlob(0.65);
        if (blob) {
          sendFrame(blob);
        }
      } catch (err) {
        console.warn('Frame capture/stream error:', err);
      } finally {
        isSendingRef.current = false;
      }
    }, captureIntervalMs);

    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
    };
  }, [isStreaming, connectionState, captureFrameBlob, sendFrame]);

  // Audio alerts trigger
  useEffect(() => {
    if (activeData.alert_triggered) {
      playAlertSound();
    }
  }, [activeData.alert_triggered, playAlertSound]);

  // Control handlers
  const handleToggleCamera = useCallback(() => {
    if (isStreaming) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [isStreaming, startCamera, stopCamera]);

  const handleCalibrate = useCallback(async () => {
    // Send WebSocket command and REST call for maximum synchronization
    sendCommand({ type: 'calibrate' });
    try {
      await fetch('/api/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (e) {
      console.warn('REST calibration sync notice:', e);
    }
  }, [sendCommand]);

  const handleResetSession = useCallback(async () => {
    sendCommand({ type: 'reset' });
    try {
      await fetch('/api/reset-session', {
        method: 'POST',
      });
    } catch (e) {
      console.warn('REST reset session sync notice:', e);
    }
  }, [sendCommand]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Navigation Header */}
      <Header
        connectionState={connectionState}
        isStreaming={isStreaming}
        fps={fps}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live Feed and HUD Controls (7 cols on desktop) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <WebcamFeed
              videoRef={videoRef}
              isStreaming={isStreaming}
              status={activeData.status}
              postureScore={activeData.posture_score}
              landmarks={activeData.landmarks}
              error={webcamError}
              onStartCamera={startCamera}
            />

            <Controls
              isStreaming={isStreaming}
              onToggleCamera={handleToggleCamera}
              onCalibrate={handleCalibrate}
              onResetSession={handleResetSession}
              isMuted={isMuted}
              onToggleMute={toggleMute}
            />
          </div>

          {/* Right Column: Real-Time Score, CV Metrics, and Session Analytics (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <MetricsCard
              score={activeData.posture_score}
              status={activeData.status}
              metrics={activeData.metrics}
            />

            <AnalyticsCard
              stats={activeData.session_stats}
              currentStatus={activeData.status}
            />
          </div>
        </div>
      </main>

      {/* Visual Alert Toast */}
      <AlertToast showAlert={activeData.alert_triggered} />
    </div>
  );
};

export default App;
