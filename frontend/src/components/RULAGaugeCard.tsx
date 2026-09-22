import React from 'react';
import { Award, AlertTriangle, CheckCircle, Flame } from 'lucide-react';
import type { RulaEvaluation } from '../types/ergosense';

interface RULAGaugeCardProps {
  rula: RulaEvaluation;
  dailyErgoScore: number;
  goodPosturePercentage: number;
  stretchesCompleted?: number;
}

export const RULAGaugeCard: React.FC<RULAGaugeCardProps> = ({
  rula,
  dailyErgoScore,
  goodPosturePercentage,
  stretchesCompleted = 0,
}) => {
  const rulaScore = rula.rula_score;
  const scorePercent = Math.min(100, Math.round((rulaScore / 7) * 100));

  return (
    <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase flex items-center gap-2">
            <span>RULA Biomechanical Score</span>
          </h3>
          <p className="text-xs text-slate-400">Rapid Upper Limb Assessment (1 - 7 scale)</p>
        </div>

        {/* Daily Ergo Score Pill */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700/60 shadow-inner">
          <Award className="w-4 h-4 text-amber-400" />
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block leading-none">Daily Score</span>
            <span className="text-sm font-bold text-white font-mono leading-none">
              {dailyErgoScore}/100
            </span>
          </div>
        </div>
      </div>

      {/* Main Meter Area */}
      <div className="py-4 flex flex-col items-center justify-center">
        {/* Score Radial / Segmented Indicator */}
        <div className="relative w-36 h-36 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke="#1e293b"
              strokeWidth="8"
            />
            {/* Value Arc */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke={rula.color_hex}
              strokeWidth="8"
              strokeDasharray="251.2"
              strokeDashoffset={251.2 - (251.2 * scorePercent) / 100}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          </svg>

          {/* Central Score Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span
              className="text-4xl font-extrabold font-mono tracking-tight"
              style={{ color: rula.color_hex }}
            >
              {rulaScore}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              of 7
            </span>
          </div>
        </div>

        {/* Action Category Badge */}
        <div
          className="mt-3 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase border shadow-md flex items-center gap-1.5"
          style={{
            backgroundColor: `${rula.color_hex}1f`,
            borderColor: `${rula.color_hex}4d`,
            color: rula.color_hex,
          }}
        >
          {rulaScore <= 2 ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : rulaScore <= 4 ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Flame className="w-3.5 h-3.5" />
          )}
          <span>{rula.status}</span>
        </div>

        {/* 7-Segment Scale Visualizer */}
        <div className="w-full grid grid-cols-7 gap-1.5 mt-4">
          {[1, 2, 3, 4, 5, 6, 7].map((num) => {
            const isFilled = num <= rulaScore;
            const segmentColor =
              num <= 2
                ? 'bg-emerald-500'
                : num <= 4
                ? 'bg-amber-500'
                : num <= 6
                ? 'bg-orange-500'
                : 'bg-rose-500';

            return (
              <div
                key={num}
                className={`h-2 rounded-full transition-all duration-300 ${
                  isFilled ? segmentColor : 'bg-slate-800'
                }`}
                title={`RULA ${num}`}
              />
            );
          })}
        </div>
        <div className="w-full flex justify-between text-[10px] text-slate-500 mt-1 font-mono px-0.5">
          <span>1 (Optimal)</span>
          <span>4 (Moderate)</span>
          <span>7 (High Strain)</span>
        </div>
      </div>

      {/* Clinical Recommendation Message */}
      <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 text-xs text-slate-300 mt-2">
        <span className="font-semibold text-slate-200 block mb-1">Recommendation:</span>
        <p className="leading-relaxed text-slate-400">{rula.action_recommendation}</p>

        <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>Good Posture: <strong className="text-emerald-400 font-mono">{goodPosturePercentage}%</strong></span>
          <span>Stretches: <strong className="text-indigo-400 font-mono">{stretchesCompleted}</strong></span>
        </div>
      </div>
    </div>
  );
};
