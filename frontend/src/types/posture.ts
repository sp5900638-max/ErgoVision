export type PostureStatus = 'Good' | 'Warning' | 'Poor';

export interface PostureMetrics {
  head_tilt_angle: number;
  slouch_ratio: number;
  shoulder_tilt: number;
  raw_vertical_distance?: number;
  shoulder_span?: number;
}

export interface SessionStats {
  good_time_sec: number;
  poor_time_sec: number;
}

export interface Landmark {
  id: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PosturePayload {
  status: PostureStatus;
  posture_score: number;
  metrics: PostureMetrics;
  alert_triggered: boolean;
  session_stats: SessionStats;
  landmarks?: Landmark[];
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
