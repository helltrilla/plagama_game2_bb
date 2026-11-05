import { CONFIG, type BodyPartId, type BoneId, type SurfaceMaterialId } from '../config';
import { events, type BoneDamageStage } from '../core/EventBus';
import type { Scoring } from '../gameplay/Scoring';
import type { Ragdoll } from './Ragdoll';
import type { PhysicsWorld } from './World';

export class ImpactSystem {
  private lastSurfaceHitTime = new Map<string, number>();

  public reset(): void {
    this.lastSurfaceHitTime.clear();
  }

  public processContactForce(
    handle1: number,
    handle2: number,
    _totalForceMagnitude: number,
    maxForceDir: { x: number; y: number; z: number },
    elapsedSec: number,
    physics: PhysicsWorld,
    ragdoll: Ragdoll,
    scoring: Scoring,
    isGravitySlam: boolean,
    language: 'ru' | 'en',
    onGlassShatter?: (obstacleId: number, colliderHandle: number) => void
  ): { damage: number; strongHit: boolean } {
    const meta1 = physics.colliderMeta.get(handle1);
    const meta2 = physics.colliderMeta.get(handle2);
    if (!meta1 || !meta2) return { damage: 0, strongHit: false };

    const ragdollMeta = meta1.isRagdoll ? meta1 : meta2.isRagdoll ? meta2 : null;
    const envMeta = !meta1.isRagdoll ? meta1 : !meta2.isRagdoll ? meta2 : null;
    const envHandle = !meta1.isRagdoll ? handle1 : handle2;

    if (!ragdollMeta || !envMeta || !ragdollMeta.bodyPart) {
      return { damage: 0, strongHit: false };
    }

    const partId = ragdollMeta.bodyPart as BodyPartId;
    const part = ragdoll.parts.get(partId);
    if (!part) return { damage: 0, strongHit: false };

    const isSlopeGround = Boolean(envMeta.isSlopeBase);
    const obstId = envMeta.obstacleId ?? envHandle;
    const obstKey = isSlopeGround ? `slope_${obstId}` : `${partId}_${obstId}`;
    const cooldownReq = isSlopeGround ? 0.65 : 0.35;

    const lastTime = this.lastSurfaceHitTime.get(obstKey) ?? -999;
    if (elapsedSec - lastTime < cooldownReq) {
      return { damage: 0, strongHit: false };
    }

    const vel = part.body.linvel();
    const prevVel = part.prevVel;

    // Sudden velocity change (deceleration/impulse) during this collision step
    const dvx = vel.x - prevVel.x;
    const dvy = vel.y - prevVel.y;
    const dvz = vel.z - prevVel.z;
    const deltaV = Math.hypot(dvx, dvy, dvz);

    const nx = maxForceDir.x;
    const ny = maxForceDir.y;
    const nz = maxForceDir.z;
    const nLen = Math.hypot(nx, ny, nz);

    // True normal approach speed perpendicular to the surface (ignores sliding/rolling parallel to ground!)
    let normalApproach = 0;
    if (nLen > 1e-4) {
      normalApproach = Math.abs((prevVel.x * nx + prevVel.y * ny + prevVel.z * nz) / nLen);
    } else {
      normalApproach = deltaV;
    }

    // Strict filter against rolling/sliding on the ground:
    // Ground slabs only deal damage on a hard aerial slam (high normalApproach & high deltaV).
    const minNormalReq = isSlopeGround ? 5.5 : 3.4;
    const minDeltaVReq = isSlopeGround ? 5.2 : 3.6;

    if (normalApproach < minNormalReq || deltaV < minDeltaVReq) {
      return { damage: 0, strongHit: false };
    }

    const relativeNormalVelocity = Math.min(normalApproach, deltaV * 1.15);

    const effectiveMass = Math.max(part.mass, 13.5);
    const impact = relativeNormalVelocity * effectiveMass;
    if (impact < CONFIG.DAMAGE.MIN_IMPACT) {
      return { damage: 0, strongHit: false };
    }

    this.lastSurfaceHitTime.set(obstKey, elapsedSec);

    const partBones: BoneId[] = [];
    for (const [bId, bState] of ragdoll.bones.entries()) {
      if (bState.bodyPart === partId) {
        partBones.push(bId);
      }
    }

    const targetBoneId =
      partBones.find((id) => !ragdoll.bones.get(id)!.broken) ?? partBones[0];
    const targetBone = targetBoneId ? ragdoll.bones.get(targetBoneId) : undefined;
    const boneFragility = targetBone ? targetBone.fragility : 1.25;

    const matId: SurfaceMaterialId = envMeta.material ?? 'concrete';
    const matCfg = CONFIG.MATERIALS[matId];
    const surfaceMultiplier = matCfg.damageMultiplier;

    scoring.registerComboHit(elapsedSec, isGravitySlam);
    const comboMultiplier = scoring.getComboMultiplier();
    const slamMultiplier = isGravitySlam ? CONFIG.GRAVITY.SLAM_DAMAGE_MULTIPLIER : 1.0;

    const rawDamage =
      (impact - CONFIG.DAMAGE.MIN_IMPACT) *
      CONFIG.DAMAGE.IMPACT_TO_DAMAGE_SCALE *
      boneFragility *
      surfaceMultiplier *
      comboMultiplier *
      slamMultiplier;

    const damage = Math.max(1, Math.round(rawDamage));
    const pos = part.body.translation();

    scoring.addDamage(damage);

    events.emit('impactOccurred', {
      damage,
      worldPos: { x: pos.x, y: pos.y, z: pos.z },
      isGravitySlam,
      combo: scoring.comboCount,
      material: matId,
    });

    // 1. Apply damage to all unbroken bones in the impacted body part
    const unbrokenInPart = partBones.filter((id) => !ragdoll.bones.get(id)!.broken);
    if (unbrokenInPart.length > 0) {
      unbrokenInPart.forEach((bId, idx) => {
        const bState = ragdoll.bones.get(bId)!;
        const mult = idx === 0 ? 1.0 : 0.72;
        this.applyBoneDamage(
          bState,
          Math.max(1, Math.round(damage * mult)),
          pos,
          ragdoll,
          scoring,
          language
        );
      });
    }

    // 2. Kinetic shockwave: propagate force to unbroken bones in other body parts so every single bone can break!
    if (damage >= 18 || unbrokenInPart.length === 0) {
      let shockTargets = 0;
      const maxShockTargets = damage >= 48 ? 2 : 1;
      for (const bState of ragdoll.bones.values()) {
        if (!bState.broken && bState.bodyPart !== partId) {
          const shockDmg = Math.max(
            2,
            Math.round(damage * (unbrokenInPart.length === 0 ? 0.68 : 0.48) * bState.fragility)
          );
          const limbPart = ragdoll.parts.get(bState.bodyPart);
          const limbPos = limbPart ? limbPart.body.translation() : pos;
          this.applyBoneDamage(bState, shockDmg, limbPos, ragdoll, scoring, language);
          shockTargets++;
          if (shockTargets >= maxShockTargets) break;
        }
      }
    }

    if (!isSlopeGround) {
      // Deflect downhill & sideways off boulders so the ragdoll never stalls on an obstacle
      const torso = ragdoll.parts.get('torso');
      if (torso) {
        const tv = torso.body.linvel();
        if (tv.z > -6.5) {
          const sidePush = (Math.random() - 0.5) * 3.5;
          torso.body.setLinvel(
            { x: tv.x + sidePush, y: tv.y - 1.0, z: Math.min(tv.z - 2.8, -6.5) },
            true
          );
        }
      }
    }

    if (envMeta.breakable && envMeta.obstacleId !== undefined && onGlassShatter) {
      onGlassShatter(envMeta.obstacleId, envHandle);
    }

    const strongHit = damage >= CONFIG.DAMAGE.HIT_STOP_THRESHOLD_DAMAGE || isGravitySlam;
    return { damage, strongHit };
  }

  /**
   * Allows breaking any specific bone directly (e.g., by clicking it on the X-Ray scanner HUD).
   */
  public snapBoneDirectly(
    boneId: BoneId,
    ragdoll: Ragdoll,
    scoring: Scoring,
    language: 'ru' | 'en'
  ): boolean {
    const bone = ragdoll.bones.get(boneId);
    if (!bone || bone.broken) return false;

    const part = ragdoll.parts.get(bone.bodyPart);
    const pos = part ? part.body.translation() : { x: 0, y: 0, z: 0 };

    if (part) {
      part.body.applyImpulse(
        {
          x: (Math.random() - 0.5) * part.mass * 5.5,
          y: -part.mass * 3.5,
          z: -part.mass * 4.0,
        },
        true
      );
      part.body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * 4.5,
          y: (Math.random() - 0.5) * 4.5,
          z: (Math.random() - 0.5) * 4.5,
        },
        true
      );
    }

    const dmgNeeded = Math.ceil(bone.health + 5);
    scoring.addDamage(dmgNeeded);
    this.applyBoneDamage(bone, dmgNeeded, pos, ragdoll, scoring, language);
    return true;
  }

  private applyBoneDamage(
    targetBone: {
      id: BoneId;
      bodyPart: BodyPartId;
      nameRu: string;
      nameEn: string;
      maxHealth: number;
      health: number;
      fragility: number;
      breakBonusCash: number;
      stage: BoneDamageStage;
      broken: boolean;
    },
    damage: number,
    pos: { x: number; y: number; z: number },
    ragdoll: Ragdoll,
    scoring: Scoring,
    language: 'ru' | 'en'
  ): void {
    if (targetBone.broken) return;

    const prevStage: BoneDamageStage = targetBone.stage;
    targetBone.health = Math.max(0, targetBone.health - damage);
    const ratio = targetBone.health / targetBone.maxHealth;

    let newStage: BoneDamageStage = prevStage;
    if (ratio <= 0) {
      newStage = 'broken';
      targetBone.broken = true;
    } else if (ratio <= CONFIG.DAMAGE.DISLOCATE_HEALTH_RATIO) {
      newStage = 'dislocated';
    } else if (ratio <= CONFIG.DAMAGE.SPRAIN_HEALTH_RATIO) {
      newStage = 'sprained';
    }

    if (newStage !== prevStage) {
      targetBone.stage = newStage;
      ragdoll.setBoneDamageVisual(targetBone.id, newStage);
      ragdoll.setPartDamageVisual(targetBone.bodyPart, newStage);

      const boneName = language === 'ru' ? targetBone.nameRu : targetBone.nameEn;

      if (newStage === 'broken') {
        scoring.registerBrokenBone(targetBone.id, targetBone.breakBonusCash);
        events.emit('boneBroken', {
          boneId: targetBone.id,
          name: boneName,
          bonusCash: targetBone.breakBonusCash,
          worldPos: { x: pos.x, y: pos.y, z: pos.z },
        });
      } else if (newStage === 'dislocated') {
        scoring.registerDislocation(CONFIG.DAMAGE.LIGAMENT_BONUS_CASH);
      } else if (newStage === 'sprained') {
        scoring.registerSprain(Math.max(1, Math.round(CONFIG.DAMAGE.LIGAMENT_BONUS_CASH * 0.6)));
      }

      events.emit('boneStageChanged', {
        boneId: targetBone.id,
        stage: newStage,
        name: boneName,
        bonusCash:
          newStage === 'broken'
            ? targetBone.breakBonusCash
            : CONFIG.DAMAGE.LIGAMENT_BONUS_CASH,
        worldPos: { x: pos.x, y: pos.y, z: pos.z },
      });
    }
  }
}
