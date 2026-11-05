import { CONFIG, type UpgradeConfig, type UpgradeId } from '../config';
import { events } from '../core/EventBus';
import { saveService } from '../platform/SaveService';

export class UpgradesManager {
  public getLevel(id: UpgradeId): number {
    return saveService.data.upgrades[id] ?? 0;
  }

  public getConfig(id: UpgradeId): UpgradeConfig {
    return CONFIG.UPGRADES.find((u) => u.id === id)!;
  }

  public getCost(id: UpgradeId): number {
    const cfg = this.getConfig(id);
    const lvl = this.getLevel(id);
    return Math.round(cfg.baseCost * Math.pow(cfg.costMultiplier, lvl));
  }

  public isMaxed(id: UpgradeId): boolean {
    const cfg = this.getConfig(id);
    return this.getLevel(id) >= cfg.maxLevel;
  }

  public getValue(id: UpgradeId): number {
    const cfg = this.getConfig(id);
    const lvl = this.getLevel(id);
    return cfg.baseValue + lvl * cfg.stepValue;
  }

  public canAfford(id: UpgradeId): boolean {
    if (this.isMaxed(id)) return false;
    return saveService.data.cash >= this.getCost(id);
  }

  public buy(id: UpgradeId): boolean {
    if (!this.canAfford(id)) return false;
    const cost = this.getCost(id);
    saveService.data.cash -= cost;
    saveService.data.upgrades[id] = this.getLevel(id) + 1;
    events.emit('cashUpdated', { cash: saveService.data.cash, delta: -cost });
    void saveService.save();
    return true;
  }

  public getLaunchPowerMultiplier(): number {
    return this.getValue('launchPower');
  }

  public getGravityMagnitude(): number {
    return CONFIG.PHYSICS.BASE_GRAVITY * this.getValue('gravityStrength');
  }

  public getFlipCooldown(): number {
    return Math.max(0.22, CONFIG.GRAVITY.BASE_COOLDOWN * this.getValue('flipCooldown'));
  }

  public getMaxFlipCharges(): number {
    return CONFIG.GRAVITY.BASE_MAX_CHARGES + Math.round(this.getValue('flipCharges'));
  }

  public getBoneValueMultiplier(): number {
    return this.getValue('boneValue');
  }

  public getBounceMultiplier(): number {
    return this.getValue('bounce');
  }

  public getMassMultiplier(): number {
    return this.getValue('mass');
  }
}

export const upgrades = new UpgradesManager();
