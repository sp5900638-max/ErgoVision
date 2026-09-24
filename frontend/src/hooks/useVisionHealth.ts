/**
 * Vision Health Hook:
 * - 20-20-20 Rule interval timer (every 20 minutes look 20 ft away for 20 seconds)
 * - Eye Aspect Ratio (EAR) blink rate monitoring
 * - Real-time ambient room lighting condition analyzer
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { BlinkDetector } from '../core/visionProximity';
import type { VisionMetrics } from '../types/ergosense';

export interface VisionHealthHook {
  visionMetrics: VisionMetrics;
  isBreakActive: boolean;
  breakCountdownSec: number;
  dismissBreak: () => void;
  resetTwentyRule: () => void;
  processVisionFrame: (
    earValue: number,
    ipdRaw: number,
    baselineIpd: number,
    videoElement?: HTMLVideoElement | null
  ) => void;
}

const TWENTY_MINUTES_SEC = 20 * 60; // 1200 seconds
const TWENTY_SECONDS_BREAK = 20;

export function useVisionHealth(): VisionHealthHook {
  const [twentySecondsRemaining, setTwentySecondsRemaining] = useState<number>(TWENTY_MINUTES_SEC);
  const [isBreakActive, setIsBreakActive] = useState<boolean>(false);
  const [breakCountdownSec, setBreakCountdownSec] = useState<number>(TWENTY_SECONDS_BREAK);

  const [visionMetrics, setVisionMetrics] = useState<VisionMetrics>({
    ipd_raw: 0.08,
    ipd_ratio: 1.0,
    proximity_alert: false,
    ear_value: 0.28,
    blinks_per_min: 16,
    ambient_lux: 130,
    lighting_status: 'Optimal',
    twenty_rule_seconds_remaining: TWENTY_MINUTES_SEC,
  });

  const blinkDetectorRef = useRef<BlinkDetector>(new BlinkDetector());
  const lastLuxCheckRef = useRef<number>(0);
  const cachedLuxRef = useRef<{ lux: number; status: 'Low' | 'Optimal' | 'Glaring' }>({
    lux: 130,
    status: 'Optimal',
  });

  // Dedicated offscreen sampling canvas for ambient lighting
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 20-20-20 timer countdown effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTwentySecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsBreakActive(true);
          setBreakCountdownSec(TWENTY_SECONDS_BREAK);
          return TWENTY_MINUTES_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Break countdown effect when 20-20-20 break is triggered
  useEffect(() => {
    let breakTimer: number | null = null;
    if (isBreakActive) {
      breakTimer = window.setInterval(() => {
        setBreakCountdownSec((prev) => {
          if (prev <= 1) {
            setIsBreakActive(false);
            return TWENTY_SECONDS_BREAK;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (breakTimer !== null) window.clearInterval(breakTimer);
    };
  }, [isBreakActive]);

  const dismissBreak = useCallback(() => {
    setIsBreakActive(false);
    setBreakCountdownSec(TWENTY_SECONDS_BREAK);
  }, []);

  const resetTwentyRule = useCallback(() => {
    setTwentySecondsRemaining(TWENTY_MINUTES_SEC);
    setIsBreakActive(false);
    setBreakCountdownSec(TWENTY_SECONDS_BREAK);
  }, []);

  const processVisionFrame = useCallback(
    (
      earValue: number,
      ipdRaw: number,
      baselineIpd: number,
      videoElement?: HTMLVideoElement | null
    ) => {
      const now = Date.now();
      const blinksPerMin = blinkDetectorRef.current.processEAR(earValue, now);

      // Check ambient lighting every 2 seconds from the video feed
      if (videoElement && videoElement.readyState >= 2 && now - lastLuxCheckRef.current > 2000) {
        lastLuxCheckRef.current = now;
        try {
          if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
            offscreenCanvasRef.current.width = 16;
            offscreenCanvasRef.current.height = 12;
          }
          const canvas = offscreenCanvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(videoElement, 0, 0, 16, 12);
            const imgData = ctx.getImageData(0, 0, 16, 12);
            const d = imgData.data;
            let sum = 0;
            const count = d.length / 4;
            for (let i = 0; i < d.length; i += 4) {
              sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            }
            const lux = Math.round(sum / count);
            let status: 'Low' | 'Optimal' | 'Glaring' = 'Optimal';
            if (lux < 45) status = 'Low';
            else if (lux > 215) status = 'Glaring';
            cachedLuxRef.current = { lux, status };
          }
        } catch {
          // Keep cached
        }
      }

      const validBaseline = baselineIpd > 0.01 ? baselineIpd : 0.08;
      const ipdRatio = Math.round((ipdRaw / validBaseline) * 100) / 100;
      const proximityAlert = ipdRatio > 1.25;

      setVisionMetrics({
        ipd_raw: Math.round(ipdRaw * 1000) / 1000,
        ipd_ratio: ipdRatio,
        proximity_alert: proximityAlert,
        ear_value: Math.round(earValue * 100) / 100,
        blinks_per_min: blinksPerMin,
        ambient_lux: cachedLuxRef.current.lux,
        lighting_status: cachedLuxRef.current.status,
        twenty_rule_seconds_remaining: twentySecondsRemaining,
      });
    },
    [twentySecondsRemaining]
  );

  return {
    visionMetrics,
    isBreakActive,
    breakCountdownSec,
    dismissBreak,
    resetTwentyRule,
    processVisionFrame,
  };
}
