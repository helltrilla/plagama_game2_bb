import { CONFIG, type BoneId } from '../config';
import { events } from '../core/EventBus';
import { upgrades } from './Upgrades';

export class Scoring {
  public totalDamage = 0;
  public comboCount = 1;
  public maxCombo = 1;
  public lastHitTimeSec = -999;
  public brokenBones: BoneId[] = [];
  public sprainedCount = 0;
  public dislocatedCount = 0;
  public bonusBreakCash = 0;
  public gravitySlams = 0;
  public velocityMph = 0;
  public fallDistanceMeters = 0;
  private startHeightY = 0;

  public reset(spawnY = 0): void {
    this.totalDamage = 0;
    this.comboCount = 1;
    this.maxCombo = 1;
    this.lastHitTimeSec = -999;
    this.brokenBones = [];
    this.sprainedCount = 0;
    this.dislocatedCount = 0;
    this.bonusBreakCash = 0;
    this.gravitySlams = 0;
    this.velocityMph = 0;
    this.fallDistanceMeters = 0;
    this.startHeightY = spawnY;
    this.emitScore();
  }

  public updateTelemetry(currentY: number, speedMetersPerSec: number): void {
    this.velocityMph = Math.round(speedMetersPerSec * 2.237);
    const drop = Math.max(0, Math.round(this.startHeightY - currentY));
    if (drop > this.fallDistanceMeters) {
      this.fallDistanceMeters = drop;
    }
  }

  public registerComboHit(elapsedSec: number, isGravitySlam: boolean): void {
    if (elapsedSec - this.lastHitTimeSec <= CONFIG.DAMAGE.COMBO_WINDOW_SEC) {
      this.comboCount++;
    } else {
      this.comboCount = 1;
    }
    this.lastHitTimeSec = elapsedSec;
    if (this.comboCount > this.maxCombo) {
      this.maxCombo = this.comboCount;
    }
    if (isGravitySlam) {
      this.gravitySlams++;
    }
  }

  public getComboMultiplier(): number {
    const mult = 1 + (this.comboCount - 1) * CONFIG.DAMAGE.COMBO_STEP;
    return Math.min(CONFIG.DAMAGE.MAX_COMBO_MULTIPLIER, mult);
  }

  public addDamage(amount: number): void {
    this.totalDamage += amount;
    this.emitScore();
  }

  public registerSprain(bonusCash: number): void {
    this.sprainedCount++;
    this.bonusBreakCash += bonusCash;
    this.emitScore();
  }

  public registerDislocation(bonusCash: number): void {
    this.dislocatedCount++;
    this.bonusBreakCash += bonusCash;
    this.emitScore();
  }

  public registerBrokenBone(boneId: BoneId, bonusCash: number): void {
    if (!this.brokenBones.includes(boneId)) {
      this.brokenBones.push(boneId);
      this.bonusBreakCash += bonusCash;
      this.emitScore();
    }
  }

  public update(elapsedSec: number): void {
    if (
      this.comboCount > 1 &&
      elapsedSec - this.lastHitTimeSec > CONFIG.DAMAGE.COMBO_WINDOW_SEC
    ) {
      this.comboCount = 1;
      this.emitScore();
    }
  }

  public computeRoundCash(boneValueMultiplier: number): number {
    const base =
      this.totalDamage * CONFIG.DAMAGE.CASH_PER_DAMAGE +
      this.bonusBreakCash;
    return Math.max(0, Math.round(base * boneValueMultiplier));
  }

  public computeRoundXp(): number {
    if (this.totalDamage <= 0 && this.brokenBones.length === 0) {
      return 0;
    }
    const xp =
      this.totalDamage * CONFIG.PROGRESSION.XP_PER_DAMAGE +
      this.brokenBones.length * CONFIG.PROGRESSION.XP_PER_BROKEN_BONE +
      (this.dislocatedCount + this.sprainedCount) * CONFIG.PROGRESSION.XP_PER_DISLOCATION;
    return Math.max(2, Math.round(xp));
  }

  public emitScore(): void {
    const mult = upgrades.getBoneValueMultiplier();
    events.emit('scoreUpdated', {
      totalDamage: Math.round(this.totalDamage),
      combo: this.comboCount,
      brokenCount: this.brokenBones.length,
      sprainedCount: this.sprainedCount,
      dislocatedCount: this.dislocatedCount,
      totalBones: CONFIG.BONES.length,
      currentRoundCash: this.computeRoundCash(mult),
      velocityMph: this.velocityMph,
      fallDistanceMeters: this.fallDistanceMeters,
    });
  }
}
