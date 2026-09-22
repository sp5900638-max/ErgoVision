import React from 'react';
import { Compass, MoveVertical, ShieldAlert } from 'lucide-react';
import type { KinematicsMetrics, SessionBaselines } from '../types/ergosense';

interface KinematicsCardProps {
  kinematics: KinematicsMetrics;
  baselines: SessionBaselines;
}

export const KinematicsCard: React.FC<KinematicsCardProps> = ({
  kinematics,
  baselines,
}) => {
  const { cva_deg, shoulder_tilt_deg, trunk_angle_deg } = kinematics;

  // CVA Status: normal 50-55, mild slouch 44-49, severe <44
  const cvaGood = cva_deg >= 48;
  const cvaWarning = cva_deg >= 42 && cva_deg < 48;
  const cvaColor = cvaGood ? 'text-emerald-400' : cvaWarning ? 'text-amber-400' : 'text-rose-400';
  const cvaBarColor = cvaGood ? 'bg-emerald-500' : cvaWarning ? 'bg-amber-500' : 'bg-rose-500';

  // Shoulder Tilt Status: < 5 good, 5-9 mild, >= 10 high
  const shoulderGood = shoulder_tilt_deg <= 4.5;
  const shoulderWarning = shoulder_tilt_deg > 4.5 && shoulder_tilt_deg <= 9.0;
  const shoulderColor = shoulderGood
    ? 'text-emerald-400'
    : shoulderWarning
    ? 'text-amber-400'
    : 'text-rose-400';
  const shoulderBarColor = shoulderGood
    ? 'bg-emerald-500'
    : shoulderWarning
    ? 'bg-amber-500'
    : 'bg-rose-500';

  // Trunk Angle Status: < 12 good, 12-18 mild, > 18 high
  const trunkGood = trunk_angle_deg <= 11;
  const trunkWarning = trunk_angle_deg > 11 && trunk_angle_deg <= 18;
  const trunkColor = trunkGood
    ? 'text-emerald-400'
    : trunkWarning
    ? 'text-amber-400'
    : 'text-rose-400';
  const trunkBarColor = trunkGood
    ? 'bg-emerald-500'
    : trunkWarning
    ? 'bg-amber-500'
    : 'bg-rose-500';

  return (
    <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide uppercase flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>3D Biomechanical Kinematics</span>
          </h3>
          <p className="text-xs text-slate-400">Joint spatial vectors via 1D Kalman filter</p>
        </div>

        {baselines.is_calibrated && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Calibrated
          </span>
        )}
      </div>

      {/* Metrics List */}
      <div className="space-y-4 py-3">
        {/* Metric 1: CVA */}
        <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-300">Craniovertebral Angle (CVA)</span>
              {!cvaGood && <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <div className="text-right">
              <span className={`text-base font-bold font-mono ${cvaColor}`}>
                {cva_deg}°
              </span>
              <span className="text-[10px] text-slate-500 ml-1">
                (Base: {baselines.baseline_cva}°)
              </span>
            </div>
          </div>
          {/* CVA Progress Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${cvaBarColor} transition-all duration-300`}
              style={{ width: `${Math.min(100, (cva_deg / 70) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>&lt;40° (Severe Forward Head)</span>
            <span className="text-emerald-400/80">50° - 55° Target</span>
            <span>&gt;60°</span>
          </div>
        </div>

        {/* Metric 2: Shoulder Tilt */}
        <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-300">Lateral Shoulder Tilt</span>
            <div className="text-right">
              <span className={`text-base font-bold font-mono ${shoulderColor}`}>
                {shoulder_tilt_deg}°
              </span>
              <span className="text-[10px] text-slate-500 ml-1">
                {shoulderGood ? 'Level' : 'Asymmetrical'}
              </span>
            </div>
          </div>
          {/* Shoulder Tilt Progress Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${shoulderBarColor} transition-all duration-300`}
              style={{ width: `${Math.min(100, (shoulder_tilt_deg / 20) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span className="text-emerald-400/80">0° (Balanced)</span>
            <span>5° (Mild)</span>
            <span>&gt;10° (Skewed)</span>
          </div>
        </div>

        {/* Metric 3: Trunk Angle */}
        <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <MoveVertical className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-300">Spine Trunk Inclination</span>
            </div>
            <div className="text-right">
              <span className={`text-base font-bold font-mono ${trunkColor}`}>
                {trunk_angle_deg}°
              </span>
              <span className="text-[10px] text-slate-500 ml-1">
                {trunkGood ? 'Neutral' : 'Leaning'}
              </span>
            </div>
          </div>
          {/* Trunk Progress Bar */}
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${trunkBarColor} transition-all duration-300`}
              style={{ width: `${Math.min(100, (trunk_angle_deg / 30) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span className="text-emerald-400/80">&lt;10° Upright</span>
            <span>15° Leaning</span>
            <span>&gt;25° Slouched</span>
          </div>
        </div>
      </div>
    </div>
  );
};
