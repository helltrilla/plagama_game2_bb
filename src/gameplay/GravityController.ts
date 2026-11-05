import * as THREE from 'three';
import { CONFIG, type GravityDir } from '../config';
import { events } from '../core/EventBus';
import type { Ragdoll } from '../physics/Ragdoll';
import type { PhysicsWorld } from '../physics/World';
import type { CameraRig } from '../render/CameraRig';

export class GravityController {
  public currentDir: GravityDir = 'down';
  public charges = CONFIG.GRAVITY.BASE_MAX_CHARGES;
  public maxCharges = CONFIG.GRAVITY.BASE_MAX_CHARGES;
  public cooldownRemaining = 0;
  public cooldownDuration = CONFIG.GRAVITY.BASE_COOLDOWN;
  public lastFlipTimeSec = -999;

  private readonly tmpNudgeDir = new THREE.Vector3(0, -1, 0);
  private readonly tmpGravDir = new THREE.Vector3(0, -1, 0);

  public reset(maxCharges: number, cooldownDuration: number): void {
    this.currentDir = 'down';
    this.maxCharges = maxCharges;
    this.charges = maxCharges;
    this.cooldownDuration = cooldownDuration;
    this.cooldownRemaining = 0;
    this.lastFlipTimeSec = -999;

    events.emit('gravityChanged', {
      dir: 'down',
      worldVec: { x: 0, y: -1, z: 0 },
      chargesLeft: this.charges,
      maxCharges: this.maxCharges,
    });
    this.emitChargeUpdate();
  }

  public addExtraCharges(amount: number): void {
    this.maxCharges += amount;
    this.charges = Math.min(this.maxCharges, this.charges + amount);
    this.emitChargeUpdate();
  }

  public trySwitchGravity(
    dir: GravityDir,
    elapsedSec: number,
    isRoundActive: boolean,
    physics: PhysicsWorld,
    ragdoll: Ragdoll,
    cameraRig: CameraRig
  ): boolean {
    if (!isRoundActive) return false;
    if (this.cooldownRemaining > 0) return false;
    if (this.charges < 1) return false;

    // Compute gentle trajectory nudge & subtle gravity tilt (always pulling down the mountain, never flipping the map upside-down!)
    cameraRig.getTrajectoryNudgeVector(dir, this.tmpNudgeDir, this.tmpGravDir);

    this.currentDir = dir;
    this.charges = Math.max(0, this.charges - 1);
    this.cooldownRemaining = this.cooldownDuration;
    this.lastFlipTimeSec = elapsedSec;

    physics.setTargetGravityDirection(
      this.tmpGravDir.x,
      this.tmpGravDir.y,
      this.tmpGravDir.z
    );

    // Apply a clean trajectory nudge impulse so the stuntman shifts toward nearby rocks/boulders
    ragdoll.applyDirectionalKick(
      this.tmpNudgeDir.x,
      this.tmpNudgeDir.y,
      this.tmpNudgeDir.z,
      CONFIG.GRAVITY.IMPULSE_ON_FLIP
    );
    cameraRig.addShake(0.08);

    events.emit('gravityChanged', {
      dir,
      worldVec: {
        x: this.tmpNudgeDir.x,
        y: this.tmpNudgeDir.y,
        z: this.tmpNudgeDir.z,
      },
      chargesLeft: Math.floor(this.charges),
      maxCharges: this.maxCharges,
    });
    this.emitChargeUpdate();
    return true;
  }

  public isWithinSlamWindow(elapsedSec: number): boolean {
    return elapsedSec - this.lastFlipTimeSec <= CONFIG.GRAVITY.SLAM_WINDOW_SEC;
  }

  public update(dt: number, isRoundActive: boolean): void {
    if (!isRoundActive) return;

    let changed = false;
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
      changed = true;
    }

    if (this.charges < this.maxCharges) {
      const prevFloor = Math.floor(this.charges);
      this.charges = Math.min(
        this.maxCharges,
        this.charges + CONFIG.GRAVITY.CHARGE_REGEN_RATE * dt
      );
      if (Math.floor(this.charges) !== prevFloor) {
        changed = true;
      }
    }

    if (changed) {
      this.emitChargeUpdate();
    }
  }

  private emitChargeUpdate(): void {
    const ratio =
      this.cooldownDuration > 0
        ? 1 - this.cooldownRemaining / this.cooldownDuration
        : 1;
    events.emit('gravityChargeUpdated', {
      chargesLeft: Math.floor(this.charges),
      maxCharges: this.maxCharges,
      cooldownRatio: Math.max(0, Math.min(1, ratio)),
    });
  }
}
