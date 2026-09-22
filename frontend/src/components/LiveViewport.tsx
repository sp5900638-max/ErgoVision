import React, { useRef, useEffect } from 'react';
import { Shield, ShieldAlert, Video, VideoOff, Lock } from 'lucide-react';
import type { Point3D, RulaEvaluation } from '../types/ergosense';

interface LiveViewportProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isStreaming: boolean;
  privacyShield: boolean;
  onTogglePrivacyShield: () => void;
  rula: RulaEvaluation;
  landmarks: Point3D[];
  alertActive: boolean;
  poorPostureDurationSec: number;
  fps: number;
}

export const LiveViewport: React.FC<LiveViewportProps> = ({
  videoRef,
  canvasRef,
  isStreaming,
  privacyShield,
  onTogglePrivacyShield,
  rula,
  landmarks,
  alertActive,
  poorPostureDurationSec,
  fps,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw skeleton wireframe on overlay canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear previous frame
    ctx.clearRect(0, 0, width, height);

    if (privacyShield) {
      // Pure privacy black canvas
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, width, height);

      // Subtle tech background grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    if (!landmarks || landmarks.length < 5) return;

    // Draw skeleton joints and bones using RULA color
    const color = rula.color_hex;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = privacyShield ? 4 : 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Helper to project normalized coords
    const toPx = (pt: Point3D) => ({
      x: pt.x * width,
      y: pt.y * height,
    });

    const nose = landmarks[0] ? toPx(landmarks[0]) : null;
    const leftEar = landmarks[1] ? toPx(landmarks[1]) : null;
    const rightEar = landmarks[2] ? toPx(landmarks[2]) : null;
    const leftShoulder = landmarks[3] ? toPx(landmarks[3]) : null;
    const rightShoulder = landmarks[4] ? toPx(landmarks[4]) : null;
    const leftHip = landmarks[5] ? toPx(landmarks[5]) : null;
    const rightHip = landmarks[6] ? toPx(landmarks[6]) : null;

    const drawBone = (p1: { x: number; y: number } | null, p2: { x: number; y: number } | null) => {
      if (!p1 || !p2) return;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    };

    const drawJoint = (p: { x: number; y: number } | null, radius = 5) => {
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
      ctx.fill();

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 3, 0, 2 * Math.PI);
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineWidth = privacyShield ? 4 : 3;
      ctx.strokeStyle = color;
    };

    // Bones
    drawBone(leftEar, nose);
    drawBone(rightEar, nose);
    drawBone(leftShoulder, rightShoulder);
    drawBone(leftEar, leftShoulder);
    drawBone(rightEar, rightShoulder);

    if (leftHip && rightHip) {
      drawBone(leftShoulder, leftHip);
      drawBone(rightShoulder, rightHip);
      drawBone(leftHip, rightHip);
      drawJoint(leftHip, 6);
      drawJoint(rightHip, 6);
    }

    // Joints
    drawJoint(nose, 5);
    drawJoint(leftEar, 5);
    drawJoint(rightEar, 5);
    drawJoint(leftShoulder, 7);
    drawJoint(rightShoulder, 7);

    // Spine CVA line
    if (leftShoulder && rightShoulder && (leftEar || rightEar)) {
      const midShoulder = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2,
      };
      const ear = leftEar || rightEar;
      if (ear) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = `${color}cc`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(midShoulder.x, midShoulder.y);
        ctx.lineTo(ear.x, ear.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }, [landmarks, privacyShield, rula.color_hex]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl transition-all duration-300 ${
        alertActive
          ? 'ring-4 ring-rose-500/70 shadow-[inset_0_0_100px_rgba(239,68,68,0.5)]'
          : 'ring-1 ring-slate-800'
      }`}
    >
      {/* Ambient Vignette Alert Overlay */}
      {alertActive && (
        <div className="absolute inset-0 pointer-events-none z-30 animate-pulse bg-radial from-transparent via-rose-500/10 to-rose-600/35 border-4 border-rose-500/80 rounded-2xl shadow-[inset_0_0_120px_rgba(239,68,68,0.6)]" />
      )}

      {/* Warning countdown toast for poor posture before 10s alert */}
      {poorPostureDurationSec > 2 && !alertActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-amber-500/90 text-slate-950 text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-1.5 animate-bounce">
          <ShieldAlert className="w-4 h-4" />
          <span>Slouch detected! Correct posture in {10 - poorPostureDurationSec}s</span>
        </div>
      )}

      {/* Video Element (hidden if in privacy shield mode) */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-300 ${
          privacyShield || !isStreaming ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      />

      {/* Canvas for Wireframe and Privacy Shield */}
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute inset-0 w-full h-full object-cover -scale-x-100 z-10"
      />

      {/* Inactive Camera State */}
      {!isStreaming && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 text-slate-400 gap-3">
          <div className="p-4 rounded-full bg-slate-900 border border-slate-800">
            <VideoOff className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-sm font-medium">Camera Feed Suspended</p>
          <p className="text-xs text-slate-500 max-w-xs text-center">
            Click Start Monitoring to begin real-time posture analysis.
          </p>
        </div>
      )}

      {/* Top HUD Controls and Badges */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        {/* Left Badges */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-2.5 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[11px] font-medium text-slate-300 flex items-center gap-1.5 shadow-md">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Client Wasm (Zero Video Sent)</span>
          </div>

          {fps > 0 && (
            <div className="px-2 py-1 rounded-lg bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-[10px] font-mono text-cyan-400 shadow-md">
              {fps} FPS
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Privacy Shield Toggle */}
          <button
            type="button"
            onClick={onTogglePrivacyShield}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
              privacyShield
                ? 'bg-purple-600 text-white shadow-purple-600/30 ring-2 ring-purple-400'
                : 'bg-slate-900/85 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
            }`}
          >
            {privacyShield ? (
              <>
                <Shield className="w-3.5 h-3.5 text-purple-200" />
                <span>Privacy Shield Active</span>
              </>
            ) : (
              <>
                <Video className="w-3.5 h-3.5 text-slate-400" />
                <span>Webcam View</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
        <div
          className="px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md border flex items-center gap-2 shadow-lg"
          style={{
            backgroundColor: `${rula.color_hex}1a`,
            borderColor: `${rula.color_hex}40`,
            color: rula.color_hex,
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-ping"
            style={{ backgroundColor: rula.color_hex }}
          />
          <span>RULA {rula.rula_score}: {rula.status}</span>
        </div>

        {alertActive && (
          <div className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold shadow-lg shadow-rose-600/40 flex items-center gap-1.5 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>ERGONOMIC ALERT</span>
          </div>
        )}
      </div>
    </div>
  );
};
