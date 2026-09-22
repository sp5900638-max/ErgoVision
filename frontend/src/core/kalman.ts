/**
 * 1D Kalman Filter and Multi-Point 3D Coordinate Smoothing Filter
 * Process noise Q=0.008, Measurement noise R=0.05
 * Eliminates webcam landmark coordinate jitter without introducing lag.
 */

import type { Point3D } from '../types/ergosense';

export class KalmanFilter1D {
  private q: number; // Process noise covariance
  private r: number; // Measurement noise covariance
  private x: number; // State estimate
  private p: number; // Estimation error covariance
  private k: number; // Kalman gain
  private initialized: boolean = false;

  constructor(q: number = 0.008, r: number = 0.05) {
    this.q = q;
    this.r = r;
    this.x = 0;
    this.p = 1.0;
    this.k = 0;
  }

  /**
   * Filter a scalar measurement and return smoothed value.
   */
  public update(measurement: number): number {
    if (!Number.isFinite(measurement)) {
      return this.x;
    }

    if (!this.initialized) {
      this.x = measurement;
      this.p = 1.0;
      this.initialized = true;
      return this.x;
    }

    // Prediction step
    this.p = this.p + this.q;

    // Measurement update step
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;

    return this.x;
  }

  public reset(): void {
    this.initialized = false;
    this.p = 1.0;
    this.x = 0;
  }

  public getValue(): number {
    return this.x;
  }
}

/**
 * 3D Point Kalman filter applying independent 1D filters to X, Y, Z.
 */
export class Point3DKalmanFilter {
  private xFilter: KalmanFilter1D;
  private yFilter: KalmanFilter1D;
  private zFilter: KalmanFilter1D;

  constructor(q: number = 0.008, r: number = 0.05) {
    this.xFilter = new KalmanFilter1D(q, r);
    this.yFilter = new KalmanFilter1D(q, r);
    this.zFilter = new KalmanFilter1D(q, r);
  }

  public update(point: Point3D): Point3D {
    return {
      x: this.xFilter.update(point.x),
      y: this.yFilter.update(point.y),
      z: this.zFilter.update(point.z),
      visibility: point.visibility,
    };
  }

  public reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
    this.zFilter.reset();
  }
}

/**
 * Multi-Point Kalman Filter maintaining filters for all tracked body and face joints.
 */
export class MultiPointKalmanFilter {
  private filters: Map<string | number, Point3DKalmanFilter> = new Map();
  private q: number;
  private r: number;

  constructor(q: number = 0.008, r: number = 0.05) {
    this.q = q;
    this.r = r;
  }

  public filterPoint(key: string | number, point: Point3D): Point3D {
    let filter = this.filters.get(key);
    if (!filter) {
      filter = new Point3DKalmanFilter(this.q, this.r);
      this.filters.set(key, filter);
    }
    return filter.update(point);
  }

  public reset(): void {
    this.filters.forEach((filter) => filter.reset());
    this.filters.clear();
  }
}
