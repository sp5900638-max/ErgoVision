import React, { useState } from 'react';
import { Camera, VideoOff, Crosshair, RotateCcw, Volume2, VolumeX, Check } from 'lucide-react';

interface ControlsProps {
  isStreaming: boolean;
  onToggleCamera: () => void;
  onCalibrate: () => Promise<void>;
  onResetSession: () => Promise<void>;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isStreaming,
  onToggleCamera,
  onCalibrate,
  onResetSession,
  isMuted,
  onToggleMute,
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
          onClick={onToggleCamera}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md cursor-pointer ${
            isStreaming
              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-blue-600/30'
          }`}
        >
          {isStreaming ? (
            <>
              <VideoOff className="w-4 h-4" />
              <span>Stop Camera</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              <span>Start Camera</span>
            </>
          )}
        </button>
      </div>

      {/* Action Buttons Group */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Calibrate Posture */}
        <button
          onClick={handleCalibrate}
          disabled={!isStreaming || isCalibrating}
          title="Sit in your natural ideal upright posture and click to calibrate"
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
            !isStreaming
              ? 'opacity-40 cursor-not-allowed bg-slate-800/50 text-slate-500 border-slate-800'
              : justCalibrated
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
          }`}
        >
          {justCalibrated ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300">Calibrated!</span>
            </>
          ) : (
            <>
              <Crosshair className={`w-4 h-4 text-indigo-400 ${isCalibrating ? 'animate-spin' : ''}`} />
              <span>Calibrate Posture</span>
            </>
          )}
        </button>

        {/* Reset Session */}
        <button
          onClick={handleReset}
          disabled={isResetting}
          title="Reset timer and posture statistics"
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all cursor-pointer"
        >
          <RotateCcw className={`w-4 h-4 text-amber-400 ${isResetting ? 'animate-spin' : ''}`} />
          <span>Reset Session</span>
        </button>

        {/* Mute Audio Alerts */}
        <button
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
              <span>Alerts On</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
