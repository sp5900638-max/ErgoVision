/**
 * Web Audio API Alert Chime Generator
 * Provides dual-tone soft notification chimes.
 * Automatically suppresses chime playback when userSpeaking is true.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioAlertProps {
  throttleSeconds?: number;
  userSpeaking?: boolean;
}

interface UseAudioAlertReturn {
  isMuted: boolean;
  toggleMute: () => void;
  playAlertSound: () => void;
  isAutoSuppressed: boolean;
}

export function useAudioAlert({
  throttleSeconds = 5.0,
  userSpeaking = false,
}: UseAudioAlertProps = {}): UseAudioAlertReturn {
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('posture_audio_muted');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastAlertTimestampRef = useRef<number>(0);

  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtxRef.current = new AudioCtxClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const toggleMute = useCallback(() => {
    initAudioContext();
    setIsMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('posture_audio_muted', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, [initAudioContext]);

  // Plays a dual-tone gentle notification chime unless muted or user is speaking
  const playAlertSound = useCallback(() => {
    if (isMuted || userSpeaking) return;

    const now = Date.now();
    if (now - lastAlertTimestampRef.current < throttleSeconds * 1000) {
      return;
    }
    lastAlertTimestampRef.current = now;

    initAudioContext();
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(440.0, ctx.currentTime + 0.35); // A4

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.warn('Audio alert playback error:', e);
    }
  }, [isMuted, userSpeaking, throttleSeconds, initAudioContext]);

  useEffect(() => {
    const handleFirstGesture = () => {
      initAudioContext();
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };

    window.addEventListener('click', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);

    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [initAudioContext]);

  return {
    isMuted,
    toggleMute,
    playAlertSound,
    isAutoSuppressed: Boolean(userSpeaking && !isMuted),
  };
}
