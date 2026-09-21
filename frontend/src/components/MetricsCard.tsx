import React from 'react';
import { ShieldCheck, Compass, MoveVertical, Scale } from 'lucide-react';
import type { PostureMetrics, PostureStatus } from '../types/posture';

interface MetricsCardProps {
  score: number;
  status: PostureStatus;
  metrics: PostureMetrics;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ score, status, metrics }) => {
  // Score color gradient
  const getScoreColor = (s: number) => {
    if (s >= 80) return { stroke: '#10b981', text: 'text-emerald-400', label: `${status} (Optimal)` };
    if (s >= 60) return { stroke: '#f59e0b', text: 'text-amber-400', label: `${status} (Acceptable)` };
    return { stroke: '#ef4444', text: 'text-rose-400', label: `${status} (Needs Fix)` };
  };

  const scoreInfo = getScoreColor(score);

  // SVG Circular Gauge calculation
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Real-Time Metrics
        </h2>
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 font-medium">
          Live CV
        </span>
      </div>

      {/* Main Score Gauge */}
      <div className="flex items-center justify-center my-2">
        <div className="relative w-36 h-36 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background track circle */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              className="text-slate-800"
              fill="transparent"
            />
            {/* Progress circle */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              stroke={scoreInfo.stroke}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className={`text-4xl font-extrabold tracking-tight ${scoreInfo.text}`}>
              {score}
            </span>
            <span className="text-[11px] font-medium text-slate-400 mt-0.5">
              {scoreInfo.label}
            </span>
          </div>
        </div>
      </div>

      {/* Metric Breakdown Grid */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        {/* Head Tilt */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex flex-col">
          <div className="flex items-center space-x-1.5 text-slate-400 mb-1">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-medium">Head Tilt</span>
          </div>
          <div className="mt-auto">
            <span className="text-lg font-bold text-white tracking-tight">
              {metrics.head_tilt_angle.toFixed(1)}°
            </span>
            <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.head_tilt_angle < 8
                    ? 'bg-emerald-400'
                    : metrics.head_tilt_angle < 15
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(metrics.head_tilt_angle * 3.5, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Slouch Ratio */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex flex-col">
          <div className="flex items-center space-x-1.5 text-slate-400 mb-1">
            <MoveVertical className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] font-medium">Slouch Ratio</span>
          </div>
          <div className="mt-auto">
            <span className="text-lg font-bold text-white tracking-tight">
              {metrics.slouch_ratio.toFixed(2)}
            </span>
            <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.slouch_ratio >= 0.90
                    ? 'bg-emerald-400'
                    : metrics.slouch_ratio >= 0.78
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(metrics.slouch_ratio * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Shoulder Alignment */}
        <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex flex-col">
          <div className="flex items-center space-x-1.5 text-slate-400 mb-1">
            <Scale className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-medium">Shoulder Tilt</span>
          </div>
          <div className="mt-auto">
            <span className="text-lg font-bold text-white tracking-tight">
              {metrics.shoulder_tilt.toFixed(1)}°
            </span>
            <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.shoulder_tilt < 5
                    ? 'bg-emerald-400'
                    : metrics.shoulder_tilt < 10
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(metrics.shoulder_tilt * 7, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
