import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AlertToastProps {
  showAlert: boolean;
  onDismiss?: () => void;
}

export const AlertToast: React.FC<AlertToastProps> = ({ showAlert, onDismiss }) => {
  if (!showAlert) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-bounce">
      <div className="bg-rose-950/95 border-2 border-rose-500 rounded-2xl p-4 shadow-2xl shadow-rose-900/50 backdrop-blur-md flex items-start space-x-3 text-white">
        <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
          <AlertTriangle className="w-5 h-5 animate-pulse text-rose-400" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            Posture Alert Triggered!
          </h4>
          <p className="text-xs text-rose-200 mt-1 leading-normal">
            You have maintained poor or slouched posture for several seconds. Lift your chest, pull your shoulders back, and level your head.
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-rose-300 hover:text-white p-1 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
