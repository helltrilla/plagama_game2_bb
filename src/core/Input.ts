import type { GravityDir } from '../config';

export class Input {
  private launchHandlers = new Set<() => void>();
  private respawnHandlers = new Set<() => void>();
  private gravityHandlers = new Set<(dir: GravityDir) => void>();
  public heldKeys = new Set<string>();

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private isSwiping = false;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  public onLaunch(cb: () => void): () => void {
    this.launchHandlers.add(cb);
    return () => this.launchHandlers.delete(cb);
  }

  public onRespawn(cb: () => void): () => void {
    this.respawnHandlers.add(cb);
    return () => this.respawnHandlers.delete(cb);
  }

  public onGravitySelect(cb: (dir: GravityDir) => void): () => void {
    this.gravityHandlers.add(cb);
    return () => this.gravityHandlers.delete(cb);
  }

  public triggerLaunch(): void {
    for (const cb of this.launchHandlers) {
      cb();
    }
  }

  public triggerRespawn(): void {
    for (const cb of this.respawnHandlers) {
      cb();
    }
  }

  public triggerGravity(dir: GravityDir): void {
    for (const cb of this.gravityHandlers) {
      cb(dir);
    }
  }

  public setVirtualDirHeld(dir: GravityDir, held: boolean): void {
    const keyMap: Partial<Record<GravityDir, string>> = {
      up: 'KeyW',
      forward: 'KeyW',
      down: 'KeyS',
      back: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
    };
    const code = keyMap[dir];
    if (!code) return;
    if (held) {
      this.heldKeys.add(code);
    } else {
      this.heldKeys.delete(code);
    }
  }

  /**
   * Returns normalized horizontal steering vector [-1..1, -1..1] for walking on cliff platform or steering in mid-air
   */
  public getMoveAxes(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) x -= 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) x += 1;
    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) z -= 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) z += 1;
    return { x, z };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.heldKeys.add(e.code);
    if (e.repeat) return;
    const code = e.code;

    if (code === 'Space') {
      e.preventDefault();
      this.triggerLaunch();
      return;
    }

    if (code === 'KeyR') {
      e.preventDefault();
      this.triggerRespawn();
      return;
    }

    switch (code) {
      case 'KeyS':
      case 'ArrowDown':
        e.preventDefault();
        this.triggerGravity('down');
        break;
      case 'KeyW':
      case 'ArrowUp':
        e.preventDefault();
        this.triggerGravity('up');
        break;
      case 'KeyA':
      case 'ArrowLeft':
        e.preventDefault();
        this.triggerGravity('left');
        break;
      case 'KeyD':
      case 'ArrowRight':
        e.preventDefault();
        this.triggerGravity('right');
        break;
      case 'KeyQ':
        e.preventDefault();
        this.triggerGravity('forward');
        break;
      case 'KeyE':
        e.preventDefault();
        this.triggerGravity('back');
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private onBlur = (): void => {
    this.heldKeys.clear();
  };

  private onTouchStart = (e: TouchEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, .ui-interactive')) {
      this.isSwiping = false;
      return;
    }
    if (e.touches.length === 1) {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchStartTime = performance.now();
      this.isSwiping = true;
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (!this.isSwiping || e.changedTouches.length === 0) return;
    this.isSwiping = false;

    const dt = performance.now() - this.touchStartTime;
    if (dt > 700) return;

    const dx = e.changedTouches[0].clientX - this.touchStartX;
    const dy = e.changedTouches[0].clientY - this.touchStartY;
    const distSq = dx * dx + dy * dy;

    if (distSq < 32 * 32) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.triggerGravity(dx > 0 ? 'right' : 'left');
    } else {
      this.triggerGravity(dy > 0 ? 'down' : 'up');
    }
  };

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchend', this.onTouchEnd);
  }
}
