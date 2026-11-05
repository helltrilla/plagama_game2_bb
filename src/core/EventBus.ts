import type { BoneId, GravityDir, QualityPreset, SurfaceMaterialId } from '../config';

export type BoneDamageStage = 'healthy' | 'sprained' | 'dislocated' | 'broken';

export interface GameEvents {
  gravityChanged: {
    dir: GravityDir;
    worldVec: { x: number; y: number; z: number };
    chargesLeft: number;
    maxCharges: number;
  };
  gravityChargeUpdated: {
    chargesLeft: number;
    maxCharges: number;
    cooldownRatio: number;
  };
  impactOccurred: {
    damage: number;
    worldPos: { x: number; y: number; z: number };
    isGravitySlam: boolean;
    combo: number;
    material: SurfaceMaterialId;
  };
  boneStageChanged: {
    boneId: BoneId;
    stage: BoneDamageStage;
    name: string;
    bonusCash: number;
    worldPos: { x: number; y: number; z: number };
  };
  boneBroken: {
    boneId: BoneId;
    name: string;
    bonusCash: number;
    worldPos: { x: number; y: number; z: number };
  };
  scoreUpdated: {
    totalDamage: number;
    combo: number;
    brokenCount: number;
    sprainedCount: number;
    dislocatedCount: number;
    totalBones: number;
    currentRoundCash: number;
    velocityMph: number;
    fallDistanceMeters: number;
  };
  cashUpdated: {
    cash: number;
    delta: number;
  };
  playerLevelUpdated: {
    playerLevel: number;
    playerXp: number;
    xpRequired: number;
    levelsGained: number;
    bonusCash: number;
  };
  roundStarted: {
    levelIndex: number;
  };
  roundLaunched: undefined;
  roundEnded: {
    totalDamage: number;
    brokenBones: BoneId[];
    sprainedCount: number;
    dislocatedCount: number;
    maxCombo: number;
    gravitySlams: number;
    fallDistanceMeters: number;
    cashEarned: number;
    xpEarned: number;
    levelsGained: number;
    levelBonusCash: number;
  };
  pauseChanged: {
    paused: boolean;
    muted: boolean;
  };
  qualityChanged: {
    quality: QualityPreset;
  };
  languageChanged: {
    lang: 'ru' | 'en';
  };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  public on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  public off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as Handler<unknown>);
    }
  }

  public emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }
}

export const events = new EventBus();
