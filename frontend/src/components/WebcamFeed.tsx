import React, { useRef, useEffect } from 'react';
import { Camera, AlertCircle, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { PostureStatus, Landmark } from '../types/posture';

interface WebcamFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isStreaming: boolean;
  status: PostureStatus;
  postureScore: number;
  landmarks?: Landmark[];
  error: string | null;
  onStartCamera: () => void;
}

// MediaPipe Pose connection pairs for upper body posture analysis
const SKELETON_CONNECTIONS: [number, number][] = [
  [7, 8],   // Left ear to right ear
  [0, 7],   // Nose to left ear
  [0, 8],   // Nose to right ear
  [11, 12], // Left shoulder to right shoulder
  [7, 11],  // Left ear to left shoulder
  [8, 12],  // Right ear to right shoulder
  [11, 23], // Left shoulder to left hip
  [12, 24], // Right shoulder to right hip
  [23, 24], // Left hip to right hip
];

export const WebcamFeed: React.FC<WebcamFeedProps> = ({
  videoRef,
  isStreaming,
  status,
  postureScore,
  landmarks,
  error,
  onStartCamera,
}) => {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dynamic border and glow colors based on posture state
  const getStatusTheme = (s: PostureStatus) => {
    switch (s) {
      case 'Good':
        return {
          border: 'border-emerald-500 shadow-emerald-500/20',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          indicatorDot: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
          stroke: '#10b981',
          joint: '#34d399',
        };
      case 'Warning':
        return {
          border: 'border-amber-500 shadow-amber-500/20',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          indicatorDot: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]',
          stroke: '#f59e0b',
          joint: '#fbbf24',
        };
      case 'Poor':
        return {
          border: 'border-rose-500 shadow-rose-500/30 animate-pulse',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          indicatorDot: 'bg-rose-400 shadow-[0_0_8px_#f87171]',
          stroke: '#ef4444',
          joint: '#f87171',
        };
    }
  };

  const theme = getStatusTheme(status);

  // Render skeletal landmarks overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isStreaming || !landmarks || landmarks.length === 0) {
      return;
    }

    if (video && video.videoWidth && video.videoHeight) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    const w = canvas.width;
    const h = canvas.height;

    // Map landmark IDs to coordinates
    const landmarkMap = new Map<number, { x: number; y: number; v: number }>();
    for (const lm of landmarks) {
      landmarkMap.set(lm.id, {
        x: lm.x * w,
        y: lm.y * h,
        v: lm.visibility ?? 1.0,
      });
    }

    // Draw skeletal connection lines
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.stroke;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 6;
    ctx.shadowColor = theme.stroke;

    for (const [idA, idB] of SKELETON_CONNECTIONS) {
      const pA = landmarkMap.get(idA);
      const pB = landmarkMap.get(idB);
      if (pA && pB && pA.v > 0.4 && pB.v > 0.4) {
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.stroke();
      }
    }

    // Draw joints / keypoints
    ctx.shadowBlur = 8;
    ctx.shadowColor = theme.joint;
    for (const [id, point] of landmarkMap.entries()) {
      // Draw key landmarks: nose, ears, shoulders, hips
      if ([0, 7, 8, 11, 12, 23, 24].includes(id) && point.v > 0.4) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = theme.joint;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
  }, [landmarks, isStreaming, status, theme, videoRef]);

  return (
    <div className="relative w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
      {/* Visual Posture Border Wrapper */}
      <div
        className={`relative aspect-video w-full rounded-2xl overflow-hidden border-2 transition-all duration-300 shadow-lg ${
          isStreaming ? theme.border : 'border-slate-800'
        }`}
      >
        {/* Video element */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover transform -scale-x-100 ${
            isStreaming ? 'block' : 'hidden'
          }`}
          playsInline
          muted
        />

        {/* Skeleton Canvas Overlay (mirrored to match video transform) */}
        <canvas
          ref={overlayCanvasRef}
          className={`absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100 ${
            isStreaming ? 'block' : 'hidden'
          }`}
        />

        {/* Camera Off / Fallback View */}
        {!isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 text-slate-400">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Camera is turned off</h3>
            <p className="text-sm text-slate-400 max-w-sm mb-6">
              Start your webcam to begin real-time AI posture tracking, angle calculation, and ergonomic feedback.
            </p>
            {error ? (
              <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            <button
              onClick={onStartCamera}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Start Camera</span>
            </button>
          </div>
        )}

        {/* Live HUD Overlays (when streaming) */}
        {isStreaming && (
          <>
            {/* Top Left: Posture Status Badge */}
            <div className="absolute top-4 left-4 flex items-center space-x-2">
              <div className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold shadow-lg ${theme.badgeBg}`}>
                <span className={`w-2 h-2 rounded-full ${theme.indicatorDot}`} />
                <span>{status} Posture</span>
                {status === 'Good' && <CheckCircle2 className="w-3.5 h-3.5 ml-0.5 text-emerald-400" />}
                {status === 'Warning' && <AlertTriangle className="w-3.5 h-3.5 ml-0.5 text-amber-400" />}
                {status === 'Poor' && <AlertCircle className="w-3.5 h-3.5 ml-0.5 text-rose-400" />}
              </div>
            </div>

            {/* Top Right: Live Score Pill */}
            <div className="absolute top-4 right-4">
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-950/70 backdrop-blur-md border border-slate-700/60 text-white shadow-lg">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400 font-medium">Score</span>
                <span className="text-sm font-bold tracking-tight text-white">{postureScore}</span>
              </div>
            </div>

            {/* Bottom Floating Bar: Guidance message */}
            <div className="absolute bottom-3 inset-x-4 flex justify-center">
              <div className="px-4 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[11px] text-slate-300 shadow-md">
                {status === 'Good' && '✨ Great posture! Keep your neck relaxed and shoulders aligned.'}
                {status === 'Warning' && '⚠️ Slight tilt or mild slouch detected. Gently adjust your sitting position.'}
                {status === 'Poor' && '🚨 Slouching or excessive tilt detected! Sit upright and pull your head back.'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
