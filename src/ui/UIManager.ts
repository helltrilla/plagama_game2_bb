import { CONFIG, type BoneId, type GravityDir, type QualityPreset, type UpgradeId } from '../config';
import { events } from '../core/EventBus';
import type { Input } from '../core/Input';
import { sound } from '../core/Sound';
import { LEVELS } from '../gameplay/Levels';
import { upgrades } from '../gameplay/Upgrades';
import { I18N, type LangKey } from '../i18n';
import { playgama } from '../platform/PlaygamaService';
import { saveService } from '../platform/SaveService';

export interface UICallbacks {
  onSelectLevel: (index: number) => void;
  onRestartRound: () => void;
  onGrantExtraFlips: () => void;
  onApplySettings: () => void;
}

export class UIManager {
  private root: HTMLElement;

  // Live HUD elements
  private playerLvlValEl!: HTMLElement;
  private xpFillEl!: HTMLElement;
  private damageValEl!: HTMLElement;
  private cashValEl!: HTMLElement;
  private roundCashValEl!: HTMLElement;
  private comboValEl!: HTMLElement;
  private bonesValEl!: HTMLElement;
  private ligamentsValEl!: HTMLElement;
  private telemetryValEl!: HTMLElement;
  private launchOverlayEl!: HTMLElement;
  private lvlBadgeEl!: HTMLElement;
  private extraFlipBtnEl!: HTMLButtonElement;
  private dailyBonusBtnEl!: HTMLButtonElement;

  private gravBadgeEl!: HTMLElement;
  private cooldownFillEl!: HTMLElement;
  private chargesRowEl!: HTMLElement;
  private boneRects = new Map<BoneId, SVGRectElement>();
  private dpadBtns = new Map<GravityDir, HTMLButtonElement>();

  // Modals
  private resultsModalEl!: HTMLElement;
  private shopModalEl!: HTMLElement;
  private levelsModalEl!: HTMLElement;
  private settingsModalEl!: HTMLElement;

  private displayedDamage = 0;
  private targetDamage = 0;
  private lastRoundCashEarned = 0;
  private doubleCashClaimed = false;

  constructor(private input: Input, private callbacks: UICallbacks) {
    this.root = document.getElementById('ui-root')!;
    this.buildHUD();
    this.bindEvents();
  }

  private t(key: LangKey): string {
    const lang = saveService.data.settings.language;
    return I18N[lang][key];
  }

  public buildHUD(): void {
    this.root.innerHTML = '';
    this.boneRects.clear();
    this.dpadBtns.clear();

    const lang = saveService.data.settings.language;

    // 1. Top Bar
    const topBar = document.createElement('div');
    topBar.className = 'hud-top';

    const statsWrap = document.createElement('div');
    statsWrap.className = 'hud-stats';

    // Player Level + XP Bar Pill
    const lvlPill = document.createElement('div');
    lvlPill.className = 'stat-pill';
    lvlPill.style.minWidth = '135px';
    const lvlLbl = document.createElement('span');
    lvlLbl.className = 'stat-label';
    lvlLbl.textContent = `${this.t('playerLevel')} & ${this.t('xp')}`;

    this.playerLvlValEl = document.createElement('span');
    this.playerLvlValEl.className = 'stat-value';
    this.playerLvlValEl.style.color = '#38bdf8';

    const xpBarBg = document.createElement('div');
    xpBarBg.className = 'cooldown-bar-bg';
    xpBarBg.style.marginTop = '4px';
    this.xpFillEl = document.createElement('div');
    this.xpFillEl.className = 'cooldown-bar-fill';
    this.xpFillEl.style.background = 'linear-gradient(90deg, #38bdf8, #a855f7)';
    xpBarBg.appendChild(this.xpFillEl);

    lvlPill.append(lvlLbl, this.playerLvlValEl, xpBarBg);
    statsWrap.appendChild(lvlPill);
    this.refreshPlayerLevelPill();

    const createStatPill = (
      label: string,
      initialVal: string,
      extraClass = '',
      pillClass = ''
    ) => {
      const pill = document.createElement('div');
      pill.className = `stat-pill ${pillClass}`.trim();
      const lbl = document.createElement('span');
      lbl.className = 'stat-label';
      lbl.textContent = label;
      const val = document.createElement('span');
      val.className = `stat-value ${extraClass}`.trim();
      val.textContent = initialVal;
      pill.append(lbl, val);
      statsWrap.appendChild(pill);
      return val;
    };

    this.cashValEl = createStatPill(this.t('cash'), `$${saveService.data.cash}`, 'cash');
    this.roundCashValEl = createStatPill(this.t('roundCash'), '+$0', 'cash');
    this.damageValEl = createStatPill(this.t('damage'), '0');
    this.bonesValEl = createStatPill(this.t('bones'), `0/${CONFIG.BONES.length}`);
    this.ligamentsValEl = createStatPill(this.t('dislocations'), '0', '', 'hide-mobile');
    this.comboValEl = createStatPill(this.t('combo'), '×1', 'combo');
    this.telemetryValEl = createStatPill(
      this.t('velocity'),
      '0 MPH • 0m',
      '',
      'hide-mobile'
    );

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'hud-actions';

    this.dailyBonusBtnEl = document.createElement('button');
    this.dailyBonusBtnEl.className = 'btn btn-reward';
    this.dailyBonusBtnEl.textContent = `🎁 ${this.t('dailyBonusBtn')}`;
    this.dailyBonusBtnEl.onclick = () => this.claimDailyBonus();
    this.updateDailyBonusVisibility();

    const respawnBtn = document.createElement('button');
    respawnBtn.className = 'btn btn-success ui-interactive';
    respawnBtn.innerHTML =
      lang === 'ru'
        ? '🔄 <span>Респавн</span> <span class="key-hint">[R]</span>'
        : '🔄 <span>Respawn</span> <span class="key-hint">[R]</span>';
    respawnBtn.onclick = () => this.callbacks.onRestartRound();

    const levelsBtn = document.createElement('button');
    levelsBtn.className = 'btn';
    levelsBtn.textContent = `🌍 ${this.t('levelsBtn')}`;
    levelsBtn.onclick = () => this.openLevelsModal();

    const shopBtn = document.createElement('button');
    shopBtn.className = 'btn btn-primary';
    shopBtn.textContent = `⚡ ${this.t('shopBtn')}`;
    shopBtn.onclick = () => this.openShopModal();

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'btn';
    settingsBtn.textContent = '⚙️';
    settingsBtn.title = this.t('settingsBtn');
    settingsBtn.onclick = () => this.openSettingsModal();

    actionsWrap.append(this.dailyBonusBtnEl, respawnBtn, levelsBtn, shopBtn, settingsBtn);
    topBar.append(statsWrap, actionsWrap);

    // 2. Middle section: X-Ray Skeleton HUD on left + Cliff Dive prompt in center
    const midBar = document.createElement('div');
    midBar.className = 'hud-middle';

    const skelPanel = document.createElement('div');
    skelPanel.className = 'skeleton-panel';
    const skelTitle = document.createElement('div');
    skelTitle.className = 'skeleton-title';
    skelTitle.textContent = lang === 'ru' ? 'РЕНТГЕН' : 'X-RAY';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 175');
    svg.setAttribute('class', 'skeleton-svg');

    for (const bCfg of CONFIG.BONES) {
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(bCfg.hudPos.x));
      rect.setAttribute('y', String(bCfg.hudPos.y));
      rect.setAttribute('width', String(bCfg.hudPos.w));
      rect.setAttribute('height', String(bCfg.hudPos.h));
      rect.setAttribute('rx', '1.8');
      rect.setAttribute('class', 'bone-rect');
      svg.appendChild(rect);
      this.boneRects.set(bCfg.id, rect);
    }

    skelPanel.append(skelTitle, svg);

    this.launchOverlayEl = document.createElement('div');
    this.launchOverlayEl.className = 'center-overlay';
    this.launchOverlayEl.style.top = '72%';

    const curLvl = LEVELS[saveService.data.selectedLevel] ?? LEVELS[0];
    this.lvlBadgeEl = document.createElement('div');
    this.lvlBadgeEl.className = 'lvl-badge';
    this.lvlBadgeEl.textContent = `🏔️ ${lang === 'ru' ? curLvl.nameRu : curLvl.nameEn}`;

    const hintBadge = document.createElement('div');
    hintBadge.className = 'walk-hint-badge';
    hintBadge.textContent = this.t('walkHint');

    const launchBtn = document.createElement('button');
    launchBtn.className = 'btn btn-primary launch-btn ui-interactive';
    launchBtn.textContent = `🦅 ${this.t('launchBtn')}`;
    launchBtn.onclick = () => this.input.triggerLaunch();

    this.launchOverlayEl.append(this.lvlBadgeEl, launchBtn, hintBadge);
    midBar.append(skelPanel, this.launchOverlayEl);

    // 3. Bottom Bar: Trajectory Nudge Indicator + 6-Dir D-Pad
    const botBar = document.createElement('div');
    botBar.className = 'hud-bottom';

    const gravCard = document.createElement('div');
    gravCard.className = 'gravity-indicator-card';

    const gravHeader = document.createElement('div');
    gravHeader.className = 'gravity-header';
    const gravLbl = document.createElement('span');
    gravLbl.className = 'stat-label';
    gravLbl.textContent = this.t('gravityTitle');

    this.gravBadgeEl = document.createElement('span');
    this.gravBadgeEl.className = 'gravity-badge';
    this.gravBadgeEl.textContent = '▼ DIVE';
    gravHeader.append(gravLbl, this.gravBadgeEl);

    const cdBg = document.createElement('div');
    cdBg.className = 'cooldown-bar-bg';
    this.cooldownFillEl = document.createElement('div');
    this.cooldownFillEl.className = 'cooldown-bar-fill';
    cdBg.appendChild(this.cooldownFillEl);

    this.chargesRowEl = document.createElement('div');
    this.chargesRowEl.className = 'charges-row';

    this.extraFlipBtnEl = document.createElement('button');
    this.extraFlipBtnEl.className = 'btn btn-reward';
    this.extraFlipBtnEl.style.cssText = 'min-height: 36px; padding: 6px 10px; font-size: 12px; display: none;';
    this.extraFlipBtnEl.textContent = `🎬 ${this.t('extraFlipBtn')}`;
    this.extraFlipBtnEl.onclick = async () => {
      const ok = await playgama.showRewarded();
      if (ok) {
        this.callbacks.onGrantExtraFlips();
      }
    };

    gravCard.append(gravHeader, cdBg, this.chargesRowEl, this.extraFlipBtnEl);

    const dpad = document.createElement('div');
    dpad.className = 'gravity-dpad';

    const padLayout: { dir: GravityDir; icon: string; key: string }[] = [
      { dir: 'forward', icon: '◆', key: 'Q' },
      { dir: 'up', icon: '▲', key: 'W' },
      { dir: 'back', icon: '◈', key: 'E' },
      { dir: 'left', icon: '◀', key: 'A' },
      { dir: 'down', icon: '▼', key: 'S' },
      { dir: 'right', icon: '▶', key: 'D' },
    ];

    for (const item of padLayout) {
      const b = document.createElement('button');
      b.className = 'dpad-btn ui-interactive';
      b.innerHTML = `<span>${item.icon}</span><span class="key-hint">${item.key}</span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('active-dir');
        this.input.setVirtualDirHeld(item.dir, true);
        this.input.triggerGravity(item.dir);
      });
      const releaseDir = () => {
        b.classList.remove('active-dir');
        this.input.setVirtualDirHeld(item.dir, false);
      };
      b.addEventListener('pointerup', releaseDir);
      b.addEventListener('pointercancel', releaseDir);
      b.addEventListener('pointerleave', releaseDir);
      dpad.appendChild(b);
      this.dpadBtns.set(item.dir, b);
    }

    botBar.append(gravCard, dpad);
    this.root.append(topBar, midBar, botBar);

    this.createModals();
  }

  private refreshPlayerLevelPill(): void {
    if (!this.playerLvlValEl || !this.xpFillEl) return;
    const lvl = saveService.data.playerLevel;
    const xp = saveService.data.playerXp;
    const req = saveService.getXpRequiredForNextLevel(lvl);
    const pct = Math.min(100, Math.round((xp / Math.max(1, req)) * 100));
    this.playerLvlValEl.textContent = `LVL ${lvl} (${xp}/${req})`;
    this.xpFillEl.style.width = `${pct}%`;
  }

  private createModals(): void {
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());

    this.resultsModalEl = this.createBackdrop();
    this.shopModalEl = this.createBackdrop();
    this.levelsModalEl = this.createBackdrop();
    this.settingsModalEl = this.createBackdrop();

    document.body.append(
      this.resultsModalEl,
      this.shopModalEl,
      this.levelsModalEl,
      this.settingsModalEl
    );
  }

  private createBackdrop(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    return el;
  }

  private bindEvents(): void {
    events.on('scoreUpdated', (payload) => {
      this.targetDamage = payload.totalDamage;
      this.roundCashValEl.textContent = `+$${payload.currentRoundCash}`;
      this.comboValEl.textContent = `×${payload.combo}`;
      this.bonesValEl.textContent = `${payload.brokenCount}/${payload.totalBones}`;
      this.ligamentsValEl.textContent = String(
        payload.sprainedCount + payload.dislocatedCount
      );
      this.telemetryValEl.textContent = `${payload.velocityMph} MPH • ${payload.fallDistanceMeters}m`;
    });

    events.on('cashUpdated', (payload) => {
      this.cashValEl.textContent = `$${payload.cash}`;
    });

    events.on('playerLevelUpdated', () => {
      this.refreshPlayerLevelPill();
    });

    events.on('boneStageChanged', (payload) => {
      const rect = this.boneRects.get(payload.boneId);
      if (!rect) return;
      if (payload.stage === 'broken') {
        rect.setAttribute('class', 'bone-rect broken ui-interactive');
      } else if (payload.stage === 'dislocated' || payload.stage === 'sprained') {
        rect.setAttribute('class', 'bone-rect damaged ui-interactive');
      }
    });

    events.on('gravityChanged', (payload) => {
      const colInfo = CONFIG.GRAVITY.COLORS[payload.dir];
      const lang = saveService.data.settings.language;
      const lbl = lang === 'ru' ? colInfo.labelRu : colInfo.labelEn;
      this.gravBadgeEl.textContent = `${colInfo.icon} ${lbl}`;
      this.gravBadgeEl.style.background = `${colInfo.hex}33`;
      this.gravBadgeEl.style.color = colInfo.hex;

      for (const [d, btn] of this.dpadBtns.entries()) {
        btn.classList.toggle('active-dir', d === payload.dir);
      }
    });

    events.on('gravityChargeUpdated', (payload) => {
      this.cooldownFillEl.style.width = `${(payload.cooldownRatio * 100).toFixed(1)}%`;
      this.chargesRowEl.innerHTML = '';
      for (let i = 0; i < payload.maxCharges; i++) {
        const pip = document.createElement('div');
        pip.className = `charge-pip ${i < payload.chargesLeft ? 'active' : ''}`;
        this.chargesRowEl.appendChild(pip);
      }
      this.extraFlipBtnEl.style.display = payload.chargesLeft === 0 ? 'inline-flex' : 'none';
    });

    events.on('roundStarted', () => {
      const lang = saveService.data.settings.language;
      const curLvl = LEVELS[saveService.data.selectedLevel] ?? LEVELS[0];
      if (this.lvlBadgeEl) {
        this.lvlBadgeEl.textContent = `🏔️ ${lang === 'ru' ? curLvl.nameRu : curLvl.nameEn}`;
      }
      this.launchOverlayEl.style.display = 'flex';
      this.resultsModalEl.classList.remove('open');
      this.shopModalEl.classList.remove('open');
      this.levelsModalEl.classList.remove('open');
      this.settingsModalEl.classList.remove('open');
      this.displayedDamage = 0;
      this.targetDamage = 0;
      this.damageValEl.textContent = '0';
      this.roundCashValEl.textContent = '+$0';
      this.comboValEl.textContent = '×1';
      this.bonesValEl.textContent = `0/${CONFIG.BONES.length}`;
      this.ligamentsValEl.textContent = '0';
      this.telemetryValEl.textContent = '0 MPH • 0m';
      this.refreshPlayerLevelPill();
      for (const rect of this.boneRects.values()) {
        rect.setAttribute('class', 'bone-rect ui-interactive');
      }
    });

    events.on('roundLaunched', () => {
      this.launchOverlayEl.style.display = 'none';
    });

    events.on('roundEnded', (payload) => {
      this.lastRoundCashEarned = payload.cashEarned;
      this.doubleCashClaimed = false;
      this.refreshPlayerLevelPill();
      this.openResultsModal(payload);
    });
  }

  public update(dt: number): void {
    if (this.displayedDamage !== this.targetDamage) {
      const diff = this.targetDamage - this.displayedDamage;
      const step = Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 12)));
      if (Math.abs(diff) <= step) {
        this.displayedDamage = this.targetDamage;
      } else {
        this.displayedDamage += Math.sign(diff) * step;
      }
      this.damageValEl.textContent = String(this.displayedDamage);
    }
  }

  private updateDailyBonusVisibility(): void {
    const now = Date.now();
    const canClaim =
      now - saveService.data.lastDailyBonusTimestamp >= CONFIG.ADS.DAILY_BONUS_COOLDOWN_MS;
    if (this.dailyBonusBtnEl) {
      this.dailyBonusBtnEl.style.display = canClaim ? 'inline-flex' : 'none';
    }
  }

  private claimDailyBonus(): void {
    const now = Date.now();
    if (now - saveService.data.lastDailyBonusTimestamp < CONFIG.ADS.DAILY_BONUS_COOLDOWN_MS) {
      return;
    }
    const bonus = CONFIG.ADS.DAILY_BONUS_BASE_CASH;
    saveService.data.lastDailyBonusTimestamp = now;
    saveService.data.cash += bonus;
    sound.playUpgradeBuy();
    events.emit('cashUpdated', { cash: saveService.data.cash, delta: bonus });
    void saveService.save();
    this.updateDailyBonusVisibility();
  }

  private openResultsModal(payload: {
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
  }): void {
    this.resultsModalEl.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'modal-card';

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = `🩺 ${this.t('roundOverTitle')}`;
    card.appendChild(title);

    if (payload.levelsGained > 0) {
      const banner = document.createElement('div');
      banner.style.cssText =
        'background: linear-gradient(135deg, #2563eb, #9333ea); padding: 10px 16px; border-radius: 12px; font-weight: 900; text-align: center; font-size: 16px; color: #fff; box-shadow: 0 4px 16px rgba(147,51,234,0.45);';
      banner.textContent = `⭐ ${this.t('levelUpBanner')} LVL ${saveService.data.playerLevel} (+$${payload.levelBonusCash})`;
      card.appendChild(banner);
    }

    const grid = document.createElement('div');
    grid.className = 'result-stats-grid';

    const addStat = (lbl: string, val: string, color = '#f8fafc') => {
      const box = document.createElement('div');
      box.className = 'result-stat-box';
      box.innerHTML = `<div class="val" style="color:${color}">${val}</div><div class="lbl">${lbl}</div>`;
      grid.appendChild(box);
    };

    addStat(
      this.t('bonesBrokenLbl'),
      `${payload.brokenBones.length} / ${CONFIG.BONES.length}`,
      '#ef4444'
    );
    addStat(
      this.t('dislocationsLbl'),
      `${payload.dislocatedCount} (+${payload.sprainedCount} ${this.t('sprains').toLowerCase()})`,
      '#fb923c'
    );
    addStat(this.t('fallDistLbl'), `${payload.fallDistanceMeters} m`, '#38bdf8');
    addStat(this.t('xpEarnedLbl'), `+${payload.xpEarned} XP (LVL ${saveService.data.playerLevel})`, '#c084fc');
    addStat(this.t('totalDamageLbl'), String(payload.totalDamage));
    addStat(this.t('cashEarnedLbl'), `+$${payload.cashEarned}`, '#4ade80');

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;';

    const againBtn = document.createElement('button');
    againBtn.className = 'btn btn-primary';
    againBtn.style.flex = '1';
    againBtn.textContent = `🦅 ${this.t('againBtn')}`;
    againBtn.onclick = () => {
      this.resultsModalEl.classList.remove('open');
      this.callbacks.onRestartRound();
    };

    const mapsBtn = document.createElement('button');
    mapsBtn.className = 'btn';
    mapsBtn.style.flex = '1';
    mapsBtn.textContent = `🌍 ${this.t('levelsBtn')}`;
    mapsBtn.onclick = () => {
      this.resultsModalEl.classList.remove('open');
      this.openLevelsModal();
    };

    const shopBtn = document.createElement('button');
    shopBtn.className = 'btn';
    shopBtn.style.flex = '1';
    shopBtn.textContent = `⚡ ${this.t('shopBtn')}`;
    shopBtn.onclick = () => {
      this.resultsModalEl.classList.remove('open');
      this.openShopModal();
    };

    const doubleBtn = document.createElement('button');
    doubleBtn.className = 'btn btn-reward';
    doubleBtn.style.width = '100%';
    doubleBtn.textContent = `🎬 ${this.t('doubleCashBtn')} (+$${this.lastRoundCashEarned})`;
    doubleBtn.onclick = async () => {
      if (this.doubleCashClaimed) return;
      doubleBtn.disabled = true;
      const rewarded = await playgama.showRewarded();
      if (rewarded) {
        this.doubleCashClaimed = true;
        saveService.data.cash += this.lastRoundCashEarned;
        sound.playUpgradeBuy();
        events.emit('cashUpdated', {
          cash: saveService.data.cash,
          delta: this.lastRoundCashEarned,
        });
        void saveService.save();
        doubleBtn.textContent = `✅ ${this.t('claimedDouble')}`;
      } else {
        doubleBtn.disabled = false;
      }
    };

    btnRow.append(againBtn, mapsBtn, shopBtn, doubleBtn);
    card.append(grid, btnRow);
    this.resultsModalEl.appendChild(card);
    this.resultsModalEl.classList.add('open');
  }

  public openShopModal(): void {
    this.shopModalEl.innerHTML = '';
    const lang = saveService.data.settings.language;

    const card = document.createElement('div');
    card.className = 'modal-card';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h2 class="modal-title">⚡ ${this.t('shopTitle')} ($${saveService.data.cash})</h2>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = `✕ ${this.t('closeBtn')}`;
    closeBtn.onclick = () => {
      this.shopModalEl.classList.remove('open');
      this.callbacks.onRestartRound();
    };
    header.appendChild(closeBtn);

    const list = document.createElement('div');
    list.className = 'grid-list';

    for (const uCfg of CONFIG.UPGRADES) {
      const id = uCfg.id as UpgradeId;
      const lvl = upgrades.getLevel(id);
      const maxed = upgrades.isMaxed(id);
      const cost = upgrades.getCost(id);

      const item = document.createElement('div');
      item.className = 'item-card';

      const title = lang === 'ru' ? uCfg.nameRu : uCfg.nameEn;
      const desc = lang === 'ru' ? uCfg.descRu : uCfg.descEn;

      const info = document.createElement('div');
      info.innerHTML = `<h4>${title} (${lvl}/${uCfg.maxLevel})</h4><p>${desc}</p>`;

      const buyBtn = document.createElement('button');
      buyBtn.className = `btn ${upgrades.canAfford(id) ? 'btn-success' : ''}`;
      buyBtn.disabled = !upgrades.canAfford(id);
      buyBtn.textContent = maxed ? this.t('maxLevel') : `${this.t('buyBtn')} $${cost}`;
      buyBtn.onclick = () => {
        if (upgrades.buy(id)) {
          sound.playUpgradeBuy();
          this.openShopModal();
        }
      };

      item.append(info, buyBtn);
      list.appendChild(item);
    }

    card.append(header, list);
    this.shopModalEl.appendChild(card);
    this.shopModalEl.classList.add('open');
  }

  public openLevelsModal(): void {
    this.levelsModalEl.innerHTML = '';
    const lang = saveService.data.settings.language;

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '760px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h2 class="modal-title">🌍 ${this.t('levelsTitle')} • LVL ${saveService.data.playerLevel}</h2>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = `✕ ${this.t('closeBtn')}`;
    closeBtn.onclick = () => this.levelsModalEl.classList.remove('open');
    header.appendChild(closeBtn);

    const list = document.createElement('div');
    list.className = 'grid-list';

    LEVELS.forEach((lvl, idx) => {
      const unlockedByPlayerLevel = saveService.data.playerLevel >= lvl.requiredPlayerLevel;
      const unlockedByDamage = saveService.data.totalLifetimeDamage >= lvl.unlockDamage;
      const isUnlocked =
        saveService.data.unlockedLevels.includes(idx) ||
        unlockedByPlayerLevel ||
        unlockedByDamage;

      if (isUnlocked && !saveService.data.unlockedLevels.includes(idx)) {
        saveService.data.unlockedLevels.push(idx);
      }

      const isSelected = saveService.data.selectedLevel === idx;
      const item = document.createElement('div');
      item.className = 'item-card';

      const name = lang === 'ru' ? lvl.nameRu : lvl.nameEn;
      const desc = lang === 'ru' ? lvl.descRu : lvl.descEn;

      const info = document.createElement('div');
      info.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <h4>${name}</h4>
          <span style="font-size:11px; font-weight:800; padding:2px 8px; border-radius:99px; background:rgba(56,189,248,0.2); color:#38bdf8;">
            LVL ${lvl.requiredPlayerLevel}+
          </span>
        </div>
        <p>${desc}</p>
      `;

      const actionBtn = document.createElement('button');
      if (isSelected) {
        actionBtn.className = 'btn btn-success';
        actionBtn.textContent = `✓ ${this.t('selectedLbl')}`;
      } else if (isUnlocked) {
        actionBtn.className = 'btn btn-primary';
        actionBtn.textContent = this.t('selectBtn');
        actionBtn.onclick = () => {
          this.levelsModalEl.classList.remove('open');
          this.callbacks.onSelectLevel(idx);
        };
      } else {
        const canBuy = saveService.data.cash >= lvl.unlockCash;
        actionBtn.className = `btn ${canBuy ? 'btn-reward' : ''}`;
        actionBtn.disabled = !canBuy;
        actionBtn.textContent = `🔒 ${this.t('reqLevelLbl')} ${lvl.requiredPlayerLevel} (${this.t('orCashLbl')} $${lvl.unlockCash})`;
        actionBtn.onclick = () => {
          if (saveService.data.cash >= lvl.unlockCash) {
            saveService.data.cash -= lvl.unlockCash;
            saveService.data.unlockedLevels.push(idx);
            sound.playUpgradeBuy();
            events.emit('cashUpdated', { cash: saveService.data.cash, delta: -lvl.unlockCash });
            void saveService.save();
            this.levelsModalEl.classList.remove('open');
            this.callbacks.onSelectLevel(idx);
          }
        };
      }

      item.append(info, actionBtn);
      list.appendChild(item);
    });

    card.append(header, list);
    this.levelsModalEl.appendChild(card);
    this.levelsModalEl.classList.add('open');
  }

  public openSettingsModal(): void {
    this.settingsModalEl.innerHTML = '';
    const s = saveService.data.settings;

    const card = document.createElement('div');
    card.className = 'modal-card';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h2 class="modal-title">⚙️ ${this.t('settingsTitle')}</h2>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn';
    closeBtn.textContent = `✕ ${this.t('closeBtn')}`;
    closeBtn.onclick = () => this.settingsModalEl.classList.remove('open');
    header.appendChild(closeBtn);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    const makeToggleRow = (label: string, btnText: string, onClick: () => void) => {
      const row = document.createElement('div');
      row.className = 'item-card';
      row.style.cssText = 'flex-direction: row; align-items: center; justify-content: space-between;';
      const lbl = document.createElement('h4');
      lbl.textContent = label;
      const b = document.createElement('button');
      b.className = 'btn btn-primary';
      b.textContent = btnText;
      b.onclick = onClick;
      row.append(lbl, b);
      list.appendChild(row);
    };

    const qualities: QualityPreset[] = ['low', 'medium', 'high'];
    makeToggleRow(this.t('qualityLbl'), s.quality.toUpperCase(), () => {
      const next = qualities[(qualities.indexOf(s.quality) + 1) % qualities.length];
      s.quality = next;
      void saveService.save();
      this.callbacks.onApplySettings();
      this.openSettingsModal();
    });

    makeToggleRow(this.t('soundLbl'), s.sound ? this.t('on') : this.t('off'), () => {
      s.sound = !s.sound;
      void saveService.save();
      this.callbacks.onApplySettings();
      this.openSettingsModal();
    });

    makeToggleRow(this.t('vibrationLbl'), s.vibration ? this.t('on') : this.t('off'), () => {
      s.vibration = !s.vibration;
      void saveService.save();
      this.openSettingsModal();
    });

    makeToggleRow(
      this.t('langLbl'),
      s.language === 'en' ? 'ENGLISH (EN)' : 'РУССКИЙ (RU)',
      () => {
        s.language = s.language === 'ru' ? 'en' : 'ru';
        s.languageChosenByUser = true;
        void saveService.save();
        this.buildHUD();
        this.openSettingsModal();
      }
    );

    card.append(header, list);
    this.settingsModalEl.appendChild(card);
    this.settingsModalEl.classList.add('open');
  }
}
