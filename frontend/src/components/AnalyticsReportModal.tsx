import React, { useState, useEffect } from 'react';
import { X, BarChart3, Clock, CheckCircle2, Award, Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import type { AnalyticsReport } from '../types/ergosense';

interface AnalyticsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
}

export const AnalyticsReportModal: React.FC<AnalyticsReportModalProps> = ({
  isOpen,
  onClose,
  sessionToken,
}) => {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    if (!sessionToken) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/sessions/report?session_token=${sessionToken}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch report: ${res.statusText}`);
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Error loading analytics report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport();
    }
  }, [isOpen, sessionToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700/80 p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
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
          <div className="p-3 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-400">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-cyan-400 block">
              Session Analytics
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Ergonomic Health &amp; Compliance Report
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm font-medium">Generating Ergonomic Telemetry Report...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : report ? (
            <>
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Duration</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-white">
                    {Math.floor(report.total_duration_sec / 60)}m {report.total_duration_sec % 60}s
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Compliance</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-emerald-400">
                    {report.good_posture_percentage}%
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>Avg RULA</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-amber-400">
                    {report.average_rula}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                    <span>Stretches</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-purple-400">
                    {report.stretches_completed}
                  </span>
                </div>
              </div>

              {/* Degradation Heatmap / Breakdown */}
              <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Hourly Posture Degradation
                </h3>

                {report.hourly_degradation && report.hourly_degradation.length > 0 ? (
                  <div className="space-y-2">
                    {report.hourly_degradation.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
                      >
                        <span className="font-mono text-slate-400">{h.hour}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-slate-300">
                            Avg RULA: <strong className="font-mono text-amber-400">{h.avg_rula}</strong>
                          </span>
                          <span className="text-slate-400">
                            Alerts: <strong className="font-mono text-rose-400">{h.poor_events}</strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    Session recently started. Telemetry points are aggregating.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={fetchReport}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all border border-slate-700"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
