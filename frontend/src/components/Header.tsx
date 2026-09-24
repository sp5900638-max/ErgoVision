import React from 'react';
import { Activity, Wifi, WifiOff, Camera, VideoOff, ShieldCheck, Mic, BookOpen } from 'lucide-react';
import type { ConnectionState } from '../types/ergosense';

interface HeaderProps {
  connectionState: ConnectionState;
  isStreaming: boolean;
  fps: number;
  userSpeaking: boolean;
  privacyShield: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  connectionState,
  isStreaming,
  fps,
  userSpeaking,
  privacyShield,
}) => {
  const isConnected = connectionState === 'connected';

  return (
    <header className="w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo and branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              ErgoSense 360
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold tracking-wide uppercase">
                Privacy-First CV
              </span>
            </h1>
            <p className="text-xs text-slate-400">Real-Time Biomechanical &amp; Vision Health Monitor</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Privacy Status */}
          <div
            className={`hidden md:flex items-center space-x-1.5 px-3 py-1 rounded-full border text-xs font-medium ${
              privacyShield
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{privacyShield ? 'Wireframe Only' : 'Zero Video Sent'}</span>
          </div>

          {/* Voice Detection Indicator */}
          {userSpeaking && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium animate-pulse">
              <Mic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Speaking (Muted)</span>
            </div>
          )}

          {/* Telemetry Stream Status */}
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
                <span className="hidden sm:inline">Telemetry Live</span>
                {fps > 0 && <span className="opacity-75 text-[10px] font-mono">({fps} FPS)</span>}
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
                <span>Camera Active</span>
              </>
            ) : (
              <>
                <VideoOff className="w-3.5 h-3.5" />
                <span>Camera Idle</span>
              </>
            )}
          </div>

          {/* API Docs Link */}
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-full border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
            title="Open Swagger API documentation"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>API Docs</span>
          </a>
        </div>
      </div>
    </header>
  );
};
