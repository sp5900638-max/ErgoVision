import React from 'react';
import { BarChart3, Clock, Lightbulb } from 'lucide-react';
import type { SessionStats, PostureStatus } from '../types/posture';

interface AnalyticsCardProps {
  stats: SessionStats;
  currentStatus: PostureStatus;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

export const AnalyticsCard: React.FC<AnalyticsCardProps> = ({ stats, currentStatus }) => {
  const totalSeconds = stats.good_time_sec + stats.poor_time_sec;
  const goodPercent = totalSeconds > 0 ? Math.round((stats.good_time_sec / totalSeconds) * 100) : 100;
  const poorPercent = 100 - goodPercent;

  return (
    <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            Session Analytics
          </h2>
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{formatDuration(totalSeconds)}</span>
          </div>
        </div>

        {/* Good vs Poor Ratio Header */}
        <div className="flex items-center justify-between text-xs font-medium mb-2">
          <div className="flex items-center space-x-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Good: {goodPercent}% ({formatDuration(stats.good_time_sec)})</span>
          </div>
          <div className="flex items-center space-x-1.5 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Poor: {poorPercent}% ({formatDuration(stats.poor_time_sec)})</span>
          </div>
        </div>

        {/* Live Segmented Progress Bar */}
        <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden flex shadow-inner">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
            style={{ width: `${goodPercent}%` }}
          />
          <div
            className="bg-gradient-to-r from-amber-500 to-rose-500 h-full transition-all duration-500"
            style={{ width: `${poorPercent}%` }}
          />
        </div>
      </div>

      {/* Ergonomic Insight & Tip */}
      <div className="mt-5 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-start space-x-3">
        <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
          <Lightbulb className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-200">Ergonomic Recommendation</h4>
          <p className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">
            {currentStatus === 'Good' && (
              'Excellent posture retention. Ensure your display is at eye level and take 20-second gaze breaks every 20 minutes.'
            )}
            {currentStatus === 'Warning' && (
              'Your head is beginning to drift forward. Roll your shoulders back and tuck your chin slightly to align your cervical spine.'
            )}
            {currentStatus === 'Poor' && (
              'Prolonged slouch detected! Straighten your lumbar spine, plant your feet flat, and align ears directly over your shoulders.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
