import * as THREE from 'three';
import { CONFIG, type GravityDir } from '../config';
import { GravityController } from '../gameplay/GravityController';
import { LevelBuilder, LEVELS, type LevelDef } from '../gameplay/Levels';
import { Scoring } from '../gameplay/Scoring';
import { upgrades } from '../gameplay/Upgrades';
import { I18N } from '../i18n';
import { ImpactSystem } from '../physics/ImpactSystem';
import { Ragdoll } from '../physics/Ragdoll';
import { PhysicsWorld } from '../physics/World';
import { playgama } from '../platform/PlaygamaService';
import { saveService } from '../platform/SaveService';
import { CameraRig } from '../render/CameraRig';
import { EffectsManager } from '../render/Effects';
import { GameScene } from '../render/Scene';
import { UIManager } from '../ui/UIManager';
import { events } from './EventBus';
import { Input } from './Input';
import { sound } from './Sound';
import { Time } from './Time';

export type RoundState = 'ready' | 'flying' | 'ended';

export class Game {
  private time = new Time();
  private input = new Input();
  private physics = new PhysicsWorld();
  private gameScene: GameScene;
  private cameraRig: CameraRig;
  private effects: EffectsManager;
  private levelBuilder: LevelBuilder;
  private ragdoll: Ragdoll;
  private gravityCtrl = new GravityController();
  private scoring = new Scoring();
  private impactSystem = new ImpactSystem();
  private ui!: UIManager;

  public state: RoundState = 'ready';
  private isPaused = false;
  private roundElapsed = 0;
  private idleTimer = 0;
  private telemetryTicker = 0;
  private jumpAdRegistered = false;

  private readonly torsoPos = new THREE.Vector3();
  private readonly torsoVel = new THREE.Vector3();
  private readonly launchDir = new THREE.Vector3(0, 0.22, -1).normalize();

  constructor(container: HTMLElement) {
    this.gameScene = new GameScene(container);
    this.cameraRig = new CameraRig(this.gameScene.camera);
    this.effects = new EffectsManager(this.gameScene.scene);
    this.levelBuilder = new LevelBuilder(this.gameScene.scene);
    this.ragdoll = new Ragdoll(this.gameScene.scene);
  }

  public async init(): Promise<void> {
    await this.physics.init();

    this.applySettings();

    this.ui = new UIManager(this.input, {
      onSelectLevel: (idx) => {
        saveService.data.selectedLevel = idx;
        void saveService.save();
        this.startNewRound();
      },
      onRestartRound: () => {
        this.quickRespawn();
      },
      onGrantExtraFlips: () => {
        this.gravityCtrl.addExtraCharges(CONFIG.ADS.REWARDED_EXTRA_FLIPS);
      },
      onApplySettings: () => {
        this.applySettings();
      },
    });

    this.bindInputAndEvents();
    this.startNewRound();

    requestAnimationFrame(this.loop);
  }

  private applySettings(): void {
    const s = saveService.data.settings;
    this.gameScene.applyQuality(s.quality);
    sound.enabled = s.sound;
    this.cameraRig.lockRoll = s.lockCameraRoll;
  }

  private bindInputAndEvents(): void {
    this.input.onLaunch(() => {
      if (this.isPaused) return;
      if (this.state === 'ready') {
        this.launchRagdoll();
      } else if (this.state === 'ended') {
        this.startNewRound();
      }
    });

    this.input.onRespawn(() => {
      if (this.isPaused) return;
      this.quickRespawn();
    });

    this.input.onGravitySelect((dir: GravityDir) => {
      // While standing on the cliff platform, WASD walks the character; only trigger gravity flips after diving!
      if (this.state !== 'flying' || this.isPaused) {
        return;
      }
      const switched = this.gravityCtrl.trySwitchGravity(
        dir,
        this.roundElapsed,
        true,
        this.physics,
        this.ragdoll,
        this.cameraRig
      );
      if (switched) {
        sound.playGravityFlip();
        const col = CONFIG.GRAVITY.COLORS[dir];
        this.effects.setGravityFrameColor(col.hex);
        this.ragdoll.getTorsoPosition(this.torsoPos);
        this.effects.spawnBurst(this.torsoPos, col.num, 14, 9);
      }
    });

    events.on('pauseChanged', ({ paused, muted }) => {
      this.isPaused = paused;
      sound.setSystemMute(muted);
      if (!paused) {
        this.time.reset(performance.now());
      }
    });

    events.on('impactOccurred', (payload) => {
      const strength = Math.min(2.5, payload.damage / 50);
      sound.playImpact(strength);
      this.cameraRig.addShake(Math.min(0.45, payload.damage * 0.0035));

      const matColor = CONFIG.MATERIALS[payload.material].color;
      this.effects.spawnBurst(payload.worldPos, matColor, 10, 6 + strength * 2);

      const lang = saveService.data.settings.language;
      if (payload.isGravitySlam) {
        this.effects.spawnFloatingText(
          payload.worldPos,
          `${I18N[lang].gravitySlamPopup} +${payload.damage}`,
          '#c084fc',
          1.25
        );
      } else {
        this.effects.spawnFloatingText(
          payload.worldPos,
          `+${payload.damage}`,
          payload.combo > 1 ? '#facc15' : '#f8fafc',
          payload.combo > 2 ? 1.15 : 1.0
        );
      }
    });

    events.on('boneStageChanged', (payload) => {
      const lang = saveService.data.settings.language;
      if (payload.stage === 'broken') {
        sound.playBoneCrunch();
        this.effects.triggerRedFlash();
        this.cameraRig.addShake(0.34);
        this.effects.spawnBurst(payload.worldPos, 0xef4444, 20, 11);

        this.effects.spawnFloatingText(
          { x: payload.worldPos.x, y: payload.worldPos.y + 0.85, z: payload.worldPos.z },
          `${I18N[lang].boneBrokenPrefix} ${payload.name}! (+$${payload.bonusCash})`,
          '#ef4444',
          1.35
        );

        if (saveService.data.settings.vibration && navigator.vibrate) {
          try {
            navigator.vibrate(45);
          } catch {
            // Ignore vibration errors
          }
        }
      } else if (payload.stage === 'dislocated') {
        sound.playBoneCrunch();
        this.effects.spawnBurst(payload.worldPos, 0xf97316, 12, 8);
        this.effects.spawnFloatingText(
          { x: payload.worldPos.x, y: payload.worldPos.y + 0.65, z: payload.worldPos.z },
          `${I18N[lang].boneDislocatedPrefix} ${payload.name} (+$${payload.bonusCash})`,
          '#fb923c',
          1.15
        );
      } else if (payload.stage === 'sprained') {
        this.effects.spawnFloatingText(
          { x: payload.worldPos.x, y: payload.worldPos.y + 0.55, z: payload.worldPos.z },
          `${I18N[lang].boneSprainedPrefix} ${payload.name}`,
          '#fde047',
          1.05
        );
      }
    });
  }

  private getCurrentLevel(): LevelDef {
    return LEVELS[saveService.data.selectedLevel] ?? LEVELS[0];
  }

  public startNewRound(): void {
    this.state = 'ready';
    this.roundElapsed = 0;
    this.idleTimer = 0;
    this.telemetryTicker = 0;

    const level = this.getCurrentLevel();
    this.physics.setGravityMagnitude(upgrades.getGravityMagnitude());
    this.physics.recreateWorld();

    this.levelBuilder.loadLevel(level, this.physics, (elev, azim, turb, fogCol) => {
      this.gameScene.setAtmosphere(elev, azim, turb, 0.00014, fogCol);
    });

    const [sx, sy, sz] = level.spawnPos;
    this.ragdoll.spawn(
      this.physics,
      { x: sx, y: sy, z: sz },
      upgrades.getMassMultiplier(),
      upgrades.getBounceMultiplier()
    );

    this.scoring.reset(sy);
    this.impactSystem.reset();
    this.gravityCtrl.reset(upgrades.getMaxFlipCharges(), upgrades.getFlipCooldown());
    this.effects.setGravityFrameColor('#3b82f6');

    this.ragdoll.getTorsoPosition(this.torsoPos);
    this.cameraRig.reset(this.torsoPos);
    this.gameScene.updateShadowFollow(this.torsoPos);

    events.emit('roundStarted', { levelIndex: saveService.data.selectedLevel });
  }

  private launchRagdoll(): void {
    if (this.state !== 'ready') return;
    this.state = 'flying';
    this.roundElapsed = 0;
    this.idleTimer = 0;
    this.jumpAdRegistered = false;

    sound.playLaunch();
    playgama.sendGameplayStarted();

    const powerMult = upgrades.getLaunchPowerMultiplier();
    this.ragdoll.launch(this.launchDir, powerMult);

    events.emit('roundLaunched', undefined);
  }

  private bankCurrentRoundRewards(): {
    cashEarned: number;
    xpEarned: number;
    levelsGained: number;
    bonusCash: number;
  } {
    const cashEarned = this.scoring.computeRoundCash(
      upgrades.getBoneValueMultiplier()
    );
    const xpEarned = this.scoring.computeRoundXp();
    const lvlRes = saveService.addXp(xpEarned);

    saveService.data.cash += cashEarned;
    saveService.data.totalLifetimeDamage += Math.round(this.scoring.totalDamage);

    // Auto-unlock any map whose requiredPlayerLevel is reached
    LEVELS.forEach((lvl, idx) => {
      if (
        saveService.data.playerLevel >= lvl.requiredPlayerLevel &&
        !saveService.data.unlockedLevels.includes(idx)
      ) {
        saveService.data.unlockedLevels.push(idx);
      }
    });

    events.emit('cashUpdated', {
      cash: saveService.data.cash,
      delta: cashEarned + lvlRes.bonusCash,
    });
    events.emit('playerLevelUpdated', {
      playerLevel: saveService.data.playerLevel,
      playerXp: saveService.data.playerXp,
      xpRequired: saveService.getXpRequiredForNextLevel(),
      levelsGained: lvlRes.levelsGained,
      bonusCash: lvlRes.bonusCash,
    });

    return {
      cashEarned,
      xpEarned,
      levelsGained: lvlRes.levelsGained,
      bonusCash: lvlRes.bonusCash,
    };
  }

  public quickRespawn(): void {
    if (this.state === 'flying') {
      playgama.sendGameplayStopped();
      if (this.scoring.totalDamage > 0 || this.scoring.brokenBones.length > 0) {
        this.bankCurrentRoundRewards();
        void saveService.save();
      }
      if (!this.jumpAdRegistered) {
        this.jumpAdRegistered = true;
        void playgama.registerJumpAndShowInterstitial();
      }
    }
    this.startNewRound();
  }

  private async endRound(): Promise<void> {
    if (this.state === 'ended') return;
    this.state = 'ended';

    playgama.sendGameplayStopped();

    const { cashEarned, xpEarned, levelsGained, bonusCash } =
      this.bankCurrentRoundRewards();

    await saveService.save();
    if (!this.jumpAdRegistered) {
      this.jumpAdRegistered = true;
      await playgama.registerJumpAndShowInterstitial();
    }

    // Emit roundEnded only if player hasn't already manually respawned during ad await
    if (this.state !== 'ended') return;

    events.emit('roundEnded', {
      totalDamage: Math.round(this.scoring.totalDamage),
      brokenBones: [...this.scoring.brokenBones],
      sprainedCount: this.scoring.sprainedCount,
      dislocatedCount: this.scoring.dislocatedCount,
      maxCombo: this.scoring.maxCombo,
      gravitySlams: this.scoring.gravitySlams,
      fallDistanceMeters: this.scoring.fallDistanceMeters,
      cashEarned,
      xpEarned,
      levelsGained,
      levelBonusCash: bonusCash,
    });
  }

  private stepPhysics = (dt: number): void => {
    this.ragdoll.capturePreStepState();

    const axes = this.input.getMoveAxes();

    if (this.state === 'ready') {
      const walkedOffEdge = this.ragdoll.updateStandingWalk(dt, axes.x, axes.z);
      this.ragdoll.capturePostStepState();
      if (walkedOffEdge) {
        this.launchRagdoll();
      }
      return;
    }

    if (this.state === 'flying') {
      this.roundElapsed += dt;
      this.ragdoll.applyAirSteering(axes.x, axes.z, dt);
      this.gravityCtrl.update(dt, true);
      this.scoring.update(this.roundElapsed);
      this.checkGravityAnomalyZones();
    }

    this.physics.step(dt, (h1, h2, forceMag, maxDir) => {
      if (this.state !== 'flying') return;

      const isSlam = this.gravityCtrl.isWithinSlamWindow(this.roundElapsed);
      const res = this.impactSystem.processContactForce(
        h1,
        h2,
        forceMag,
        maxDir,
        this.roundElapsed,
        this.physics,
        this.ragdoll,
        this.scoring,
        isSlam,
        saveService.data.settings.language,
        (obsId, colHandle) => {
          this.levelBuilder.shatterObstacle(obsId, colHandle, this.physics);
        }
      );

      if (res.strongHit) {
        this.time.triggerHitStop(CONFIG.DAMAGE.HIT_STOP_DURATION_SEC);
      }
    });

    this.ragdoll.capturePostStepState();

    if (this.state === 'flying') {
      this.ragdoll.getTorsoPosition(this.torsoPos);

      // Apply water/valley braking when the ragdoll reaches the bottom basin so it settles quickly
      if (this.torsoPos.y <= 3.2) {
        this.ragdoll.applyBasinBraking(dt);
      }

      // Out-of-bounds safety check: if the ragdoll ever falls below the valley floor, end round / respawn immediately
      if (this.torsoPos.y < -18) {
        void this.endRound();
        return;
      }

      const speed = this.ragdoll.getTorsoSpeed();
      this.scoring.updateTelemetry(this.torsoPos.y, speed);

      this.telemetryTicker += dt;
      if (this.telemetryTicker >= 0.12) {
        this.telemetryTicker = 0;
        this.scoring.emitScore();
      }

      if (
        this.roundElapsed > CONFIG.ROUND.MIN_ROUND_TIME_BEFORE_IDLE_SEC &&
        speed < CONFIG.ROUND.IDLE_SPEED_THRESHOLD
      ) {
        this.idleTimer += dt;
      } else {
        this.idleTimer = 0;
      }

      if (
        this.idleTimer >= CONFIG.ROUND.IDLE_TIME_TO_END_SEC ||
        this.roundElapsed >= CONFIG.ROUND.MAX_DURATION_SEC
      ) {
        void this.endRound();
      }
    }
  };

  private checkGravityAnomalyZones(): void {
    const zones = this.levelBuilder.activeZones;
    if (zones.length === 0) return;

    this.ragdoll.getTorsoPosition(this.torsoPos);
    for (const z of zones) {
      const dx = Math.abs(this.torsoPos.x - z.pos[0]);
      const dy = Math.abs(this.torsoPos.y - z.pos[1]);
      const dz = Math.abs(this.torsoPos.z - z.pos[2]);
      if (dx <= z.size[0] && dy <= z.size[1] && dz <= z.size[2]) {
        if (this.gravityCtrl.currentDir !== z.forceDir) {
          this.gravityCtrl.charges = Math.max(1, this.gravityCtrl.charges);
          this.gravityCtrl.cooldownRemaining = 0;
          this.gravityCtrl.trySwitchGravity(
            z.forceDir,
            this.roundElapsed,
            true,
            this.physics,
            this.ragdoll,
            this.cameraRig
          );
        }
      }
    }
  }

  private handleAutoQuality = (fps: number): void => {
    if (fps < CONFIG.PERFORMANCE.LOW_FPS_THRESHOLD) {
      const cur = this.gameScene.getQuality();
      if (cur === 'high') {
        this.gameScene.applyQuality('medium');
      } else if (cur === 'medium') {
        this.gameScene.applyQuality('low');
      }
    }
  };

  private loop = (nowMs: number): void => {
    requestAnimationFrame(this.loop);

    const frameDt = this.time.tick(
      nowMs,
      this.isPaused,
      this.stepPhysics,
      this.handleAutoQuality
    );

    if (this.isPaused) return;

    this.ragdoll.syncRenderInterpolation(this.time.alpha);
    this.ragdoll.getTorsoPosition(this.torsoPos);
    this.ragdoll.getTorsoVelocity(this.torsoVel);

    const level = this.getCurrentLevel();
    this.cameraRig.update(frameDt, this.torsoPos, this.torsoVel, level.boundsHalfWidth);
    this.gameScene.updateShadowFollow(this.torsoPos);
    this.effects.update(frameDt, this.gameScene.camera);
    this.ui.update(frameDt);

    this.gameScene.render();
  };
}
