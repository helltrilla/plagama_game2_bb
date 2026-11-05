import * as THREE from 'three';
import { CONFIG } from '../config';

export class CameraRig {
  private currentPos = new THREE.Vector3(0, 100, 15);
  private currentLookAt = new THREE.Vector3(0, 95, -5);
  private readonly fixedUp = new THREE.Vector3(0, 1, 0);

  private shakeIntensity = 0;
  public lockRoll = true;

  // Orbit yaw/pitch controlled by mouse or touch drag
  private orbitYaw = 0;
  private orbitPitch = 0.48;
  private isDraggingOrbit = false;
  private orbitPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastPinchDist = 0;

  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private readonly offsetVec = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly camForward = new THREE.Vector3();
  private readonly shakeOffset = new THREE.Vector3();

  private zoomDistance = CONFIG.CAMERA.DISTANCE;

  constructor(private camera: THREE.PerspectiveCamera) {
    window.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, .ui-interactive, .modal-card')) return;
      if (this.orbitPointerId !== null) return;
      this.isDraggingOrbit = true;
      this.orbitPointerId = e.pointerId;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.isDraggingOrbit || e.pointerId !== this.orbitPointerId) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.orbitYaw -= dx * 0.006;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.005, -0.15, 1.2);
    });
    const endPointer = (e: PointerEvent) => {
      if (e.pointerId === this.orbitPointerId) {
        this.isDraggingOrbit = false;
        this.orbitPointerId = null;
      }
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    // Two-finger pinch-to-zoom for mobile phones
    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          this.isDraggingOrbit = false;
          this.orbitPointerId = null;
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          this.lastPinchDist = Math.hypot(dx, dy);
        }
      },
      { passive: true }
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2 && this.lastPinchDist > 0) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          const delta = this.lastPinchDist - dist;
          this.lastPinchDist = dist;
          this.zoomDistance = THREE.MathUtils.clamp(
            this.zoomDistance + delta * 0.08,
            8,
            140
          );
        }
      },
      { passive: true }
    );
    window.addEventListener(
      'touchend',
      (e) => {
        if (e.touches.length < 2) {
          this.lastPinchDist = 0;
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'wheel',
      (e) => {
        const target = e.target as HTMLElement | null;
        if (target && target.closest('.modal-card')) return;
        this.zoomDistance = THREE.MathUtils.clamp(
          this.zoomDistance + e.deltaY * 0.035,
          8,
          140
        );
      },
      { passive: true }
    );
  }

  public reset(targetPos: THREE.Vector3): void {
    const isPortraitMobile = window.innerWidth < window.innerHeight;
    this.orbitYaw = 0;
    this.orbitPitch = 0.48;
    this.zoomDistance = isPortraitMobile
      ? CONFIG.CAMERA.DISTANCE * 1.18
      : CONFIG.CAMERA.DISTANCE;
    this.shakeIntensity = 0;
    this.shakeOffset.set(0, 0, 0);
    this.currentLookAt.set(targetPos.x, targetPos.y - 2.0, targetPos.z - 8.5);
    this.currentPos.set(
      targetPos.x,
      targetPos.y + CONFIG.CAMERA.HEIGHT_OFFSET,
      targetPos.z + this.zoomDistance
    );
    this.camera.up.copy(this.fixedUp);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  public setGravityDirection(_gx: number, _gy: number, _gz: number): void {
    // Camera horizon stays strictly level — no map/camera flipping!
  }

  public addShake(intensity: number): void {
    this.shakeIntensity = Math.min(
      CONFIG.CAMERA.MAX_SHAKE_INTENSITY,
      this.shakeIntensity + intensity
    );
  }

  /**
   * Computes a trajectory nudge vector while keeping the main gravity pulling down the mountain.
   */
  public getTrajectoryNudgeVector(
    dir: 'down' | 'up' | 'left' | 'right' | 'forward' | 'back',
    outNudge: THREE.Vector3,
    outGravityDir: THREE.Vector3
  ): void {
    this.camera.getWorldDirection(this.camForward);
    this.camRight.crossVectors(this.camForward, this.fixedUp).normalize();

    switch (dir) {
      case 'down':
        // Heavy slam downward into the slope
        outNudge.set(0, -0.85, -0.52).normalize();
        outGravityDir.set(0, -0.96, -0.28).normalize();
        break;
      case 'up':
        // Small arcade hop along the slope (keeps character grounded like GTA 5, no high flying!)
        outNudge.set(0, 0.38, -0.92).normalize();
        outGravityDir.set(0, -0.92, -0.32).normalize();
        break;
      case 'left':
        // Roll/tumble left across the slope
        outNudge.copy(this.camRight).negate();
        outNudge.y = -0.15;
        outNudge.normalize();
        outGravityDir.set(outNudge.x * 0.25, -0.94, -0.24).normalize();
        break;
      case 'right':
        // Roll/tumble right across the slope
        outNudge.copy(this.camRight);
        outNudge.y = -0.15;
        outNudge.normalize();
        outGravityDir.set(outNudge.x * 0.25, -0.94, -0.24).normalize();
        break;
      case 'forward':
        // Tumble faster downhill
        outNudge.set(0, -0.45, -0.89).normalize();
        outGravityDir.set(0, -0.9, -0.38).normalize();
        break;
      case 'back':
        // Brake / dig into the rocks
        outNudge.set(0, -0.55, 0.83).normalize();
        outGravityDir.set(0, -0.96, -0.1).normalize();
        break;
    }
  }

  public update(
    dt: number,
    torsoPos: THREE.Vector3,
    torsoVel: THREE.Vector3,
    boundsHalfWidth = 900
  ): void {
    if (dt <= 0) return;

    const dist = this.zoomDistance;
    const horizDist = dist * Math.cos(this.orbitPitch);
    const vertDist = dist * Math.sin(this.orbitPitch) + 4.8;

    this.offsetVec.set(
      Math.sin(this.orbitYaw) * horizDist,
      vertDist,
      Math.cos(this.orbitYaw) * horizDist
    );

    this.desiredPos
      .copy(torsoPos)
      .add(this.offsetVec)
      .addScaledVector(torsoVel, CONFIG.CAMERA.LOOK_AHEAD_FACTOR * 0.25);

    if (this.desiredPos.y < torsoPos.y + 4.0) {
      this.desiredPos.y = torsoPos.y + 4.0;
    }

    const maxWallX = Math.max(80, boundsHalfWidth - CONFIG.CAMERA.MIN_WALL_DISTANCE);
    this.desiredPos.x = THREE.MathUtils.clamp(this.desiredPos.x, -maxWallX, maxWallX);

    const followAlpha = 1 - Math.exp(-CONFIG.CAMERA.FOLLOW_LERP * dt);
    this.currentPos.lerp(this.desiredPos, followAlpha);

    this.desiredLook
      .copy(torsoPos)
      .addScaledVector(torsoVel, CONFIG.CAMERA.LOOK_AHEAD_FACTOR);
    this.desiredLook.y -= 1.2;
    this.desiredLook.z -= 2.2;
    this.currentLookAt.lerp(this.desiredLook, followAlpha);

    if (this.shakeIntensity > 0.001) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * 2 * this.shakeIntensity,
        (Math.random() - 0.5) * 2 * this.shakeIntensity,
        (Math.random() - 0.5) * 2 * this.shakeIntensity
      );
      this.shakeIntensity = Math.max(
        0,
        this.shakeIntensity - CONFIG.CAMERA.SHAKE_DECAY * dt
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    this.camera.up.copy(this.fixedUp);
    this.camera.position.copy(this.currentPos).add(this.shakeOffset);
    this.camera.lookAt(this.currentLookAt);
  }
}
