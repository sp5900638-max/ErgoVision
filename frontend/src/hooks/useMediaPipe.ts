/**
 * In-Browser MediaPipe Pose & Face Landmarker Engine with 1D Kalman Filtering.
 * Guarantees 100% video stream privacy — all computer vision runs directly on the client.
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

  // Alert temporal logic: 10 consecutive seconds of poor posture before alert
  const poorStartTimeRef = useRef<number | null>(null);
  const isPoorRef = useRef<boolean>(false);
  const consecutiveCountRef = useRef<number>(0);

  // Initialize MediaPipe Tasks
  useEffect(() => {
    let isCancelled = false;

    async function initMediaPipe() {
      try {
        setIsLoading(true);
        setError(null);

        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        if (isCancelled) return;

        // Initialize Pose Landmarker
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.6,
          minPosePresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        if (isCancelled) return;
        poseLandmarkerRef.current = poseLandmarker;

        // Initialize Face Landmarker for IPD and EAR
        try {
          const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            minFaceDetectionConfidence: 0.6,
            minFacePresenceConfidence: 0.6,
            minTrackingConfidence: 0.6,
            outputFacialTransformationMatrixes: false,
          });
          if (!isCancelled) {
            faceLandmarkerRef.current = faceLandmarker;
          }
        } catch (faceErr) {
          console.warn('FaceLandmarker GPU init fallback to CPU or skipped:', faceErr);
        }

        if (!isCancelled) {
          setModelLoaded(true);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Failed to initialize MediaPipe vision tasks:', err);
        if (!isCancelled) {
          setError(err?.message || 'Failed to load MediaPipe models');
          setIsLoading(false);
        }
      }
    }

    initMediaPipe();

    return () => {
      isCancelled = true;
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
      }
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
    };
  }, []);

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
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
  }, []);

  const startInference = useCallback(
    (videoElement: HTMLVideoElement, _canvasElement?: HTMLCanvasElement) => {
      if (!poseLandmarkerRef.current) return;
      isRunningRef.current = true;

      const processFrame = () => {
        if (!isRunningRef.current) return;

        if (
          videoElement.readyState >= 2 &&
          videoElement.currentTime !== lastVideoTimeRef.current
        ) {
          lastVideoTimeRef.current = videoElement.currentTime;
          const timestampMs = performance.now();

          // 1. Pose Inference
          let rawPoseLandmarks: Point3D[] = [];
          if (poseLandmarkerRef.current) {
            try {
              const poseResult = poseLandmarkerRef.current.detectForVideo(videoElement, timestampMs);
              if (poseResult.landmarks && poseResult.landmarks.length > 0) {
                rawPoseLandmarks = poseResult.landmarks[0] as Point3D[];
              }
            } catch (err) {
              // Video frame skip
            }
          }

          // 2. Face Inference for IPD and EAR
          let currentEar = 0.28;
          let currentIpd = 0.08;

          if (faceLandmarkerRef.current) {
            try {
              const faceResult = faceLandmarkerRef.current.detectForVideo(videoElement, timestampMs);
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

                // IPD from eye corners or pupils (approx 468/473 iris center if available, else 133 and 362)
                const leftEyeCenter = fl[468] || fl[133];
                const rightEyeCenter = fl[473] || fl[362];
                if (leftEyeCenter && rightEyeCenter) {
                  currentIpd = computeIPD(leftEyeCenter, rightEyeCenter);
                }
              }
            } catch (err) {
              // Face skip
            }
          }

          if (rawPoseLandmarks.length > 24) {
            // Apply 1D Kalman filter to key landmark coordinates
            const kf = kalmanFilterRef.current;
            const nose = kf.filterPoint('nose', rawPoseLandmarks[0]);
            const leftEar = kf.filterPoint('l_ear', rawPoseLandmarks[7]);
            const rightEar = kf.filterPoint('r_ear', rawPoseLandmarks[8]);
            const leftShoulder = kf.filterPoint('l_sh', rawPoseLandmarks[11]);
            const rightShoulder = kf.filterPoint('r_sh', rawPoseLandmarks[12]);
            const leftHip = kf.filterPoint('l_hip', rawPoseLandmarks[23]);
            const rightHip = kf.filterPoint('r_hip', rawPoseLandmarks[24]);

            // Approximate C7 and tragus
            const midShoulder = midpoint3D(leftShoulder, rightShoulder);
            const midEar = midpoint3D(leftEar, rightEar);
            const midHip = midpoint3D(leftHip, rightHip);

            // Compute biomechanical angles
            const cvaDeg = computeCVA(midEar, midShoulder);
            const shoulderTiltDeg = computeShoulderTilt(leftShoulder, rightShoulder);
            const trunkAngleDeg = computeTrunkAngle(midShoulder, midHip);

            const smoothedLandmarks = [
              nose, leftEar, rightEar, leftShoulder, rightShoulder, leftHip, rightHip,
              midShoulder, midEar, midHip
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

            // Temporal alert evaluation: 10 consecutive seconds of RULA >= 5 or severe proximity
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

                // Check if threshold for guided stretch intervention (3) is reached
                if (consecutiveCountRef.current >= 3 && onPoorThresholdReached) {
                  onPoorThresholdReached();
                }
              }
            } else {
              // Posture recovered
              poorStartTimeRef.current = null;
              isPoorRef.current = false;
              setAlertActive(false);
              setPoorPostureDurationSec(0);
            }
          }
        }

        animFrameIdRef.current = requestAnimationFrame(processFrame);
      };

      animFrameIdRef.current = requestAnimationFrame(processFrame);
    },
    [baselines.baseline_ipd, onPoorThresholdReached]
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
  };
}
