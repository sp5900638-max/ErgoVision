import React, { useState } from 'react';
import {
  Camera,
  VideoOff,
  Crosshair,
  RotateCcw,
  Volume2,
  VolumeX,
  Check,
  Activity,
  BarChart3,
  Mic,
  MicOff,
} from 'lucide-react';

interface ControlsProps {
  isStreaming: boolean;
  onToggleCamera: () => void;
  onCalibrate: () => Promise<void> | void;
  onResetSession: () => Promise<void> | void;
  isMuted: boolean;
  onToggleMute: () => void;
  userSpeaking: boolean;
  isMicActive: boolean;
  onToggleMic: () => void;
  onOpenStretchModal: () => void;
  onOpenAnalyticsModal: () => void;
  consecutivePoorCount: number;
}

export const Controls: React.FC<ControlsProps> = ({
  isStreaming,
  onToggleCamera,
  onCalibrate,
  onResetSession,
  isMuted,
  onToggleMute,
  userSpeaking,
  isMicActive,
  onToggleMic,
  onOpenStretchModal,
  onOpenAnalyticsModal,
  consecutivePoorCount,
}) => {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [justCalibrated, setJustCalibrated] = useState(false);

  const handleCalibrate = async () => {
    setIsCalibrating(true);
    try {
      await onCalibrate();
      setJustCalibrated(true);
      setTimeout(() => setJustCalibrated(false), 2000);
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onResetSession();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="w-full bg-slate-900/90 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-3">
      {/* Primary Camera Action */}
      <div className="flex items-center space-x-2">
        <button
          type="button"
          onClick={onToggleCamera}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md cursor-pointer ${
            isStreaming
              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-indigo-600/30'
          }`}
        >
          {isStreaming ? (
            <>
              <VideoOff className="w-4 h-4" />
              <span>Stop Monitoring</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              <span>Start Monitoring</span>
            </>
          )}
        </button>
      </div>

      {/* Action Buttons Group */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Calibrate Posture */}
        <button
          type="button"
          onClick={handleCalibrate}
          disabled={!isStreaming || isCalibrating}
          title="Sit in your natural ideal upright posture and click to calibrate"
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
            !isStreaming
              ? 'opacity-40 cursor-not-allowed bg-slate-800/50 text-slate-500 border-slate-800'
              : justCalibrated
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-600'
          }`}
        >
          {justCalibrated ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300">Calibrated!</span>
            </>
          ) : (
            <>
              <Crosshair className={`w-4 h-4 text-cyan-400 ${isCalibrating ? 'animate-spin' : ''}`} />
              <span>Calibrate Baseline</span>
            </>
          )}
        </button>

        {/* Guided Stretches Modal Trigger */}
        <button
          type="button"
          onClick={onOpenStretchModal}
          title="Open Guided Micro-Break Stretch exercises with CV hold verification"
          className="relative flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 transition-all cursor-pointer"
        >
          <Activity className="w-4 h-4 text-indigo-400" />
          <span>Guided Stretches</span>
          {consecutivePoorCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {consecutivePoorCount}/3
            </span>
          )}
        </button>

        {/* Analytics Report Modal Trigger */}
        <button
          type="button"
          onClick={onOpenAnalyticsModal}
          title="View detailed ergonomic telemetry and hourly degradation report"
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
        >
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span>Analytics Report</span>
        </button>

        {/* Speech Detection Mic Toggle */}
        <button
          type="button"
          onClick={onToggleMic}
          title={
            isMicActive
              ? userSpeaking
                ? 'Speaking detected — alerts auto-suppressed!'
                : 'Mic active for speech detection auto-mute'
              : 'Enable mic for call/speech auto-mute'
          }
          className={`flex items-center space-x-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
            isMicActive
              ? userSpeaking
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                : 'bg-slate-800 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-800/60 text-slate-500 border-slate-800'
          }`}
        >
          {isMicActive ? (
            <>
              <Mic className="w-4 h-4" />
              <span className="text-xs">{userSpeaking ? 'In Call' : 'Auto-Mute'}</span>
            </>
          ) : (
            <>
              <MicOff className="w-4 h-4" />
              <span className="text-xs">Mic Off</span>
            </>
          )}
        </button>

        {/* Mute Audio Alerts */}
        <button
          type="button"
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Audio Alerts' : 'Mute Audio Alerts'}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
            isMuted
              ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-300'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
          }`}
        >
          {isMuted ? (
            <>
              <VolumeX className="w-4 h-4 text-slate-400" />
              <span>Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-4 h-4 text-blue-400" />
              <span>Chimes On</span>
            </>
          )}
        </button>

        {/* Reset Session */}
        <button
          type="button"
          onClick={handleReset}
          disabled={isResetting}
          title="Reset session telemetry and timer"
          className="flex items-center space-x-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
        >
          <RotateCcw className={`w-4 h-4 text-slate-400 ${isResetting ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>
    </div>
  );
};
