import * as THREE from 'three';
import { CONFIG } from '../config';

interface ParticleItem {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  age: number;
  maxAge: number;
  scale: number;
}

interface FloatingTextItem {
  el: HTMLDivElement;
  active: boolean;
  worldPos: THREE.Vector3;
  age: number;
  maxAge: number;
}

export class EffectsManager {
  private instancedParticles: THREE.InstancedMesh;
  private particles: ParticleItem[] = [];
  private dummy = new THREE.Object3D();

  private floatingPool: FloatingTextItem[] = [];
  private flashOverlay: HTMLElement;
  private gravityFrame: HTMLElement;
  private projVec = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const poolSize = CONFIG.PERFORMANCE.PARTICLE_POOL_SIZE;
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.instancedParticles = new THREE.InstancedMesh(geo, mat, poolSize);
    this.instancedParticles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.instancedParticles);

    for (let i = 0; i < poolSize; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color(0xffffff),
        age: 0,
        maxAge: 0.5,
        scale: 1,
      });
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.instancedParticles.setMatrixAt(i, this.dummy.matrix);
      this.instancedParticles.setColorAt(i, new THREE.Color(0xffffff));
    }

    const layer = document.getElementById('floating-text-layer')!;
    for (let i = 0; i < CONFIG.PERFORMANCE.FLOATING_TEXT_POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'floating-text';
      el.style.display = 'none';
      layer.appendChild(el);
      this.floatingPool.push({
        el,
        active: false,
        worldPos: new THREE.Vector3(),
        age: 0,
        maxAge: 0.9,
      });
    }

    this.flashOverlay = document.getElementById('damage-flash-overlay')!;
    this.gravityFrame = document.getElementById('gravity-screen-frame')!;
  }

  public spawnBurst(
    pos: { x: number; y: number; z: number },
    colorHex: number,
    count = 12,
    speed = 7
  ): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true;
        p.pos.set(pos.x, pos.y, pos.z);
        p.vel.set(
          (Math.random() - 0.5) * 2 * speed,
          (Math.random() - 0.5) * 2 * speed,
          (Math.random() - 0.5) * 2 * speed
        );
        p.color.setHex(colorHex);
        p.age = 0;
        p.maxAge = 0.35 + Math.random() * 0.3;
        p.scale = 0.8 + Math.random() * 0.9;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  public spawnFloatingText(
    pos: { x: number; y: number; z: number },
    text: string,
    color = '#facc15',
    scale = 1.0
  ): void {
    const item = this.floatingPool.find((f) => !f.active);
    if (!item) return;

    item.active = true;
    item.worldPos.set(
      pos.x + (Math.random() - 0.5) * 0.8,
      pos.y + 0.5,
      pos.z
    );
    item.age = 0;
    item.maxAge = 0.95;
    item.el.textContent = text;
    item.el.style.color = color;
    item.el.style.fontSize = `${Math.round(17 * scale)}px`;
    item.el.style.display = 'block';
    item.el.style.opacity = '1';
  }

  public triggerRedFlash(): void {
    this.flashOverlay.style.opacity = '0.85';
    setTimeout(() => {
      this.flashOverlay.style.opacity = '0';
    }, 130);
  }

  public setGravityFrameColor(hex: string): void {
    this.gravityFrame.style.setProperty('--gravity-frame-color', `${hex}66`);
  }

  public update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (dt <= 0) return;

    let matrixDirty = false;
    let colorDirty = false;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.instancedParticles.setMatrixAt(i, this.dummy.matrix);
        matrixDirty = true;
        continue;
      }

      p.pos.addScaledVector(p.vel, dt);
      const lifeRatio = 1 - p.age / p.maxAge;
      const s = p.scale * lifeRatio;

      this.dummy.position.copy(p.pos);
      this.dummy.scale.set(s, s, s);
      this.dummy.rotation.x += dt * 6;
      this.dummy.rotation.y += dt * 6;
      this.dummy.updateMatrix();

      this.instancedParticles.setMatrixAt(i, this.dummy.matrix);
      this.instancedParticles.setColorAt(i, p.color);
      matrixDirty = true;
      colorDirty = true;
    }

    if (matrixDirty) {
      this.instancedParticles.instanceMatrix.needsUpdate = true;
    }
    if (colorDirty && this.instancedParticles.instanceColor) {
      this.instancedParticles.instanceColor.needsUpdate = true;
    }

    const halfW = window.innerWidth * 0.5;
    const halfH = window.innerHeight * 0.5;

    for (const f of this.floatingPool) {
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= f.maxAge) {
        f.active = false;
        f.el.style.display = 'none';
        continue;
      }

      f.worldPos.y += dt * 1.8;
      this.projVec.copy(f.worldPos).project(camera);

      const sx = this.projVec.x * halfW + halfW;
      const sy = -this.projVec.y * halfH + halfH;
      const opacity = Math.max(0, 1 - f.age / f.maxAge);

      f.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      f.el.style.opacity = opacity.toFixed(2);
    }
  }
}
