/**
 * Guided Stretch Engine with Computer Vision Hold Verification
 * Verifies Chin Tuck (CVA >= 54°) and Shoulder Retraction with 5s continuous hold.
 */

export interface StretchDefinition {
  id: 'chin_tuck' | 'shoulder_retraction';
  title: string;
  instructions: string;
  targetMetric: string;
  targetThresholdDesc: string;
  holdTargetSeconds: number;
}

export const STRETCH_DEFINITIONS: Record<string, StretchDefinition> = {
  chin_tuck: {
    id: 'chin_tuck',
    title: 'Cervical Spine Chin Tuck',
    instructions: 'Gently glide your chin backward like making a double chin, lengthening the back of your neck without looking down.',
    targetMetric: 'Craniovertebral Angle (CVA)',
    targetThresholdDesc: 'Hold CVA ≥ 54° for 5 seconds',
    holdTargetSeconds: 5.0,
  },
  shoulder_retraction: {
    id: 'shoulder_retraction',
    title: 'Scapular Shoulder Retraction',
    instructions: 'Roll your shoulders back and squeeze your shoulder blades gently together and downward, opening your chest.',
    targetMetric: 'Shoulder Level & Retraction',
    targetThresholdDesc: 'Hold shoulders level (tilt ≤ 5°) and chest open for 5 seconds',
    holdTargetSeconds: 5.0,
  },
};

export class StretchVerificationController {
  private activeStretch: 'chin_tuck' | 'shoulder_retraction' = 'chin_tuck';
  private holdSeconds: number = 0.0;
  private isHolding: boolean = false;
  private lastUpdateTime: number = 0;
  private consecutivePoorCount: number = 0;

  /**
   * Register a poor posture event. Returns true if auto-modal trigger threshold (3) is reached.
   */
  public registerPoorEvent(): boolean {
    this.consecutivePoorCount++;
    return this.consecutivePoorCount >= 3;
  }

  public resetPoorEventCount(): void {
    this.consecutivePoorCount = 0;
  }

  public getConsecutivePoorCount(): number {
    return this.consecutivePoorCount;
  }

  public setStretch(stretch: 'chin_tuck' | 'shoulder_retraction'): void {
    this.activeStretch = stretch;
    this.holdSeconds = 0.0;
    this.isHolding = false;
    this.lastUpdateTime = performance.now();
  }

  public getStretch(): 'chin_tuck' | 'shoulder_retraction' {
    return this.activeStretch;
  }

  public getHoldProgress(): { holdSeconds: number; targetSeconds: number; percent: number; isHolding: boolean } {
    const target = STRETCH_DEFINITIONS[this.activeStretch]?.holdTargetSeconds || 5.0;
    return {
      holdSeconds: Math.min(target, Math.round(this.holdSeconds * 10) / 10),
      targetSeconds: target,
      percent: Math.min(100, Math.round((this.holdSeconds / target) * 100)),
      isHolding: this.isHolding,
    };
  }

  /**
   * Evaluates if current user biomechanics fulfill the stretch criteria.
   * Advances the 5-second hold timer if criteria are met.
   * Returns true if stretch has completed 5 full seconds.
   */
  public update(
    cvaDeg: number,
    shoulderTiltDeg: number,
    nowMs: number = performance.now()
  ): { completed: boolean; isHolding: boolean; holdSeconds: number } {
    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = nowMs;
      return { completed: false, isHolding: false, holdSeconds: 0 };
    }

    const deltaSec = Math.max(0.01, (nowMs - this.lastUpdateTime) / 1000);
    this.lastUpdateTime = nowMs;

    let conditionMet = false;
    if (this.activeStretch === 'chin_tuck') {
      // Chin tuck requires CVA >= 54° and shoulders reasonably level
      conditionMet = cvaDeg >= 53.5 && shoulderTiltDeg <= 8.0;
    } else if (this.activeStretch === 'shoulder_retraction') {
      // Shoulder retraction requires level shoulders and upright CVA
      conditionMet = shoulderTiltDeg <= 5.0 && cvaDeg >= 49.0;
    }

    this.isHolding = conditionMet;

    if (conditionMet) {
      this.holdSeconds += deltaSec;
    } else {
      // Decay hold slowly if user drops form
      this.holdSeconds = Math.max(0, this.holdSeconds - deltaSec * 0.5);
    }

    const target = STRETCH_DEFINITIONS[this.activeStretch]?.holdTargetSeconds || 5.0;
    const completed = this.holdSeconds >= target;

    return {
      completed,
      isHolding: this.isHolding,
      holdSeconds: Math.min(target, Math.round(this.holdSeconds * 10) / 10),
    };
  }

  public resetHold(): void {
    this.holdSeconds = 0.0;
    this.isHolding = false;
    this.lastUpdateTime = performance.now();
  }
}
