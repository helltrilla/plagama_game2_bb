import RAPIER from '@dimforge/rapier3d-compat';
import { CONFIG, type SurfaceMaterialId } from '../config';

export interface ColliderMeta {
  isRagdoll: boolean;
  bodyPart?: string;
  material?: SurfaceMaterialId;
  obstacleId?: number;
  breakable?: boolean;
  isSlopeBase?: boolean;
  meshIndex?: number;
}

export class PhysicsWorld {
  public world!: RAPIER.World;
  public eventQueue!: RAPIER.EventQueue;
  public colliderMeta = new Map<number, ColliderMeta>();

  private currentGravity = { x: 0, y: -CONFIG.PHYSICS.BASE_GRAVITY, z: 0 };
  private startGravity = { x: 0, y: -CONFIG.PHYSICS.BASE_GRAVITY, z: 0 };
  private targetGravity = { x: 0, y: -CONFIG.PHYSICS.BASE_GRAVITY, z: 0 };
  private lerpElapsed = CONFIG.PHYSICS.GRAVITY_LERP_DURATION;
  private gravityMagnitude = CONFIG.PHYSICS.BASE_GRAVITY;

  public async init(): Promise<void> {
    await RAPIER.init();
    this.recreateWorld();
  }

  public recreateWorld(): void {
    if (this.world) {
      this.world.free();
    }
    if (this.eventQueue) {
      this.eventQueue.free();
    }
    this.colliderMeta.clear();

    const gy = -this.gravityMagnitude;
    const gz = 0;
    this.currentGravity = { x: 0, y: gy, z: gz };
    this.startGravity = { x: 0, y: gy, z: gz };
    this.targetGravity = { x: 0, y: gy, z: gz };
    this.lerpElapsed = CONFIG.PHYSICS.GRAVITY_LERP_DURATION;

    this.world = new RAPIER.World(this.currentGravity);
    this.world.timestep = CONFIG.PHYSICS.FIXED_TIMESTEP;
    this.world.numSolverIterations = CONFIG.PHYSICS.SOLVER_ITERATIONS;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  public setGravityMagnitude(mag: number): void {
    this.gravityMagnitude = mag;
  }

  public setTargetGravityDirection(nx: number, ny: number, nz: number): void {
    this.startGravity.x = this.currentGravity.x;
    this.startGravity.y = this.currentGravity.y;
    this.startGravity.z = this.currentGravity.z;

    this.targetGravity.x = nx * this.gravityMagnitude;
    this.targetGravity.y = ny * this.gravityMagnitude;
    this.targetGravity.z = nz * this.gravityMagnitude;
    this.lerpElapsed = 0;
  }

  public getGravityNormalized(out: { x: number; y: number; z: number }): void {
    const gx = this.currentGravity.x;
    const gy = this.currentGravity.y;
    const gz = this.currentGravity.z;
    const len = Math.hypot(gx, gy, gz);
    if (len > 1e-5) {
      out.x = gx / len;
      out.y = gy / len;
      out.z = gz / len;
    } else {
      out.x = 0;
      out.y = -1;
      out.z = 0;
    }
  }

  public step(
    dt: number,
    onContactForce?: (
      handle1: number,
      handle2: number,
      totalForceMagnitude: number,
      maxForceDirection: { x: number; y: number; z: number }
    ) => void
  ): void {
    if (this.lerpElapsed < CONFIG.PHYSICS.GRAVITY_LERP_DURATION) {
      this.lerpElapsed += dt;
      const t = Math.min(1, this.lerpElapsed / CONFIG.PHYSICS.GRAVITY_LERP_DURATION);
      // Smoothstep easing for smooth gravity transition without sudden jerk
      const s = t * t * (3 - 2 * t);
      this.currentGravity.x = this.startGravity.x + (this.targetGravity.x - this.startGravity.x) * s;
      this.currentGravity.y = this.startGravity.y + (this.targetGravity.y - this.startGravity.y) * s;
      this.currentGravity.z = this.startGravity.z + (this.targetGravity.z - this.startGravity.z) * s;
      this.world.gravity = this.currentGravity;
    }

    this.world.step(this.eventQueue);

    if (onContactForce) {
      this.eventQueue.drainContactForceEvents((event) => {
        onContactForce(
          event.collider1(),
          event.collider2(),
          event.totalForceMagnitude(),
          event.maxForceDirection()
        );
      });
    } else {
      this.eventQueue.clear();
    }
  }
}
