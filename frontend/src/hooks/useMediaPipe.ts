/**
 * In-Browser MediaPipe Pose & Face Landmarker Engine with 1D Kalman Filtering.
 * Guarantees 100% video stream privacy — all computer vision runs directly on the client.
 * Features automated GPU-to-CPU delegate fallback and resilient model loading.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { PoseLandmarker, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { MultiPointKalmanFilter } from '../core/kalman';
import { computeCVA, computeShoulderTilt, computeTrunkAngle, evaluateRULA, midpoint3D } from '../core/kinematics';
import { computeEyeEAR, computeIPD } from '../core/visionProximity';
import type { Point3D, KinematicsMetrics, RulaEvaluation, SessionBaselines } from '../types/ergosense';

export interface MediaPipeHook {
  isLoading: boolean;
  modelLoaded: boolean;
  error: string | null;
  kinematics: KinematicsMetrics;
  rula: RulaEvaluation;
  earValue: number;
  ipdRaw: number;
  baselines: SessionBaselines;
  calibrate: () => void;
  alertActive: boolean;
  poorPostureDurationSec: number;
  consecutivePoorCount: number;
  resetAlert: () => void;
  landmarks: Point3D[];
  startInference: (videoElement: HTMLVideoElement, canvasElement?: HTMLCanvasElement) => void;
  stopInference: () => void;
  fps: number;
}

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function useMediaPipe(
  onPoorThresholdReached?: () => void
): MediaPipeHook {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);

  const [kinematics, setKinematics] = useState<KinematicsMetrics>({
    cva_deg: 52.0,
    shoulder_tilt_deg: 1.2,
    trunk_angle_deg: 6.5,
  });

  const [rula, setRula] = useState<RulaEvaluation>(evaluateRULA(52.0, 1.2, 6.5, 1.0));
  const [earValue, setEarValue] = useState<number>(0.28);
  const [ipdRaw, setIpdRaw] = useState<number>(0.08);

  const [baselines, setBaselines] = useState<SessionBaselines>({
    baseline_ipd: 0.08,
    baseline_cva: 52.0,
    baseline_shoulder_tilt: 0.0,
    is_calibrated: false,
  });

  const [alertActive, setAlertActive] = useState<boolean>(false);
  const [poorPostureDurationSec, setPoorPostureDurationSec] = useState<number>(0);
  const [consecutivePoorCount, setConsecutivePoorCount] = useState<number>(0);
  const [landmarks, setLandmarks] = useState<Point3D[]>([]);

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const kalmanFilterRef = useRef<MultiPointKalmanFilter>(new MultiPointKalmanFilter(0.008, 0.05));

  const animFrameIdRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const lastVideoTimeRef = useRef<number>(-1);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingInferenceRef = useRef<boolean>(false);

  // FPS calculation
  const frameCountRef = useRef<number>(0);
  const lastFpsTimestampRef = useRef<number>(performance.now());

  // Alert temporal logic: 10 consecutive seconds of poor posture before alert
  const poorStartTimeRef = useRef<number | null>(null);
  const isPoorRef = useRef<boolean>(false);
  const consecutiveCountRef = useRef<number>(0);

  // Core frame processing routine
  const processFrame = useCallback(() => {
    if (!isRunningRef.current || !activeVideoRef.current) return;
    const video = activeVideoRef.current;

    if (
      video.readyState >= 2 &&
      video.currentTime !== lastVideoTimeRef.current &&
      !video.paused &&
      !video.ended
    ) {
      lastVideoTimeRef.current = video.currentTime;
      const timestampMs = performance.now();

      // Track FPS
      frameCountRef.current++;
      if (timestampMs - lastFpsTimestampRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (timestampMs - lastFpsTimestampRef.current)));
        frameCountRef.current = 0;
        lastFpsTimestampRef.current = timestampMs;
      }

      // 1. Pose Inference
      let rawPoseLandmarks: Point3D[] = [];
      if (poseLandmarkerRef.current) {
        try {
          const poseResult = poseLandmarkerRef.current.detectForVideo(video, timestampMs);
          if (poseResult.landmarks && poseResult.landmarks.length > 0) {
            rawPoseLandmarks = poseResult.landmarks[0] as Point3D[];
          }
        } catch {
          // Skip frame on transient timestamp race
        }
      }

      // 2. Face Inference for IPD and EAR
      let currentEar = 0.28;
      let currentIpd = 0.08;

      if (faceLandmarkerRef.current) {
        try {
          const faceResult = faceLandmarkerRef.current.detectForVideo(video, timestampMs);
          if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            const fl = faceResult.faceLandmarks[0];

            // Left Eye: 33 (corner), 160 (top), 158 (top), 133 (corner), 153 (bot), 144 (bot)
            // Right Eye: 362 (corner), 385 (top), 387 (top), 263 (corner), 373 (bot), 380 (bot)
            if (fl[33] && fl[133] && fl[160] && fl[158] && fl[153] && fl[144]) {
              const leftEar = computeEyeEAR(fl[33], fl[160], fl[158], fl[133], fl[153], fl[144]);
              const rightEar = fl[362] && fl[263]
                ? computeEyeEAR(fl[362], fl[385], fl[387], fl[263], fl[373], fl[380])
                : leftEar;
              currentEar = (leftEar + rightEar) / 2;
            }

            // IPD from eye corners or pupils
            const leftEyeCenter = fl[468] || fl[133];
            const rightEyeCenter = fl[473] || fl[362];
            if (leftEyeCenter && rightEyeCenter) {
              currentIpd = computeIPD(leftEyeCenter, rightEyeCenter);
            }
          }
        } catch {
          // Skip frame on face error
        }
      }

      // Ensure key joints for desktop posture exist (shoulders at 11, 12; nose at 0; ears at 7, 8)
      if (rawPoseLandmarks.length >= 13 && rawPoseLandmarks[11] && rawPoseLandmarks[12]) {
        const kf = kalmanFilterRef.current;
        const nose = kf.filterPoint('nose', rawPoseLandmarks[0]);
        const leftEarRaw = rawPoseLandmarks[7];
        const rightEarRaw = rawPoseLandmarks[8];
        const leftEar = leftEarRaw ? kf.filterPoint('l_ear', leftEarRaw) : null;
        const rightEar = rightEarRaw ? kf.filterPoint('r_ear', rightEarRaw) : null;
        const leftShoulder = kf.filterPoint('l_sh', rawPoseLandmarks[11]);
        const rightShoulder = kf.filterPoint('r_sh', rawPoseLandmarks[12]);

        // Tragus reference: average if both ears visible, or single ear fallback
        let midEar: Point3D;
        if (leftEar && rightEar) {
          midEar = midpoint3D(leftEar, rightEar);
        } else if (leftEar) {
          midEar = leftEar;
        } else if (rightEar) {
          midEar = rightEar;
        } else {
          // Synthetic ear position above shoulder midpoint and behind nose
          midEar = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: nose.y,
            z: (nose.z || 0) + 0.05,
            visibility: 0.5,
          };
        }

        const midShoulder = midpoint3D(leftShoulder, rightShoulder);

        // Hips (23, 24) - desk seating tolerance: if hips off-screen, approximate below shoulders
        let midHip: Point3D;
        let leftHip: Point3D | null = null;
        let rightHip: Point3D | null = null;

        const rawLeftHip = rawPoseLandmarks[23];
        const rawRightHip = rawPoseLandmarks[24];
        const hipsVisible = rawLeftHip && rawRightHip &&
          (rawLeftHip.visibility === undefined || rawLeftHip.visibility > 0.3) &&
          (rawRightHip.visibility === undefined || rawRightHip.visibility > 0.3);

        if (hipsVisible) {
          leftHip = kf.filterPoint('l_hip', rawLeftHip);
          rightHip = kf.filterPoint('r_hip', rawRightHip);
          midHip = midpoint3D(leftHip, rightHip);
        } else {
          // Virtual desk seated hip reference
          midHip = {
            x: midShoulder.x,
            y: Math.min(1.0, midShoulder.y + 0.42),
            z: midShoulder.z,
            visibility: 0.4,
          };
        }

        // Biomechanical angle evaluation
        const cvaDeg = computeCVA(midEar, midShoulder);
        const shoulderTiltDeg = computeShoulderTilt(leftShoulder, rightShoulder);
        const trunkAngleDeg = computeTrunkAngle(midShoulder, midHip);

        const smoothedLandmarks: Point3D[] = [
          nose,
          leftEar || midEar,
          rightEar || midEar,
          leftShoulder,
          rightShoulder,
          leftHip || { x: midShoulder.x - 0.1, y: midHip.y, z: midHip.z, visibility: 0.3 },
          rightHip || { x: midShoulder.x + 0.1, y: midHip.y, z: midHip.z, visibility: 0.3 },
          midShoulder,
          midEar,
          midHip,
        ];
        setLandmarks(smoothedLandmarks);

        const baselineIpd = baselines.baseline_ipd || 0.08;
        const ipdRatio = currentIpd / baselineIpd;

        // Evaluate RULA score
        const evalResult = evaluateRULA(cvaDeg, shoulderTiltDeg, trunkAngleDeg, ipdRatio);

        setKinematics({
          cva_deg: cvaDeg,
          shoulder_tilt_deg: shoulderTiltDeg,
          trunk_angle_deg: trunkAngleDeg,
        });
        setRula(evalResult);
        setEarValue(currentEar);
        setIpdRaw(currentIpd);

        // Temporal alert evaluation: 10 consecutive seconds of poor posture
        const isPoor = evalResult.rula_score >= 5 || ipdRatio > 1.25;
        const now = Date.now();

        if (isPoor) {
          if (!poorStartTimeRef.current) {
            poorStartTimeRef.current = now;
          }
          const duration = Math.floor((now - poorStartTimeRef.current) / 1000);
          setPoorPostureDurationSec(duration);

          if (duration >= 10 && !isPoorRef.current) {
            isPoorRef.current = true;
            setAlertActive(true);
            consecutiveCountRef.current += 1;
            setConsecutivePoorCount(consecutiveCountRef.current);

            if (consecutiveCountRef.current >= 3 && onPoorThresholdReached) {
              onPoorThresholdReached();
            }
          }
        } else {
          poorStartTimeRef.current = null;
          isPoorRef.current = false;
          setAlertActive(false);
          setPoorPostureDurationSec(0);
        }
      }
    }

    if (isRunningRef.current) {
      animFrameIdRef.current = requestAnimationFrame(processFrame);
    }
  }, [baselines.baseline_ipd, onPoorThresholdReached]);

  // Initialize MediaPipe Tasks with automatic GPU -> CPU fallback
  useEffect(() => {
    let isCancelled = false;

    async function initMediaPipe() {
      try {
        setIsLoading(true);
        setError(null);

        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        if (isCancelled) return;

        // 1. Initialize Pose Landmarker (try GPU, fallback to CPU)
        let poseLandmarker: PoseLandmarker;
        try {
          poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: POSE_MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (gpuErr) {
          console.warn('PoseLandmarker GPU delegate failed, falling back to CPU:', gpuErr);
          poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: POSE_MODEL_URL,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }

        if (isCancelled) {
          poseLandmarker.close();
          return;
        }
        poseLandmarkerRef.current = poseLandmarker;

        // 2. Initialize Face Landmarker (try GPU, fallback to CPU)
        try {
          let faceLandmarker: FaceLandmarker | null = null;
          try {
            faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: FACE_MODEL_URL,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numFaces: 1,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
              outputFacialTransformationMatrixes: false,
            });
          } catch {
            faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: FACE_MODEL_URL,
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numFaces: 1,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
              outputFacialTransformationMatrixes: false,
            });
          }
          if (!isCancelled) {
            faceLandmarkerRef.current = faceLandmarker;
          }
        } catch (faceErr) {
          console.warn('FaceLandmarker initialization skipped, continuing with Pose only:', faceErr);
        }

        if (!isCancelled) {
          setModelLoaded(true);
          setIsLoading(false);

          // If startInference was invoked while models were still downloading, auto-start immediately!
          if (pendingInferenceRef.current && activeVideoRef.current && !isRunningRef.current) {
            isRunningRef.current = true;
            pendingInferenceRef.current = false;
            animFrameIdRef.current = requestAnimationFrame(processFrame);
          }
        }
      } catch (err: any) {
        console.error('Failed to initialize MediaPipe vision tasks:', err);
        if (!isCancelled) {
          setError(err?.message || 'Failed to load MediaPipe AI models');
          setIsLoading(false);
        }
      }
    }

    initMediaPipe();

    return () => {
      isCancelled = true;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
      }
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
    };
  }, [processFrame]);

  const calibrate = useCallback(() => {
    setBaselines({
      baseline_ipd: ipdRaw > 0.01 ? ipdRaw : 0.08,
      baseline_cva: kinematics.cva_deg,
      baseline_shoulder_tilt: kinematics.shoulder_tilt_deg,
      is_calibrated: true,
    });
    setAlertActive(false);
    setPoorPostureDurationSec(0);
    poorStartTimeRef.current = null;
    isPoorRef.current = false;
  }, [ipdRaw, kinematics.cva_deg, kinematics.shoulder_tilt_deg]);

  const resetAlert = useCallback(() => {
    setAlertActive(false);
    setPoorPostureDurationSec(0);
    poorStartTimeRef.current = null;
    isPoorRef.current = false;
  }, []);

  const stopInference = useCallback(() => {
    isRunningRef.current = false;
    pendingInferenceRef.current = false;
    activeVideoRef.current = null;
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    setFps(0);
  }, []);

  const startInference = useCallback(
    (videoElement: HTMLVideoElement, _canvasElement?: HTMLCanvasElement) => {
      activeVideoRef.current = videoElement;

      if (!poseLandmarkerRef.current) {
        // Model is still loading; flag pending start so it auto-starts as soon as model finishes!
        pendingInferenceRef.current = true;
        return;
      }

      if (!isRunningRef.current) {
        isRunningRef.current = true;
        pendingInferenceRef.current = false;
        animFrameIdRef.current = requestAnimationFrame(processFrame);
      }
    },
    [processFrame]
  );

  return {
    isLoading,
    modelLoaded,
    error,
    kinematics,
    rula,
    earValue,
    ipdRaw,
    baselines,
    calibrate,
    alertActive,
    poorPostureDurationSec,
    consecutivePoorCount,
    resetAlert,
    landmarks,
    startInference,
    stopInference,
    fps,
  };
}
