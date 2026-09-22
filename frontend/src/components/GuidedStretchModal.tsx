import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle2, RotateCcw, Sparkles, Activity } from 'lucide-react';
import { STRETCH_DEFINITIONS, StretchVerificationController } from '../core/stretches';
import type { KinematicsMetrics } from '../types/ergosense';

interface GuidedStretchModalProps {
  isOpen: boolean;
  onClose: () => void;
  kinematics: KinematicsMetrics;
  onLogCompletedStretch: (stretchName: string, heldDurationSec: number) => void;
}

export const GuidedStretchModal: React.FC<GuidedStretchModalProps> = ({
  isOpen,
  onClose,
  kinematics,
  onLogCompletedStretch,
}) => {
  const [selectedStretch, setSelectedStretch] = useState<'chin_tuck' | 'shoulder_retraction'>('chin_tuck');
  const [holdProgress, setHoldProgress] = useState<{
    holdSeconds: number;
    targetSeconds: number;
    percent: number;
    isHolding: boolean;
  }>({
    holdSeconds: 0,
    targetSeconds: 5.0,
    percent: 0,
    isHolding: false,
  });
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  const controllerRef = useRef<StretchVerificationController>(new StretchVerificationController());

  // Switch stretch definition
  useEffect(() => {
    controllerRef.current.setStretch(selectedStretch);
    setIsCompleted(false);
    setHoldProgress(controllerRef.current.getHoldProgress());
  }, [selectedStretch]);

  // Frame-by-frame verification loop when modal is open
  useEffect(() => {
    if (!isOpen || isCompleted) return;

    let animId: number;
    const loop = () => {
      const { completed, isHolding, holdSeconds } = controllerRef.current.update(
        kinematics.cva_deg,
        kinematics.shoulder_tilt_deg,
        performance.now()
      );

      const target = STRETCH_DEFINITIONS[selectedStretch]?.holdTargetSeconds || 5.0;
      setHoldProgress({
        holdSeconds,
        targetSeconds: target,
        percent: Math.min(100, Math.round((holdSeconds / target) * 100)),
        isHolding,
      });

      if (completed && !isCompleted) {
        setIsCompleted(true);
        onLogCompletedStretch(selectedStretch, 5.0);
      } else {
        animId = requestAnimationFrame(loop);
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, isCompleted, kinematics.cva_deg, kinematics.shoulder_tilt_deg, selectedStretch, onLogCompletedStretch]);

  if (!isOpen) return null;

  const stretchInfo = STRETCH_DEFINITIONS[selectedStretch];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700/80 p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 bg-indigo-500/20 blur-3xl rounded-full pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400 block">
              Ergonomic Intervention
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Guided Micro-Break Stretch
            </h2>
          </div>
        </div>

        {/* Exercise Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950/80 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => setSelectedStretch('chin_tuck')}
            className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              selectedStretch === 'chin_tuck'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Cervical Chin Tuck
          </button>
          <button
            type="button"
            onClick={() => setSelectedStretch('shoulder_retraction')}
            className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
              selectedStretch === 'shoulder_retraction'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Scapular Retraction
          </button>
        </div>

        {/* Instructions */}
        <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800/80 mb-6">
          <h3 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-2">
            <span>{stretchInfo.title}</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mb-3">
            {stretchInfo.instructions}
          </p>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800 text-slate-400">
            <span>Target: {stretchInfo.targetMetric}</span>
            <span className="font-semibold text-indigo-300">{stretchInfo.targetThresholdDesc}</span>
          </div>
        </div>

        {/* Real-Time CV Hold Progress Ring */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative w-40 h-40 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="transparent"
                stroke="#1e293b"
                strokeWidth="7"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="transparent"
                stroke={isCompleted ? '#10b981' : holdProgress.isHolding ? '#6366f1' : '#94a3b8'}
                strokeWidth="7"
                strokeDasharray="263.89"
                strokeDashoffset={263.89 - (263.89 * holdProgress.percent) / 100}
                strokeLinecap="round"
                className="transition-all duration-150 ease-out"
              />
            </svg>

            {/* Inner Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              {isCompleted ? (
                <div className="flex flex-col items-center animate-bounce text-emerald-400">
                  <CheckCircle2 className="w-12 h-12" />
                  <span className="text-xs font-bold uppercase mt-1">Done!</span>
                </div>
              ) : (
                <>
                  <span className="text-3xl font-extrabold font-mono text-white">
                    {holdProgress.holdSeconds}s
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {holdProgress.isHolding ? (
                      <span className="text-indigo-400 animate-pulse">Holding Form...</span>
                    ) : (
                      <span>Hold 5.0s</span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Live Guidance Status */}
          <div className="mt-4 text-center">
            {isCompleted ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Excellent! Posture reset logged to session.</span>
              </div>
            ) : holdProgress.isHolding ? (
              <p className="text-xs font-medium text-indigo-400 animate-pulse">
                Perfect form detected! Maintain position for {Math.max(0, 5 - Math.floor(holdProgress.holdSeconds))} more seconds.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Adjust position: glide chin backward to lengthen neck and level shoulders.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              controllerRef.current.resetHold();
              setIsCompleted(false);
              setHoldProgress(controllerRef.current.getHoldProgress());
            }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Hold</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30"
          >
            {isCompleted ? 'Complete Session' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
};
