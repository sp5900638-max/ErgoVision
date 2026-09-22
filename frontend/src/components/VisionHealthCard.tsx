import React from 'react';
import { Eye, Sun, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { VisionMetrics } from '../types/ergosense';

interface VisionHealthCardProps {
  vision: VisionMetrics;
  onResetTwentyRule: () => void;
}

export const VisionHealthCard: React.FC<VisionHealthCardProps> = ({
  vision,
  onResetTwentyRule,
}) => {
  const {
    ipd_ratio,
    proximity_alert,
    blinks_per_min,
    ambient_lux,
    lighting_status,
    twenty_rule_seconds_remaining,
  } = vision;

  // Format 20-20-20 timer
  const minutes = Math.floor(twenty_rule_seconds_remaining / 60);
  const seconds = twenty_rule_seconds_remaining % 60;
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const timerPercent = Math.round(((1200 - twenty_rule_seconds_remaining) / 1200) * 100);

  // Blink rate status: normal 14-22, low < 10
  const blinkLow = blinks_per_min < 10;
  const blinkColor = blinkLow ? 'text-amber-400' : 'text-emerald-400';

  // Lux color
  const luxColor =
    lighting_status === 'Optimal'
      ? 'text-emerald-400'
      : lighting_status === 'Low'
      ? 'text-amber-400'
      : 'text-rose-400';

  return (
    <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-400" />
            <span>Vision Health &amp; Proximity</span>
          </h3>
          <p className="text-xs text-slate-400">IPD proximity, blink frequency, and 20-20-20 rule</p>
        </div>

        {proximity_alert ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Too Close (&lt;45cm)
          </span>
        ) : (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Optimal Distance
          </span>
        )}
      </div>

      {/* Grid of Vision Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3">
        {/* Metric 1: IPD Proximity */}
        <div
          className={`p-3 rounded-xl border transition-colors ${
            proximity_alert
              ? 'bg-rose-950/30 border-rose-500/40'
              : 'bg-slate-950/50 border-slate-800/60'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">IPD Proximity</span>
            <span
              className={`text-xs font-mono font-bold ${
                proximity_alert ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {ipd_ratio}x
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden my-1.5">
            <div
              className={`h-full ${
                proximity_alert ? 'bg-rose-500' : 'bg-emerald-500'
              } transition-all duration-300`}
              style={{ width: `${Math.min(100, (ipd_ratio / 1.5) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {proximity_alert ? 'Lean back (>50cm recommended)' : 'Healthy viewing distance'}
          </p>
        </div>

        {/* Metric 2: Blink Rate */}
        <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-400">Blink Frequency</span>
            <span className={`text-xs font-mono font-bold ${blinkColor}`}>
              {blinks_per_min} / min
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden my-1.5">
            <div
              className={`h-full ${
                blinkLow ? 'bg-amber-500' : 'bg-emerald-500'
              } transition-all duration-300`}
              style={{ width: `${Math.min(100, (blinks_per_min / 25) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {blinkLow ? 'Dry eye risk! Blink frequently' : 'Hydrated blink rate'}
          </p>
        </div>

        {/* Metric 3: Ambient Lux */}
        <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <Sun className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] font-medium text-slate-400">Ambient Lux</span>
            </div>
            <span className={`text-xs font-mono font-bold ${luxColor}`}>
              {ambient_lux} Y
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden my-1.5">
            <div
              className={`h-full ${
                lighting_status === 'Optimal'
                  ? 'bg-emerald-500'
                  : lighting_status === 'Low'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              } transition-all duration-300`}
              style={{ width: `${Math.min(100, (ambient_lux / 255) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 capitalize">
            {lighting_status} room lighting
          </p>
        </div>
      </div>

      {/* 20-20-20 Rule Timer Widget */}
      <div className="mt-1 bg-slate-950/70 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">20-20-20 Eye Rest Timer</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                {timeFormatted} ({timerPercent}%)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Look 20 feet away for 20 seconds every 20 minutes to prevent myopia.
            </p>
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-indigo-500 transition-all duration-1000"
                style={{ width: `${timerPercent}%` }}
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetTwentyRule}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors border border-slate-700/60"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
