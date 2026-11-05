import { CONFIG } from '../config';

export class Time {
  public readonly fixedDt = CONFIG.PHYSICS.FIXED_TIMESTEP;
  public readonly maxSubSteps = CONFIG.PHYSICS.MAX_SUBSTEPS;

  private accumulator = 0;
  private lastTimestamp = 0;
  private hitStopRemaining = 0;
  public alpha = 0;
  public elapsed = 0;

  // FPS monitoring for auto-quality
  private frameCount = 0;
  private fpsElapsed = 0;
  public currentFps = 60;

  public reset(nowMs: number): void {
    this.lastTimestamp = nowMs;
    this.accumulator = 0;
    this.hitStopRemaining = 0;
  }

  public triggerHitStop(durationSec: number): void {
    if (durationSec > this.hitStopRemaining) {
      this.hitStopRemaining = durationSec;
    }
  }

  public tick(
    nowMs: number,
    isPaused: boolean,
    stepPhysics: (dt: number) => void,
    onFpsSample?: (fps: number) => void
  ): number {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = nowMs;
    }
    let frameDt = (nowMs - this.lastTimestamp) / 1000;
    this.lastTimestamp = nowMs;

    // Clamp spikes (e.g., tab switch)
    if (frameDt > 0.25) frameDt = 0.25;
    if (frameDt < 0) frameDt = 0;

    if (isPaused) {
      return 0;
    }

    this.frameCount++;
    this.fpsElapsed += frameDt;
    if (this.fpsElapsed >= CONFIG.PERFORMANCE.FPS_SAMPLE_WINDOW_SEC) {
      this.currentFps = this.frameCount / this.fpsElapsed;
      this.frameCount = 0;
      this.fpsElapsed = 0;
      if (onFpsSample) {
        onFpsSample(this.currentFps);
      }
    }

    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= frameDt;
      if (this.hitStopRemaining > 0) {
        return frameDt;
      }
    }

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      stepPhysics(this.fixedDt);
      this.accumulator -= this.fixedDt;
      this.elapsed += this.fixedDt;
      steps++;
    }

    // Discard excess accumulation if capped by maxSubSteps
    if (steps === this.maxSubSteps && this.accumulator > this.fixedDt) {
      this.accumulator = 0;
    }

    this.alpha = this.accumulator / this.fixedDt;
    return frameDt;
  }
}
