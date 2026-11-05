export type GravityDir = 'down' | 'up' | 'left' | 'right' | 'forward' | 'back';

export type BoneId =
  | 'skull'
  | 'mandible'
  | 'cervical'
  | 'clavicleL'
  | 'clavicleR'
  | 'sternum'
  | 'ribsL'
  | 'ribsR'
  | 'thoracic'
  | 'lumbar'
  | 'pelvisL'
  | 'pelvisR'
  | 'sacrum'
  | 'humerusL'
  | 'humerusR'
  | 'radiusL'
  | 'ulnaL'
  | 'radiusR'
  | 'ulnaR'
  | 'handL'
  | 'handR'
  | 'femurL'
  | 'femurR'
  | 'patellaL'
  | 'patellaR'
  | 'tibiaL'
  | 'tibiaR'
  | 'footL'
  | 'footR';

export type BodyPartId =
  | 'head'
  | 'torso'
  | 'pelvis'
  | 'upperArmL'
  | 'upperArmR'
  | 'lowerArmL'
  | 'lowerArmR'
  | 'upperLegL'
  | 'upperLegR'
  | 'lowerLegL'
  | 'lowerLegR';

export type SurfaceMaterialId =
  | 'concrete'
  | 'metal'
  | 'spikes'
  | 'rubber'
  | 'glass'
  | 'boost'
  | 'grass'
  | 'water';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface BoneConfig {
  id: BoneId;
  bodyPart: BodyPartId;
  nameRu: string;
  nameEn: string;
  maxHealth: number;
  fragility: number;
  breakBonusCash: number;
  hudPos: { x: number; y: number; w: number; h: number };
}

export interface SurfaceMaterialConfig {
  id: SurfaceMaterialId;
  nameRu: string;
  nameEn: string;
  damageMultiplier: number;
  restitution: number;
  friction: number;
  color: number;
  emissive?: number;
  breakable?: boolean;
}

export type UpgradeId =
  | 'launchPower'
  | 'gravityStrength'
  | 'flipCooldown'
  | 'flipCharges'
  | 'boneValue'
  | 'bounce'
  | 'mass';

export interface UpgradeConfig {
  id: UpgradeId;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  baseCost: number;
  costMultiplier: number;
  maxLevel: number;
  baseValue: number;
  stepValue: number;
}

export const CONFIG = {
  PHYSICS: {
    FIXED_TIMESTEP: 1 / 60,
    MAX_SUBSTEPS: 3,
    SOLVER_ITERATIONS: 12,
    BASE_GRAVITY: 21.0,
    GRAVITY_LERP_DURATION: 0.15,
    LINEAR_DAMPING: 0.14,
    ANGULAR_DAMPING: 0.34,
    COLLISION_GROUP_ENV: 0x00010002,
    COLLISION_GROUP_RAGDOLL: 0x00020001,
  },

  RAGDOLL: {
    SPAWN_HEIGHT_OFFSET: 1.15,
    WALK_ACCELERATION: 14.0,
    MAX_WALK_SPEED: 10.5,
    JUMP_UP_SPEED: 4.2,
    JUMP_FORWARD_BOOST: 6.5,
    AIR_STEER_ACCEL: 10.0,
    BASE_LAUNCH_SPEED_FORWARD: 9.5,
    BASE_LAUNCH_SPEED_UP: 3.6,
    INITIAL_ANGULAR_IMPULSE: 2.2,
    BASE_RESTITUTION: 0.12,
    BASE_FRICTION: 0.24,
    PARTS: {
      head: { halfHeight: 0.10, radius: 0.13, mass: 5.0, color: 0xfacc15 },
      torso: { halfHeight: 0.22, radius: 0.16, mass: 26.0, color: 0xf97316 },
      pelvis: { halfHeight: 0.08, radius: 0.15, mass: 14.0, color: 0x1e293b },
      upperArmL: { halfHeight: 0.13, radius: 0.065, mass: 3.5, color: 0xfacc15 },
      upperArmR: { halfHeight: 0.13, radius: 0.065, mass: 3.5, color: 0xfacc15 },
      lowerArmL: { halfHeight: 0.13, radius: 0.055, mass: 2.5, color: 0xf97316 },
      lowerArmR: { halfHeight: 0.13, radius: 0.055, mass: 2.5, color: 0xf97316 },
      upperLegL: { halfHeight: 0.17, radius: 0.085, mass: 8.5, color: 0x2563eb },
      upperLegR: { halfHeight: 0.17, radius: 0.085, mass: 8.5, color: 0x2563eb },
      lowerLegL: { halfHeight: 0.17, radius: 0.070, mass: 5.0, color: 0x1e3a8a },
      lowerLegR: { halfHeight: 0.17, radius: 0.070, mass: 5.0, color: 0x1e3a8a },
    },
  },

  GRAVITY: {
    BASE_COOLDOWN: 0.55,
    BASE_MAX_CHARGES: 4,
    CHARGE_REGEN_RATE: 0.95,
    SLAM_WINDOW_SEC: 0.55,
    SLAM_DAMAGE_MULTIPLIER: 1.5,
    IMPULSE_ON_FLIP: 3.5,
    COLORS: {
      down: { hex: '#3b82f6', num: 0x3b82f6, icon: '▼', labelRu: 'НЫРОК', labelEn: 'DIVE' },
      up: { hex: '#ef4444', num: 0xef4444, icon: '▲', labelRu: 'ПОДБРОС', labelEn: 'HOP' },
      left: { hex: '#22c55e', num: 0x22c55e, icon: '◀', labelRu: 'ВЛЕВО', labelEn: 'LEFT' },
      right: { hex: '#eab308', num: 0xeab308, icon: '▶', labelRu: 'ВПРАВО', labelEn: 'RIGHT' },
      forward: { hex: '#a855f7', num: 0xa855f7, icon: '◆', labelRu: 'ВПЕРЁД', labelEn: 'FORWARD' },
      back: { hex: '#ec4899', num: 0xec4899, icon: '◈', labelRu: 'ТОРМОЗ', labelEn: 'BRAKE' },
    },
  },

  PROGRESSION: {
    BASE_XP_PER_LEVEL: 600,
    XP_LEVEL_GROWTH: 1.14,
    XP_PER_DAMAGE: 0.04,
    XP_PER_BROKEN_BONE: 8,
    XP_PER_DISLOCATION: 3,
    XP_PER_FALL_METER: 0.05,
    LEVEL_UP_CASH_REWARD_BASE: 30,
  },

  DAMAGE: {
    MIN_NORMAL_SPEED: 2.2,
    MIN_IMPACT: 15.0,
    IMPACT_TO_DAMAGE_SCALE: 0.11,
    SURFACE_COOLDOWN_SEC: 0.14,
    COMBO_WINDOW_SEC: 1.2,
    COMBO_STEP: 0.25,
    MAX_COMBO_MULTIPLIER: 5.0,
    CASH_PER_DAMAGE: 0.06,
    LIGAMENT_BONUS_CASH: 5,
    SPRAIN_HEALTH_RATIO: 0.55,
    DISLOCATE_HEALTH_RATIO: 0.22,
    BROKEN_JOINT_LIMIT_MULTIPLIER: 1.45,
    HIT_STOP_THRESHOLD_DAMAGE: 55,
    HIT_STOP_DURATION_SEC: 0.045,
  },

  ROUND: {
    MAX_DURATION_SEC: 180.0,
    IDLE_SPEED_THRESHOLD: 1.8,
    IDLE_TIME_TO_END_SEC: 1.4,
    MIN_ROUND_TIME_BEFORE_IDLE_SEC: 1.5,
  },

  CAMERA: {
    DISTANCE: 19.5,
    HEIGHT_OFFSET: 11.5,
    FOLLOW_LERP: 9.0,
    UP_SLERP_SPEED: 4.5,
    LOOK_AHEAD_FACTOR: 0.16,
    MIN_WALL_DISTANCE: 2.0,
    SHAKE_DECAY: 6.5,
    MAX_SHAKE_INTENSITY: 0.75,
  },

  ADS: {
    MIN_JUMPS_PER_INTERSTITIAL: 2,
    MAX_JUMPS_PER_INTERSTITIAL: 3,
    INTERSTITIAL_COOLDOWN_SEC: 3,
    REWARDED_EXTRA_FLIPS: 3,
    DAILY_BONUS_BASE_CASH: 100,
    DAILY_BONUS_COOLDOWN_MS: 20 * 60 * 60 * 1000,
  },

  PERFORMANCE: {
    MAX_PIXEL_RATIO: 2,
    LOW_FPS_THRESHOLD: 38,
    FPS_SAMPLE_WINDOW_SEC: 2.5,
    PARTICLE_POOL_SIZE: 140,
    FLOATING_TEXT_POOL_SIZE: 28,
  },

  MATERIALS: {
    concrete: {
      id: 'concrete',
      nameRu: 'Скальная порода',
      nameEn: 'Bedrock',
      damageMultiplier: 1.0,
      restitution: 0.12,
      friction: 0.24,
      color: 0x64748b,
    },
    metal: {
      id: 'metal',
      nameRu: 'Твёрдый валун',
      nameEn: 'Granite Boulder',
      damageMultiplier: 1.45,
      restitution: 0.16,
      friction: 0.22,
      color: 0x475569,
    },
    spikes: {
      id: 'spikes',
      nameRu: 'Острый кристалл',
      nameEn: 'Hazard Crystal',
      damageMultiplier: 2.1,
      restitution: 0.15,
      friction: 0.25,
      color: 0xdc2626,
      emissive: 0x450a0a,
    },
    rubber: {
      id: 'rubber',
      nameRu: 'Упругий гейзер',
      nameEn: 'Bounce Geyser',
      damageMultiplier: 0.5,
      restitution: 0.62,
      friction: 0.22,
      color: 0x16a34a,
    },
    glass: {
      id: 'glass',
      nameRu: 'Хрупкий кристалл/лёд',
      nameEn: 'Shatter Shelf',
      damageMultiplier: 1.55,
      restitution: 0.12,
      friction: 0.15,
      color: 0xbae6fd,
      breakable: true,
    },
    boost: {
      id: 'boost',
      nameRu: 'Ускоритель',
      nameEn: 'Speed Ramp',
      damageMultiplier: 1.5,
      restitution: 0.68,
      friction: 0.15,
      color: 0x9333ea,
      emissive: 0x3b0764,
    },
    grass: {
      id: 'grass',
      nameRu: 'Дно долины',
      nameEn: 'Valley Floor',
      damageMultiplier: 0.55,
      restitution: 0.08,
      friction: 0.32,
      color: 0x22c55e,
    },
    water: {
      id: 'water',
      nameRu: 'Бассейн / Лагуна',
      nameEn: 'Basin Pool',
      damageMultiplier: 0.15,
      restitution: 0.02,
      friction: 0.85,
      color: 0x0284c7,
    },
  } as Record<SurfaceMaterialId, SurfaceMaterialConfig>,

  BONES: [
    // Head & Neck (3)
    { id: 'skull', bodyPart: 'head', nameRu: 'Череп', nameEn: 'Cranium', maxHealth: 52, fragility: 1.45, breakBonusCash: 16, hudPos: { x: 39, y: 4, w: 22, h: 13 } },
    { id: 'mandible', bodyPart: 'head', nameRu: 'Нижняя челюсть', nameEn: 'Mandible (Jaw)', maxHealth: 38, fragility: 1.55, breakBonusCash: 12, hudPos: { x: 42, y: 18, w: 16, h: 6 } },
    { id: 'cervical', bodyPart: 'head', nameRu: 'Шейные позвонки', nameEn: 'Cervical Spine', maxHealth: 42, fragility: 1.6, breakBonusCash: 18, hudPos: { x: 46, y: 25, w: 8, h: 7 } },

    // Torso / Chest / Spine (7)
    { id: 'clavicleL', bodyPart: 'torso', nameRu: 'Левая ключица', nameEn: 'L. Clavicle', maxHealth: 36, fragility: 1.45, breakBonusCash: 10, hudPos: { x: 27, y: 33, w: 18, h: 5 } },
    { id: 'clavicleR', bodyPart: 'torso', nameRu: 'Правая ключица', nameEn: 'R. Clavicle', maxHealth: 36, fragility: 1.45, breakBonusCash: 10, hudPos: { x: 55, y: 33, w: 18, h: 5 } },
    { id: 'sternum', bodyPart: 'torso', nameRu: 'Грудина', nameEn: 'Sternum', maxHealth: 48, fragility: 1.3, breakBonusCash: 12, hudPos: { x: 46, y: 39, w: 8, h: 15 } },
    { id: 'ribsL', bodyPart: 'torso', nameRu: 'Левые рёбра', nameEn: 'L. Ribcage', maxHealth: 54, fragility: 1.35, breakBonusCash: 12, hudPos: { x: 31, y: 40, w: 14, h: 20 } },
    { id: 'ribsR', bodyPart: 'torso', nameRu: 'Правые рёбра', nameEn: 'R. Ribcage', maxHealth: 54, fragility: 1.35, breakBonusCash: 12, hudPos: { x: 55, y: 40, w: 14, h: 20 } },
    { id: 'thoracic', bodyPart: 'torso', nameRu: 'Грудной позвоночник', nameEn: 'Thoracic Spine', maxHealth: 62, fragility: 1.25, breakBonusCash: 15, hudPos: { x: 46, y: 55, w: 8, h: 11 } },
    { id: 'lumbar', bodyPart: 'torso', nameRu: 'Поясничный отдел', nameEn: 'Lumbar Spine', maxHealth: 64, fragility: 1.25, breakBonusCash: 16, hudPos: { x: 46, y: 67, w: 8, h: 10 } },

    // Pelvis (3)
    { id: 'pelvisL', bodyPart: 'pelvis', nameRu: 'Левая тазовая кость', nameEn: 'L. Pelvis (Ilium)', maxHealth: 58, fragility: 1.2, breakBonusCash: 13, hudPos: { x: 33, y: 78, w: 12, h: 13 } },
    { id: 'pelvisR', bodyPart: 'pelvis', nameRu: 'Правая тазовая кость', nameEn: 'R. Pelvis (Ilium)', maxHealth: 58, fragility: 1.2, breakBonusCash: 13, hudPos: { x: 55, y: 78, w: 12, h: 13 } },
    { id: 'sacrum', bodyPart: 'pelvis', nameRu: 'Крестец и копчик', nameEn: 'Sacrum & Coccyx', maxHealth: 52, fragility: 1.3, breakBonusCash: 14, hudPos: { x: 46, y: 79, w: 8, h: 11 } },

    // Upper Arms (2)
    { id: 'humerusL', bodyPart: 'upperArmL', nameRu: 'Левое плечо', nameEn: 'L. Humerus', maxHealth: 40, fragility: 1.35, breakBonusCash: 9, hudPos: { x: 17, y: 38, w: 9, h: 22 } },
    { id: 'humerusR', bodyPart: 'upperArmR', nameRu: 'Правое плечо', nameEn: 'R. Humerus', maxHealth: 40, fragility: 1.35, breakBonusCash: 9, hudPos: { x: 74, y: 38, w: 9, h: 22 } },

    // Forearms & Hands (6)
    { id: 'radiusL', bodyPart: 'lowerArmL', nameRu: 'Левая лучевая кость', nameEn: 'L. Radius', maxHealth: 32, fragility: 1.5, breakBonusCash: 8, hudPos: { x: 11, y: 62, w: 5, h: 20 } },
    { id: 'ulnaL', bodyPart: 'lowerArmL', nameRu: 'Левая локтевая кость', nameEn: 'L. Ulna', maxHealth: 32, fragility: 1.5, breakBonusCash: 8, hudPos: { x: 17, y: 62, w: 5, h: 20 } },
    { id: 'radiusR', bodyPart: 'lowerArmR', nameRu: 'Правая лучевая кость', nameEn: 'R. Radius', maxHealth: 32, fragility: 1.5, breakBonusCash: 8, hudPos: { x: 84, y: 62, w: 5, h: 20 } },
    { id: 'ulnaR', bodyPart: 'lowerArmR', nameRu: 'Правая локтевая кость', nameEn: 'R. Ulna', maxHealth: 32, fragility: 1.5, breakBonusCash: 8, hudPos: { x: 78, y: 62, w: 5, h: 20 } },
    { id: 'handL', bodyPart: 'lowerArmL', nameRu: 'Левая кисть и пальцы', nameEn: 'L. Hand & Fingers', maxHealth: 26, fragility: 1.65, breakBonusCash: 7, hudPos: { x: 11, y: 84, w: 11, h: 9 } },
    { id: 'handR', bodyPart: 'lowerArmR', nameRu: 'Правая кисть и пальцы', nameEn: 'R. Hand & Fingers', maxHealth: 26, fragility: 1.65, breakBonusCash: 7, hudPos: { x: 78, y: 84, w: 11, h: 9 } },

    // Thighs & Kneecaps (4)
    { id: 'femurL', bodyPart: 'upperLegL', nameRu: 'Левое бедро', nameEn: 'L. Femur', maxHealth: 62, fragility: 1.2, breakBonusCash: 12, hudPos: { x: 34, y: 93, w: 11, h: 27 } },
    { id: 'femurR', bodyPart: 'upperLegR', nameRu: 'Правое бедро', nameEn: 'R. Femur', maxHealth: 62, fragility: 1.2, breakBonusCash: 12, hudPos: { x: 55, y: 93, w: 11, h: 27 } },
    { id: 'patellaL', bodyPart: 'upperLegL', nameRu: 'Левая коленная чашечка', nameEn: 'L. Kneecap (Patella)', maxHealth: 34, fragility: 1.5, breakBonusCash: 9, hudPos: { x: 35, y: 122, w: 9, h: 7 } },
    { id: 'patellaR', bodyPart: 'upperLegR', nameRu: 'Правая коленная чашечка', nameEn: 'R. Kneecap (Patella)', maxHealth: 34, fragility: 1.5, breakBonusCash: 9, hudPos: { x: 56, y: 122, w: 9, h: 7 } },

    // Shins & Feet (4)
    { id: 'tibiaL', bodyPart: 'lowerLegL', nameRu: 'Левая голень', nameEn: 'L. Tibia & Fibula', maxHealth: 46, fragility: 1.4, breakBonusCash: 10, hudPos: { x: 34, y: 131, w: 10, h: 28 } },
    { id: 'tibiaR', bodyPart: 'lowerLegR', nameRu: 'Правая голень', nameEn: 'R. Tibia & Fibula', maxHealth: 46, fragility: 1.4, breakBonusCash: 10, hudPos: { x: 56, y: 131, w: 10, h: 28 } },
    { id: 'footL', bodyPart: 'lowerLegL', nameRu: 'Левая стопа и лодыжка', nameEn: 'L. Foot & Ankle', maxHealth: 30, fragility: 1.6, breakBonusCash: 8, hudPos: { x: 31, y: 161, w: 13, h: 9 } },
    { id: 'footR', bodyPart: 'lowerLegR', nameRu: 'Правая стопа и лодыжка', nameEn: 'R. Foot & Ankle', maxHealth: 30, fragility: 1.6, breakBonusCash: 8, hudPos: { x: 56, y: 161, w: 13, h: 9 } },
  ] as BoneConfig[],

  UPGRADES: [
    {
      id: 'boneValue',
      nameRu: 'Ценность костей',
      nameEn: 'Bone Value',
      descRu: '+25% денег за каждый перелом, вывих и урон',
      descEn: '+25% Cash payout per fracture, dislocation & damage',
      baseCost: 50,
      costMultiplier: 1.35,
      maxLevel: 15,
      baseValue: 1.0,
      stepValue: 0.25,
    },
    {
      id: 'launchPower',
      nameRu: 'Разбег и прыжок',
      nameEn: 'Jump & Dive Speed',
      descRu: '+18% к скорости прыжка со скалы и управлению в воздухе',
      descEn: '+18% cliff dive launch speed & mid-air control',
      baseCost: 60,
      costMultiplier: 1.35,
      maxLevel: 15,
      baseValue: 1.0,
      stepValue: 0.18,
    },
    {
      id: 'bounce',
      nameRu: 'Упругость тела',
      nameEn: 'Body Elasticity',
      descRu: '+15% к силе рикошета от скал и камней',
      descEn: '+15% bounce off jagged cliff rocks',
      baseCost: 70,
      costMultiplier: 1.35,
      maxLevel: 12,
      baseValue: 1.0,
      stepValue: 0.15,
    },
    {
      id: 'gravityStrength',
      nameRu: 'Тяжесть падения',
      nameEn: 'Gravity Pull (G)',
      descRu: '+15% к ускорению падения и силе ударов о скалы',
      descEn: '+15% downward acceleration & impact force',
      baseCost: 85,
      costMultiplier: 1.35,
      maxLevel: 12,
      baseValue: 1.0,
      stepValue: 0.15,
    },
    {
      id: 'mass',
      nameRu: 'Вес каскадёра',
      nameEn: 'Stuntman Weight',
      descRu: '+18% массы тела (сокрушительные удары о камни)',
      descEn: '+18% body mass for heavier bone-crushing impacts',
      baseCost: 95,
      costMultiplier: 1.35,
      maxLevel: 12,
      baseValue: 1.0,
      stepValue: 0.18,
    },
    {
      id: 'flipCooldown',
      nameRu: 'Быстрый манёвр',
      nameEn: 'Thruster Rate',
      descRu: '-10% перезарядки рывка траектории в полёте',
      descEn: '-10% cooldown on mid-air trajectory nudges',
      baseCost: 100,
      costMultiplier: 1.35,
      maxLevel: 10,
      baseValue: 1.0,
      stepValue: -0.08,
    },
    {
      id: 'flipCharges',
      nameRu: 'Заряды манёвра',
      nameEn: 'Nudge Charges',
      descRu: '+1 заряд корректировки траектории в воздухе',
      descEn: '+1 max trajectory nudge charge in flight',
      baseCost: 130,
      costMultiplier: 1.35,
      maxLevel: 10,
      baseValue: 0,
      stepValue: 1,
    },
  ] as UpgradeConfig[],
};
