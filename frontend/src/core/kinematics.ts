/**
 * 3D Kinematics and Biomechanical RULA Ergonomic Evaluator
 * Computes Craniovertebral Angle (CVA), Shoulder Tilt, Spine Trunk Angle,
 * and standard RULA (1-7) Risk Assessment Score.
 */

import type { Point3D, RulaEvaluation, RulaLevel, PostureStatus } from '../types/ergosense';

/**
 * 3D Euclidean distance between two points.
 */
export function distance3D(p1: Point3D, p2: Point3D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Midpoint between two 3D coordinates.
 */
export function midpoint3D(p1: Point3D, p2: Point3D): Point3D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: ((p1.z || 0) + (p2.z || 0)) / 2,
    visibility: Math.min(p1.visibility ?? 1, p2.visibility ?? 1),
  };
}

/**
 * Calculates Craniovertebral Angle (CVA) in degrees.
 * Normal upright posture: 50° - 55°
 * Forward head slouch: < 48° (Severe: < 40°)
 *
 * @param tragus Ear tragus coordinate (left or right ear)
 * @param c7 C7 spinous process coordinate (approximated from shoulder midpoint)
 */
export function computeCVA(tragus: Point3D, c7: Point3D): number {
  // In screen/webcam coordinates, y increases downward.
  // Ear is above C7, so delta_y = c7.y - tragus.y is positive.
  const deltaY = Math.max(0.001, c7.y - tragus.y);
  const deltaX = tragus.x - c7.x;
  const deltaZ = (tragus.z || 0) - (c7.z || 0);

  // Horizontal plane distance
  const horizontalDist = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);

  // Angle with horizontal plane
  const angleRad = Math.atan2(deltaY, Math.max(0.0001, horizontalDist));
  const angleDeg = (angleRad * 180) / Math.PI;

  return Math.min(90, Math.max(10, Math.round(angleDeg * 10) / 10));
}

/**
 * Calculates horizontal shoulder tilt asymmetry in degrees.
 * Upright level: < 4°
 * Moderate tilt: 5° - 10°
 * High tilt: > 10°
 */
export function computeShoulderTilt(leftShoulder: Point3D, rightShoulder: Point3D): number {
  const deltaY = Math.abs(leftShoulder.y - rightShoulder.y);
  const deltaX = leftShoulder.x - rightShoulder.x;
  const deltaZ = (leftShoulder.z || 0) - (rightShoulder.z || 0);

  const horizontalSpan = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
  if (horizontalSpan < 0.001) return 0.0;

  const angleRad = Math.atan2(deltaY, horizontalSpan);
  const angleDeg = (angleRad * 180) / Math.PI;

  return Math.round(angleDeg * 10) / 10;
}

/**
 * Calculates spine trunk inclination angle with true vertical (0, -1, 0).
 * Upright neutral: < 10°
 * Leaning/hunched: > 15° - 20°
 */
export function computeTrunkAngle(midShoulder: Point3D, midHip: Point3D): number {
  // Vector from mid hip to mid shoulder (should point upward: negative y)
  const vx = midShoulder.x - midHip.x;
  const vy = midShoulder.y - midHip.y; // vy < 0 when shoulder is above hip
  const vz = (midShoulder.z || 0) - (midHip.z || 0);

  const mag = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (mag < 0.001) return 0.0;

  // Dot product with vertical unit vector (0, -1, 0) is -vy
  const cosTheta = Math.max(-1.0, Math.min(1.0, -vy / mag));
  const thetaDeg = (Math.acos(cosTheta) * 180) / Math.PI;

  return Math.round(thetaDeg * 10) / 10;
}

/**
 * Evaluates comprehensive RULA Ergonomic Risk Score (1 to 7) based on biomechanical angles.
 *
 * Scoring Scale:
 * 1-2: Acceptable (Green #10b981) - Posture is acceptable if not maintained or repeated
 * 3-4: Further Investigation (Amber #f59e0b) - Further investigation needed, changes may be required
 * 5-6: Change Soon (Orange #f97316) - Investigation and changes required soon
 * 7:   Immediate Action (Red #ef4444) - Investigation and changes required immediately
 */
export function evaluateRULA(
  cvaDeg: number,
  shoulderTiltDeg: number,
  trunkAngleDeg: number,
  ipdRatio: number = 1.0
): RulaEvaluation {
  let rulaScore: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 1;

  // Base score from Craniovertebral Angle (CVA forward head posture)
  if (cvaDeg >= 50.0) {
    rulaScore = 1;
  } else if (cvaDeg >= 45.0) {
    rulaScore = 2;
  } else if (cvaDeg >= 40.0) {
    rulaScore = 4;
  } else if (cvaDeg >= 35.0) {
    rulaScore = 5;
  } else {
    rulaScore = 7;
  }

  // Adjust for excessive shoulder tilt asymmetry
  if (shoulderTiltDeg > 12.0) {
    rulaScore = Math.min(7, rulaScore + 2) as any;
  } else if (shoulderTiltDeg > 6.0) {
    rulaScore = Math.min(7, rulaScore + 1) as any;
  }

  // Adjust for trunk spine slouch/tilt
  if (trunkAngleDeg > 22.0) {
    rulaScore = Math.min(7, rulaScore + 2) as any;
  } else if (trunkAngleDeg > 14.0) {
    rulaScore = Math.min(7, rulaScore + 1) as any;
  }

  // Adjust for screen proximity slouch (leaning excessively close <45cm)
  if (ipdRatio > 1.35) {
    rulaScore = Math.min(7, rulaScore + 2) as any;
  } else if (ipdRatio > 1.25) {
    rulaScore = Math.min(7, rulaScore + 1) as any;
  }

  let level: RulaLevel;
  let status: PostureStatus;
  let colorHex: string;
  let actionRecommendation: string;

  if (rulaScore <= 2) {
    level = 'acceptable';
    status = 'Acceptable';
    colorHex = '#10b981'; // Emerald Green
    actionRecommendation = 'Optimal posture maintained. Keep spine upright and shoulders relaxed.';
  } else if (rulaScore <= 4) {
    level = 'investigate';
    status = 'Investigate';
    colorHex = '#f59e0b'; // Amber
    actionRecommendation = 'Slight slouch or forward head tilt detected. Gently tuck chin and align shoulders.';
  } else if (rulaScore <= 6) {
    level = 'change_soon';
    status = 'Change Soon';
    colorHex = '#f97316'; // Orange
    actionRecommendation = 'Pronounced posture fatigue. Sit upright, retract shoulders, and take a 20s break.';
  } else {
    level = 'immediate';
    status = 'Immediate Action';
    colorHex = '#ef4444'; // Rose Red
    actionRecommendation = 'Critical ergonomic strain. Pause and perform guided stretch session now.';
  }

  return {
    rula_score: rulaScore,
    level,
    status,
    color_hex: colorHex,
    action_recommendation: actionRecommendation,
  };
}
