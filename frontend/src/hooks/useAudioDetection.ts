/**
 * Web Audio API Speech & Voice Energy Detector
 * Analyzes microphone energy level and sets userSpeaking = true
 * to automatically mute ergonomic alert sounds when the user is in a call or speaking.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface AudioDetectionHook {
  micEnergy: number;
  userSpeaking: boolean;
  isAudioPermissionGranted: boolean;
  toggleMic: () => Promise<void>;
  isMicActive: boolean;
}

export function useAudioDetection(): AudioDetectionHook {
  const [micEnergy, setMicEnergy] = useState<number>(0);
  const [userSpeaking, setUserSpeaking] = useState<boolean>(false);
  const [isAudioPermissionGranted, setIsAudioPermissionGranted] = useState<boolean>(false);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Speech detection threshold (RMS energy between 0.04 and 1.0)
  const SPEECH_THRESHOLD = 0.045;
  const SPEECH_HOLD_TIME_MS = 1500; // Hold userSpeaking flag for 1.5s after speech stops
  const lastSpeechTimeRef = useRef<number>(0);

  const startListening = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsAudioPermissionGranted(true);
      setIsMicActive(true);

      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const checkAudioLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getFloatTimeDomainData(dataArray);

        // Compute Root Mean Square (RMS) energy
        let sumSquares = 0.0;
        for (let i = 0; i < bufferLength; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        const normalizedEnergy = Math.min(1.0, Math.round(rms * 1000) / 100);

        setMicEnergy(normalizedEnergy);

        const now = Date.now();
        if (rms >= SPEECH_THRESHOLD) {
          lastSpeechTimeRef.current = now;
          setUserSpeaking(true);
        } else {
          if (now - lastSpeechTimeRef.current > SPEECH_HOLD_TIME_MS) {
            setUserSpeaking(false);
          }
        }

        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };

      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    } catch (err) {
      console.warn('Microphone access for voice detection was skipped or denied:', err);
      setIsAudioPermissionGranted(false);
      setIsMicActive(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsMicActive(false);
    setUserSpeaking(false);
    setMicEnergy(0);
  }, []);

  const toggleMic = useCallback(async () => {
    if (isMicActive) {
      stopListening();
    } else {
      await startListening();
    }
  }, [isMicActive, startListening, stopListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    micEnergy,
    userSpeaking,
    isAudioPermissionGranted,
    toggleMic,
    isMicActive,
  };
}
