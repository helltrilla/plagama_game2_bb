import { CONFIG, type QualityPreset, type UpgradeId } from '../config';
import { playgama } from './PlaygamaService';

export interface SaveData {
  cash: number;
  playerLevel: number;
  playerXp: number;
  totalLifetimeDamage: number;
  unlockedLevels: number[];
  selectedLevel: number;
  upgrades: Record<UpgradeId, number>;
  lastDailyBonusTimestamp: number;
  settings: {
    quality: QualityPreset;
    sound: boolean;
    music: boolean;
    vibration: boolean;
    lockCameraRoll: boolean;
    language: 'ru' | 'en';
    languageChosenByUser?: boolean;
  };
}

const SAVE_KEY = 'gravity_bones_save_v1';

export class SaveService {
  public data: SaveData;

  constructor() {
    this.data = this.createDefaultSave();
  }

  private createDefaultSave(): SaveData {
    const upgrades = {} as Record<UpgradeId, number>;
    for (const upg of CONFIG.UPGRADES) {
      upgrades[upg.id] = 0;
    }

    return {
      cash: 0,
      playerLevel: 1,
      playerXp: 0,
      totalLifetimeDamage: 0,
      unlockedLevels: [0],
      selectedLevel: 0,
      upgrades,
      lastDailyBonusTimestamp: 0,
      settings: {
        quality: 'high',
        sound: true,
        music: true,
        vibration: true,
        lockCameraRoll: true,
        language: 'en',
        languageChosenByUser: false,
      },
    };
  }

  public getXpRequiredForNextLevel(level = this.data.playerLevel): number {
    return Math.round(
      CONFIG.PROGRESSION.BASE_XP_PER_LEVEL *
        Math.pow(CONFIG.PROGRESSION.XP_LEVEL_GROWTH, Math.max(0, level - 1))
    );
  }

  /**
   * Adds XP from a round and automatically levels up the player, returning how many levels were gained and bonus cash
   */
  public addXp(xpEarned: number): { levelsGained: number; bonusCash: number; newLevel: number } {
    this.data.playerXp += Math.max(0, Math.round(xpEarned));
    let levelsGained = 0;
    let bonusCash = 0;

    while (this.data.playerXp >= this.getXpRequiredForNextLevel(this.data.playerLevel)) {
      const req = this.getXpRequiredForNextLevel(this.data.playerLevel);
      this.data.playerXp -= req;
      this.data.playerLevel++;
      levelsGained++;
      bonusCash +=
        CONFIG.PROGRESSION.LEVEL_UP_CASH_REWARD_BASE * Math.ceil(this.data.playerLevel / 5);
    }

    if (bonusCash > 0) {
      this.data.cash += bonusCash;
    }

    return {
      levelsGained,
      bonusCash,
      newLevel: this.data.playerLevel,
    };
  }

  public async load(): Promise<SaveData> {
    const defaultData = this.createDefaultSave();
    try {
      const result = await playgama.storageGet([SAVE_KEY]);
      const raw = result[SAVE_KEY];
      if (!raw) {
        this.data = defaultData;
        return this.data;
      }

      const parsed: Partial<SaveData> =
        typeof raw === 'string' ? (JSON.parse(raw) as Partial<SaveData>) : (raw as Partial<SaveData>);

      this.data = {
        cash: typeof parsed.cash === 'number' && !Number.isNaN(parsed.cash) ? parsed.cash : 0,
        playerLevel:
          typeof parsed.playerLevel === 'number' && parsed.playerLevel >= 1
            ? parsed.playerLevel
            : 1,
        playerXp:
          typeof parsed.playerXp === 'number' && parsed.playerXp >= 0 ? parsed.playerXp : 0,
        totalLifetimeDamage:
          typeof parsed.totalLifetimeDamage === 'number' ? parsed.totalLifetimeDamage : 0,
        unlockedLevels:
          Array.isArray(parsed.unlockedLevels) && parsed.unlockedLevels.length > 0
            ? parsed.unlockedLevels
            : [0],
        selectedLevel: typeof parsed.selectedLevel === 'number' ? parsed.selectedLevel : 0,
        upgrades: {
          ...defaultData.upgrades,
          ...(parsed.upgrades ?? {}),
        },
        lastDailyBonusTimestamp:
          typeof parsed.lastDailyBonusTimestamp === 'number' ? parsed.lastDailyBonusTimestamp : 0,
        settings: {
          ...defaultData.settings,
          ...(parsed.settings ?? {}),
          language:
            parsed.settings?.languageChosenByUser && parsed.settings?.language
              ? parsed.settings.language
              : 'en',
        },
      };
    } catch {
      this.data = defaultData;
    }
    return this.data;
  }

  public async save(): Promise<void> {
    try {
      await playgama.storageSet(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // Safe fallback handled by PlaygamaService
    }
  }
}

export const saveService = new SaveService();
