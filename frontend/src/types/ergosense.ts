/**
 * Core type definitions for ErgoSense 360 Ergonomic & Vision Monitoring System.
 */

export type PostureStatus = 'Acceptable' | 'Investigate' | 'Change Soon' | 'Immediate Action';
export type RulaLevel = 'acceptable' | 'investigate' | 'change_soon' | 'immediate';
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Point3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface Landmark {
  id: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface KinematicsMetrics {
  cva_deg: number;             // Craniovertebral Angle (upright normal: 50°-55°, slouch: <48°)
  shoulder_tilt_deg: number;   // Lateral asymmetry angle
  trunk_angle_deg: number;     // Spine inclination with vertical
  head_tilt_angle?: number;    // Compatibility with legacy
  slouch_ratio?: number;       // Compatibility with legacy
}

export interface VisionMetrics {
  ipd_raw: number;
  ipd_ratio: number;           // current IPD / baseline IPD (>1.25 = leaning <45cm)
  proximity_alert: boolean;
  ear_value: number;           // Eye Aspect Ratio
  blinks_per_min: number;      // Rolling 60s blink rate
  ambient_lux: number;         // 0 - 255 relative luminance
  lighting_status: 'Low' | 'Optimal' | 'Glaring';
  twenty_rule_seconds_remaining: number; // 20-20-20 countdown
}

export interface AudioMetrics {
  mic_energy: number;
  user_speaking: boolean;
  isMuted: boolean;
}

export interface StretchState {
  is_modal_open: boolean;
  current_stretch: 'chin_tuck' | 'shoulder_retraction';
  hold_duration_sec: number;
  target_hold_sec: number;
  is_holding: boolean;
  consecutive_poor_count: number;
  completed_stretches: number;
}

export interface RulaEvaluation {
  rula_score: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  level: RulaLevel;
  status: PostureStatus;
  color_hex: string;
  action_recommendation: string;
}

export interface TelemetryPacket {
  type?: string;
  session_token: string;
  timestamp?: string;
  rula_score: number;
  cva_deg: number;
  shoulder_tilt_deg: number;
  trunk_angle_deg: number;
  ipd_ratio: number;
  ear_value: number;
  ambient_lux: number;
  status: PostureStatus;
  alert_active: boolean;
  daily_ergo_score?: number;
  kinematics?: KinematicsMetrics;
  vision?: VisionMetrics;
}

export interface SessionBaselines {
  baseline_ipd: number;
  baseline_cva: number;
  baseline_shoulder_tilt: number;
  is_calibrated: boolean;
}

export interface AnalyticsReport {
  session_token: string;
  total_duration_sec: number;
  good_posture_percentage: number;
  average_rula: number;
  stretches_completed: number;
  hourly_degradation: Array<{
    hour: string;
    avg_rula: number;
    poor_events: number;
  }>;
}
