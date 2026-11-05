import { CONFIG } from '../config';
import { events } from '../core/EventBus';

interface PlaygamaBridgeSDK {
  initialize(): Promise<void>;
  platform: {
    id: string;
    language: string;
    sendMessage(message: string): Promise<void> | void;
  };
  storage: {
    get(keys: string | string[]): Promise<unknown>;
    set(keys: string | string[], values: unknown): Promise<void>;
  };
  advertisement: {
    interstitialState: string;
    rewardedState: string;
    showInterstitial(): void;
    showRewarded(): void;
    on(event: string, callback: (state: string) => void): void;
  };
  game: {
    visibilityState: string;
    on(event: string, callback: (state: string) => void): void;
  };
  EVENT_NAME?: {
    INTERSTITIAL_STATE_CHANGED?: string;
    REWARDED_STATE_CHANGED?: string;
    VISIBILITY_STATE_CHANGED?: string;
    PAUSE_STATE_CHANGED?: string;
    AUDIO_STATE_CHANGED?: string;
  };
}

declare global {
  interface Window {
    bridge?: PlaygamaBridgeSDK;
  }
}

export class PlaygamaService {
  private bridge: PlaygamaBridgeSDK | null = null;
  public isMock = true;
  private mockStorage = new Map<string, unknown>();
  private lastInterstitialTimeMs = 0;
  private isAdShowing = false;
  private isHidden = false;
  private rewardedCallback: ((rewarded: boolean) => void) | null = null;
  private rewardedGranted = false;

  public async initialize(): Promise<void> {
    this.setupBrowserVisibilityFallback();

    const sdk = window.bridge;
    if (!sdk || typeof sdk.initialize !== 'function') {
      this.isMock = true;
      return;
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Bridge init timeout')), 3000)
      );
      await Promise.race([sdk.initialize(), timeoutPromise]);
      this.bridge = sdk;
      this.isMock = false;
      this.bindSdkEvents(sdk);
    } catch {
      this.bridge = null;
      this.isMock = true;
    }
  }

  private bindSdkEvents(sdk: PlaygamaBridgeSDK): void {
    try {
      const visEvent = sdk.EVENT_NAME?.VISIBILITY_STATE_CHANGED ?? 'visibility_state_changed';
      if (sdk.game && typeof sdk.game.on === 'function') {
        sdk.game.on(visEvent, (state: string) => {
          this.isHidden = state === 'hidden';
          this.emitPauseState();
        });
      }
    } catch {
      // Ignore event binding errors
    }

    try {
      const interEvent = sdk.EVENT_NAME?.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed';
      const rewEvent = sdk.EVENT_NAME?.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed';

      if (sdk.advertisement && typeof sdk.advertisement.on === 'function') {
        sdk.advertisement.on(interEvent, (state: string) => {
          if (state === 'opened' || state === 'loading') {
            this.isAdShowing = true;
            this.emitPauseState();
          } else if (state === 'closed' || state === 'failed') {
            this.isAdShowing = false;
            this.emitPauseState();
          }
        });

        sdk.advertisement.on(rewEvent, (state: string) => {
          if (state === 'opened' || state === 'loading') {
            this.isAdShowing = true;
            this.emitPauseState();
          } else if (state === 'rewarded') {
            this.rewardedGranted = true;
          } else if (state === 'closed' || state === 'failed') {
            this.isAdShowing = false;
            this.emitPauseState();
            if (this.rewardedCallback) {
              const cb = this.rewardedCallback;
              const granted = this.rewardedGranted;
              this.rewardedCallback = null;
              this.rewardedGranted = false;
              cb(granted);
            }
          }
        });
      }
    } catch {
      // Ignore advertisement binding errors
    }
  }

  private setupBrowserVisibilityFallback(): void {
    document.addEventListener('visibilitychange', () => {
      this.isHidden = document.visibilityState === 'hidden';
      this.emitPauseState();
    });
    window.addEventListener('blur', () => {
      this.isHidden = true;
      this.emitPauseState();
    });
    window.addEventListener('focus', () => {
      this.isHidden = document.visibilityState === 'hidden';
      this.emitPauseState();
    });
  }

  private emitPauseState(): void {
    const paused = this.isAdShowing || this.isHidden;
    events.emit('pauseChanged', { paused, muted: paused });
  }

  public sendGameReady(): void {
    if (this.isMock || !this.bridge) return;
    try {
      this.bridge.platform.sendMessage('game_ready');
    } catch {
      // Safe fallback
    }
  }

  public sendGameplayStarted(): void {
    if (this.isMock || !this.bridge) return;
    try {
      this.bridge.platform.sendMessage('gameplay_started');
    } catch {
      // Safe fallback
    }
  }

  public sendGameplayStopped(): void {
    if (this.isMock || !this.bridge) return;
    try {
      this.bridge.platform.sendMessage('gameplay_stopped');
    } catch {
      // Safe fallback
    }
  }

  public getLanguage(): 'ru' | 'en' {
    return 'en';
  }

  public async storageGet(keys: string[]): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    if (this.isMock || !this.bridge) {
      for (const k of keys) {
        result[k] = this.mockStorage.get(k) ?? null;
      }
      return result;
    }

    try {
      const data = await this.bridge.storage.get(keys);
      if (Array.isArray(data)) {
        keys.forEach((k, idx) => {
          result[k] = data[idx] ?? null;
        });
      } else if (data && typeof data === 'object') {
        for (const k of keys) {
          result[k] = (data as Record<string, unknown>)[k] ?? null;
        }
      } else if (keys.length === 1) {
        result[keys[0]] = data ?? null;
      }
    } catch {
      for (const k of keys) {
        result[k] = this.mockStorage.get(k) ?? null;
      }
    }
    return result;
  }

  public async storageSet(key: string, value: unknown): Promise<void> {
    this.mockStorage.set(key, value);
    if (this.isMock || !this.bridge) {
      return;
    }
    try {
      await this.bridge.storage.set([key], [value]);
    } catch {
      try {
        await this.bridge.storage.set(key, value);
      } catch {
        // Fallback already in mockStorage
      }
    }
  }

  private jumpsSinceLastAd = 0;
  private nextAdJumpTarget = CONFIG.ADS.MIN_JUMPS_PER_INTERSTITIAL;

  public canShowInterstitial(): boolean {
    const now = Date.now();
    const cooldownMs = CONFIG.ADS.INTERSTITIAL_COOLDOWN_SEC * 1000;
    return now - this.lastInterstitialTimeMs >= cooldownMs;
  }

  public async registerJumpAndShowInterstitial(): Promise<boolean> {
    this.jumpsSinceLastAd += 1;
    if (this.jumpsSinceLastAd < this.nextAdJumpTarget) {
      return false;
    }
    this.jumpsSinceLastAd = 0;
    this.nextAdJumpTarget =
      this.nextAdJumpTarget === CONFIG.ADS.MIN_JUMPS_PER_INTERSTITIAL
        ? CONFIG.ADS.MAX_JUMPS_PER_INTERSTITIAL
        : CONFIG.ADS.MIN_JUMPS_PER_INTERSTITIAL;
    return this.showInterstitialIfReady();
  }

  public async showInterstitialIfReady(): Promise<boolean> {
    if (!this.canShowInterstitial()) return false;
    this.lastInterstitialTimeMs = Date.now();

    if (this.isMock || !this.bridge) {
      this.isAdShowing = true;
      this.emitPauseState();
      await new Promise((r) => setTimeout(r, 350));
      this.isAdShowing = false;
      this.emitPauseState();
      return true;
    }

    try {
      this.bridge.advertisement.showInterstitial();
      return true;
    } catch {
      this.isAdShowing = false;
      this.emitPauseState();
      return false;
    }
  }

  public showRewarded(): Promise<boolean> {
    if (this.isMock || !this.bridge) {
      return new Promise((resolve) => {
        this.isAdShowing = true;
        this.emitPauseState();
        setTimeout(() => {
          this.isAdShowing = false;
          this.emitPauseState();
          resolve(true);
        }, 500);
      });
    }

    return new Promise((resolve) => {
      try {
        this.rewardedGranted = false;
        this.rewardedCallback = resolve;
        this.bridge!.advertisement.showRewarded();
      } catch {
        this.isAdShowing = false;
        this.emitPauseState();
        this.rewardedCallback = null;
        resolve(false);
      }
    });
  }
}

export const playgama = new PlaygamaService();
