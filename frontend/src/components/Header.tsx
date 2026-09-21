import React from 'react';
import { Activity, Wifi, WifiOff, Camera, VideoOff } from 'lucide-react';
import type { ConnectionState } from '../types/posture';

interface HeaderProps {
  connectionState: ConnectionState;
  isStreaming: boolean;
  fps: number;
}

export const Header: React.FC<HeaderProps> = ({ connectionState, isStreaming, fps }) => {
  const isConnected = connectionState === 'connected';

  return (
    <header className="w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo and branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              ErgoVision <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">FastAPI + React</span>
            </h1>
            <p className="text-xs text-slate-400">Real-Time Ergonomic Posture Monitor</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center space-x-3">
          {/* WebSocket status */}
          <div
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : connectionState === 'connecting'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Stream Connected</span>
                {fps > 0 && <span className="opacity-75 text-[10px]">({fps} FPS)</span>}
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="capitalize">{connectionState}</span>
              </>
            )}
          </div>

          {/* Camera status */}
          <div
            className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
              isStreaming
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {isStreaming ? (
              <>
                <Camera className="w-3.5 h-3.5" />
                <span>Webcam Active</span>
              </>
            ) : (
              <>
                <VideoOff className="w-3.5 h-3.5" />
                <span>Webcam Inactive</span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
