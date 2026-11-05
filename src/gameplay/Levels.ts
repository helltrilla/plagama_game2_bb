import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG, type GravityDir, type SurfaceMaterialId } from '../config';
import type { PhysicsWorld } from '../physics/World';

export type ObstacleShape = 'box' | 'cylinder' | 'wedge';

export type BiomePropType =
  | 'pine'
  | 'cactus'
  | 'stalactite'
  | 'mushroom'
  | 'palm'
  | 'ruinPillar'
  | 'neonTower'
  | 'crystalSpire';

export interface ObstacleDef {
  shape: ObstacleShape;
  pos: [number, number, number];
  size: [number, number, number];
  rot?: [number, number, number];
  material: SurfaceMaterialId;
  isSlopeBase?: boolean;
  isFlatPlatform?: boolean;
  isColliderOnly?: boolean;
}

export interface GravityZoneDef {
  pos: [number, number, number];
  size: [number, number, number];
  forceDir: GravityDir;
}

export interface TreeDecoDef {
  pos: [number, number, number];
  scale: number;
}

export interface PeakDecoDef {
  pos: [number, number, number];
  radius: number;
  height: number;
  snowLineRatio: number;
}

export interface CloudDecoDef {
  pos: [number, number, number];
  scale: [number, number, number];
}

export interface FunnelGeoParams {
  H: number;
  topRadius: number;
  bottomRadius: number;
  outerDepth: number;
  rings: number;
  seed: number;
}

export interface LevelDef {
  id: string;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  requiredPlayerLevel: number;
  unlockCash: number;
  unlockDamage: number;
  spawnPos: [number, number, number];
  boundsHalfWidth: number;
  sunElevation: number;
  sunAzimuth: number;
  turbidity: number;
  fogColor: number;
  cliffColor: number;
  snowColor: number;
  valleyColor: number;
  waterColor: number;
  propType: BiomePropType;
  propPrimaryColor: number;
  propSecondaryColor: number;
  hasCaveCeiling?: boolean;
  funnelGeoParams?: FunnelGeoParams;
  obstacles: ObstacleDef[];
  trees: TreeDecoDef[];
  distantPeaks: PeakDecoDef[];
  clouds: CloudDecoDef[];
  gravityZones?: GravityZoneDef[];
}

function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;

  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;

  return nxy0 + (nxy1 - nxy0) * uz - 0.5;
}

function fbm3(x: number, y: number, z: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < 3; i++) {
    v += smoothNoise3(x * freq, y * freq, z * freq) * amp;
    freq *= 2.05;
    amp *= 0.5;
  }
  return v;
}

function evalFunnelPoint(
  t: number,
  theta: number,
  H: number,
  topRadius: number,
  bottomRadius: number,
  seed: number
): { r: number; y: number } {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const baseY = H * (1 - clampedT);
  const baseR =
    bottomRadius + (topRadius - bottomRadius) * Math.pow(Math.max(0, 1 - clampedT), 0.94);

  // Smoothly taper relief to 0 at the top rim (t = 0) and bottom lake (t = 1) so the launch terrace & lake stay 100% flush
  const rimFade =
    THREE.MathUtils.smoothstep(clampedT, 0.0, 0.08) *
    THREE.MathUtils.smoothstep(1 - clampedT, 0.0, 0.08);
  const envelope = Math.sin(Math.PI * clampedT) * rimFade;

  // Periodic in theta (0 and 2*PI match 100% seamlessly)
  const c1 = Math.cos(theta);
  const s1 = Math.sin(theta);
  const gullies =
    Math.sin(theta * 6 + seed * 0.13) * 0.42 +
    Math.cos(theta * 11 - clampedT * 5.0 + seed * 0.27) * 0.32;
  const terraces = Math.sin(clampedT * Math.PI * 9 + Math.sin(theta * 3) * 0.7) * 0.35;
  const noise = fbm3(c1 * 3.2 + seed * 0.05, clampedT * 7.5, s1 * 3.2 - seed * 0.05) * 1.4;

  const amp = Math.min(13.5, H * 0.024) * envelope;
  const disp = (gullies + terraces + noise) * amp;

  return {
    r: Math.max(8, baseR + disp * 0.85),
    y: baseY + disp * 0.65,
  };
}

function createSculptedRockGeometry(
  hx: number,
  hy: number,
  hz: number,
  segX: number,
  segY: number,
  segZ: number,
  _baseHex: number,
  _topCapHex: number,
  roughAmp: number
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2, segX, segY, segZ);
  if (roughAmp > 0.001) {
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const disp = fbm3(vx * 0.8, vy * 0.8, vz * 0.8) * roughAmp;
      posAttr.setXYZ(
        i,
        vx + (vx / Math.max(0.1, hx)) * disp * 0.35,
        vy + (vy / Math.max(0.1, hy)) * disp * 0.25,
        vz + (vz / Math.max(0.1, hz)) * disp * 0.35
      );
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function createSculptedBoulderGeometry(
  sx: number,
  sy: number,
  sz: number,
  detail: number,
  _baseHex: number,
  _accentHex: number
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1.0, detail);
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const ux = posAttr.getX(i);
    const uy = posAttr.getY(i);
    const uz = posAttr.getZ(i);

    const n = fbm3(ux * 1.4, uy * 1.4, uz * 1.4);
    const r = 1.0 + n * 0.28;

    posAttr.setXYZ(i, ux * sx * r, uy * sy * r, uz * sz * r);
  }

  geo.computeVertexNormals();
  return geo;
}

function buildMountainLevel(params: {
  id: string;
  nameRu: string;
  nameEn: string;
  descRu: string;
  descEn: string;
  requiredPlayerLevel: number;
  unlockCash: number;
  unlockDamage: number;
  height: number;
  width?: number;
  segments?: number;
  slopeAngleDeg: number;
  seed: number;
  sunElevation: number;
  sunAzimuth: number;
  turbidity: number;
  fogColor: number;
  cliffColor: number;
  snowColor: number;
  valleyColor?: number;
  waterColor?: number;
  propType?: BiomePropType;
  propPrimaryColor?: number;
  propSecondaryColor?: number;
  hasCaveCeiling?: boolean;
  rockCount: number;
  spikeRatio: number;
  iceRatio: number;
  bounceRatio: number;
  gravityZones?: GravityZoneDef[];
}): LevelDef {
  const obstacles: ObstacleDef[] = [];
  const trees: TreeDecoDef[] = [];
  const distantPeaks: PeakDecoDef[] = [];
  const clouds: CloudDecoDef[] = [];

  // Shallower funnel slope angle (25°–33°) so the player slides, bounces & tumbles along the relieved funnel wall
  const H = params.height * 2.15;
  const shallowAngleDeg = THREE.MathUtils.clamp(params.slopeAngleDeg * 0.62, 24, 33);
  const pitchTan = Math.tan((shallowAngleDeg * Math.PI) / 180);
  const bottomRadius = Math.max(60, H * 0.16);
  const topRadius = bottomRadius + H / pitchTan;
  const rings = Math.max(14, params.segments ?? 14);
  const numSectors = 16;

  // Funnel central vertical axis is at (cx = 0, cz = -topRadius) so the South Rim is right at (0, H, 0)!
  const cx = 0;
  const cz = -topRadius;

  let s = params.seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  // 1. Flat, Level South Rim Summit Launch Terrace + 5 Diving Boards pointing into the Funnel
  obstacles.push({
    shape: 'box',
    pos: [0, H - 2.0, 5.5],
    size: [78, 2.0, 11.5],
    material: 'concrete',
    isSlopeBase: true,
    isFlatPlatform: true,
  });
  for (const boardX of [-52, -26, 0, 26, 52]) {
    obstacles.push({
      shape: 'box',
      pos: [boardX, H - 0.45, -5.8],
      size: [4.2, 0.4, 5.0],
      rot: [-6, 0, 0],
      material: 'boost',
      isFlatPlatform: true,
    });
  }

  // 2. Surrounding 360° Upper-World Terrain Props & Rock Mounds around the Funnel Rim
  const outerDepth = 540;
  for (let sec = 0; sec < numSectors; sec++) {
    const theta = (sec / numSectors) * Math.PI * 2;

    // Smooth sculpted rock mounds on the surrounding upper plateau
    for (let h = 0; h < 3; h++) {
      const hAngle = theta + ((rand() - 0.5) * Math.PI * 1.8) / numSectors;
      const hDist = topRadius + 45 + rand() * (outerDepth - 85);
      if (sec === 0 && hDist < topRadius + 105 && Math.abs(Math.sin(hAngle) * hDist) < 100) {
        continue; // Keep spawn terrace clear
      }
      const hx = cx + Math.sin(hAngle) * hDist;
      const hz = cz + Math.cos(hAngle) * hDist;
      const hsx = 14 + rand() * 24;
      const hsy = 6 + rand() * 12;
      const hsz = 14 + rand() * 24;
      obstacles.push({
        shape: 'box',
        pos: [hx, H + hsy * 0.25, hz],
        size: [hsx, hsy, hsz],
        rot: [0, rand() * 180, 0],
        material: 'concrete',
      });
    }

    // Lush biome props (trees/cacti/crystals/mushrooms/pillars) across the surrounding upper landscape
    for (let k = 0; k < 12; k++) {
      const tAngle = theta + ((rand() - 0.5) * Math.PI * 2) / numSectors;
      const tDist = topRadius + 22 + rand() * (outerDepth - 45);
      if (sec === 0 && tDist < topRadius + 65 && Math.abs(Math.sin(tAngle) * tDist) < 90) {
        continue;
      }
      trees.push({
        pos: [
          cx + Math.sin(tAngle) * tDist,
          H - 0.05,
          cz + Math.cos(tAngle) * tDist,
        ],
        scale: 1.8 + rand() * 3.0,
      });
    }
  }

  // 3. Obstacles, Boulders, Spikes & Props lining the 360° Funnel Surface (with exact 3D relief height/radius)
  for (let i = 0; i < rings; i++) {
    const t0 = i / rings;
    const t1 = (i + 1) / rings;
    const tMid = (t0 + t1) * 0.5;

    const p0 = evalFunnelPoint(t0, 0, H, topRadius, bottomRadius, params.seed);
    const p1 = evalFunnelPoint(t1, 0, H, topRadius, bottomRadius, params.seed);
    const dy = p0.y - p1.y;
    const dr = p0.r - p1.r;
    const pitchRad = Math.atan2(dy, dr);
    const basePitchDeg = -(pitchRad * 180) / Math.PI;

    for (let sec = 0; sec < numSectors; sec++) {
      const theta = (sec / numSectors) * Math.PI * 2;
      const isUnderSpawn = i === 0 && sec === 0;

      // Rocks, boulders, crystal spikes, shatter shelves & bounce geysers sitting directly on the relieved 360° funnel curve
      const isPrimaryDropZone = sec === 0 || sec === 1 || sec === numSectors - 1 || sec === numSectors / 2;
      const rocksInCell = isPrimaryDropZone ? 4 : 2;

      for (let r = 0; r < rocksInCell; r++) {
        const rt = (isUnderSpawn ? 0.32 : 0.12) + rand() * (isUnderSpawn ? 0.6 : 0.78);
        const globalT = (i + rt) / rings;
        const rAngle = theta + ((rand() - 0.5) * 1.75 * Math.PI) / numSectors;
        const surfPt = evalFunnelPoint(globalT, rAngle, H, topRadius, bottomRadius, params.seed);
        const ry = surfPt.y;
        const rr = surfPt.r;
        const rx = cx + Math.sin(rAngle) * rr;
        const rz = cz + Math.cos(rAngle) * rr;
        const rYaw = (rAngle * 180) / Math.PI;

        const roll = rand();
        let mat: SurfaceMaterialId = 'metal';
        if (roll < params.spikeRatio) {
          mat = 'spikes';
        } else if (roll < params.spikeRatio + params.iceRatio) {
          mat = 'glass';
        } else if (roll < params.spikeRatio + params.iceRatio + params.bounceRatio) {
          mat = 'rubber';
        } else if (rand() < 0.08) {
          mat = 'boost';
        } else if (rand() < 0.35) {
          mat = 'concrete';
        }

        const shapeRoll = rand();
        if (shapeRoll < 0.44) {
          const bsx = 2.8 + rand() * 6.0;
          const bsy = 2.0 + rand() * 4.2;
          const bsz = 2.8 + rand() * 5.8;
          obstacles.push({
            shape: 'box',
            pos: [rx, ry + bsy * 0.25, rz],
            size: [bsx, bsy, bsz],
            rot: [
              basePitchDeg + (rand() - 0.5) * 24,
              rYaw + (rand() - 0.5) * 40,
              (rand() - 0.5) * 24,
            ],
            material: mat,
          });
        } else if (shapeRoll < 0.76) {
          const wsx = 3.2 + rand() * 6.0;
          const wsy = 2.4 + rand() * 4.5;
          const wsz = 2.8 + rand() * 5.2;
          obstacles.push({
            shape: 'wedge',
            pos: [rx, ry + wsy * 0.25, rz],
            size: [wsx, wsy, wsz],
            rot: [
              basePitchDeg * 0.5 + (rand() - 0.5) * 20,
              rYaw + (rand() - 0.5) * 40,
              (rand() - 0.5) * 20,
            ],
            material: mat,
          });
        } else {
          const halfLen = 3.8 + rand() * 6.8;
          const rad = 1.5 + rand() * 2.5;
          obstacles.push({
            shape: 'cylinder',
            pos: [rx, ry + rad * 0.35, rz],
            size: [halfLen, rad, 0],
            rot: [
              (rand() - 0.5) * 25,
              rYaw + (rand() - 0.5) * 35,
              90 + (rand() - 0.5) * 25,
            ],
            material: mat,
          });
        }
      }

      // Trees / biome props growing on the relieved funnel ledges
      if (i % 2 === 0 && sec % 2 === 0 && !isUnderSpawn) {
        const pAngle = theta + ((rand() - 0.5) * Math.PI) / numSectors;
        const treePt = evalFunnelPoint(tMid, pAngle, H, topRadius, bottomRadius, params.seed);
        trees.push({
          pos: [
            cx + Math.sin(pAngle) * treePt.r,
            treePt.y,
            cz + Math.cos(pAngle) * treePt.r,
          ],
          scale: 1.4 + rand() * 2.2,
        });
      }
    }

    // Central funnel vortex hazards (floating monoliths / rock spires inside the funnel throat)
    if (i > 1 && i < rings - 1) {
      const spireAngle = rand() * Math.PI * 2;
      const midPt = evalFunnelPoint(tMid, spireAngle, H, topRadius, bottomRadius, params.seed);
      const spireDist = rand() * (midPt.r * 0.46);
      const spx = cx + Math.sin(spireAngle) * spireDist;
      const spz = cz + Math.cos(spireAngle) * spireDist;
      obstacles.push({
        shape: 'box',
        pos: [spx, midPt.y, spz],
        size: [5.5 + rand() * 8.0, 4.0 + rand() * 6.5, 5.5 + rand() * 8.0],
        rot: [(rand() - 0.5) * 22, rand() * 180, (rand() - 0.5) * 22],
        material: i % 3 === 0 ? 'spikes' : i % 2 === 0 ? 'rubber' : 'metal',
      });
    }
  }

  // 4. Rocks in the Deep Funnel Bottom Basin
  for (let b = 0; b < 24; b++) {
    const bAngle = (b / 24) * Math.PI * 2;
    const bDist = bottomRadius * (0.28 + rand() * 0.65);
    const bsy = 2.2 + rand() * 3.2;
    obstacles.push({
      shape: 'box',
      pos: [cx + Math.sin(bAngle) * bDist, 0.8 + bsy * 0.3, cz + Math.cos(bAngle) * bDist],
      size: [3.5 + rand() * 5.0, bsy, 3.5 + rand() * 5.0],
      rot: [(rand() - 0.5) * 20, rand() * 180, (rand() - 0.5) * 20],
      material: b % 3 === 0 ? 'spikes' : 'metal',
    });
  }

  // 5. 360° Panoramic Distant Mountain Range surrounding the entire Upper World around the Funnel
  for (let p = 0; p < 36; p++) {
    const angle = (p / 36) * Math.PI * 2;
    const dist = topRadius + outerDepth + 350 + rand() * 900;
    const px = cx + Math.sin(angle) * dist;
    const pz = cz + Math.cos(angle) * dist;
    const pHeight = 420 + rand() * 880;
    const pRad = 220 + rand() * 280;
    distantPeaks.push({
      pos: [px, H + pHeight * 0.36, pz],
      radius: pRad,
      height: pHeight,
      snowLineRatio: 0.48 + rand() * 0.24,
    });
  }

  // 6. Volumetric 3D Clouds floating above the giant funnel and surrounding landscape
  for (let c = 0; c < 64; c++) {
    const cAngle = rand() * Math.PI * 2;
    const cDist = rand() * (topRadius + outerDepth * 0.8);
    clouds.push({
      pos: [
        cx + Math.sin(cAngle) * cDist,
        H * (0.35 + rand() * 0.95),
        cz + Math.cos(cAngle) * cDist,
      ],
      scale: [28 + rand() * 52, 9 + rand() * 15, 24 + rand() * 46],
    });
  }

  return {
    id: params.id,
    nameRu: params.nameRu,
    nameEn: params.nameEn,
    descRu: params.descRu,
    descEn: params.descEn,
    requiredPlayerLevel: params.requiredPlayerLevel,
    unlockCash: params.unlockCash,
    unlockDamage: params.unlockDamage,
    spawnPos: [0, H, 4.0],
    boundsHalfWidth: topRadius + outerDepth,
    sunElevation: params.sunElevation,
    sunAzimuth: params.sunAzimuth,
    turbidity: params.turbidity,
    fogColor: params.fogColor,
    cliffColor: params.cliffColor,
    snowColor: params.snowColor,
    valleyColor: params.valleyColor ?? 0x16a34a,
    waterColor: params.waterColor ?? 0x0284c7,
    propType: params.propType ?? 'pine',
    propPrimaryColor: params.propPrimaryColor ?? 0x15803d,
    propSecondaryColor: params.propSecondaryColor ?? 0x5c2d0c,
    hasCaveCeiling: params.hasCaveCeiling,
    funnelGeoParams: {
      H,
      topRadius,
      bottomRadius,
      outerDepth,
      rings,
      seed: params.seed,
    },
    obstacles,
    trees,
    distantPeaks,
    clouds,
    gravityZones: params.gravityZones,
  };
}

export const LEVELS: LevelDef[] = [
  // Map 1 — Starter (Lvl 1)
  buildMountainLevel({
    id: 'pine_ridge',
    nameRu: '1. Сосновый Хребет (650м)',
    nameEn: '1. Pine Ridge Megacliff (650m)',
    descRu: 'Огромный альпийский горный массив со скальными уступами, густым сосновым лесом и озером.',
    descEn: 'Colossal alpine mountain massif with sculpted rock ledges, dense pine forest, and crystal lake.',
    requiredPlayerLevel: 1,
    unlockCash: 0,
    unlockDamage: 0,
    height: 145,
    width: 65,
    segments: 12,
    slopeAngleDeg: 46,
    seed: 101,
    sunElevation: 32,
    sunAzimuth: 145,
    turbidity: 2.2,
    fogColor: 0xbae6fd,
    cliffColor: 0x64748b,
    snowColor: 0x4d7c0f,
    propType: 'pine',
    propPrimaryColor: 0x15803d,
    propSecondaryColor: 0x5c2d0c,
    rockCount: 110,
    spikeRatio: 0.16,
    iceRatio: 0.08,
    bounceRatio: 0.12,
  }),

  // Map 2 — Lvl 2
  buildMountainLevel({
    id: 'razor_canyon',
    nameRu: '2. Гранд-Ущелье Скалистых Гор (800м)',
    nameEn: '2. Razor Crag Grand Canyon (800m)',
    descRu: 'Золотой закат над гигантским гранитным обрывом с острыми каменными зубьями.',
    descEn: 'Golden-hour sunset over a colossal granite drop packed with jagged stone teeth.',
    requiredPlayerLevel: 2,
    unlockCash: 300,
    unlockDamage: 2000,
    height: 175,
    width: 70,
    segments: 13,
    slopeAngleDeg: 50,
    seed: 207,
    sunElevation: 12,
    sunAzimuth: 162,
    turbidity: 4.8,
    fogColor: 0xfed7aa,
    cliffColor: 0x78716c,
    snowColor: 0xd97706,
    propType: 'pine',
    propPrimaryColor: 0x3f6212,
    propSecondaryColor: 0x451a03,
    rockCount: 125,
    spikeRatio: 0.25,
    iceRatio: 0.1,
    bounceRatio: 0.14,
  }),

  // Map 3 — Lvl 4
  buildMountainLevel({
    id: 'glacier_peak',
    nameRu: '3. Ледяной Гигант (1000м)',
    nameEn: '3. Glacier Titan Peak (1000m)',
    descRu: 'Километровый высокогорный ледник с прозрачными ледяными карнизами, которые раскалываются при ударе!',
    descEn: 'Kilometer-high alpine glacier with refractive ice shelves that shatter on impact!',
    requiredPlayerLevel: 4,
    unlockCash: 750,
    unlockDamage: 5500,
    height: 215,
    width: 75,
    segments: 14,
    slopeAngleDeg: 53,
    seed: 319,
    sunElevation: 26,
    sunAzimuth: 130,
    turbidity: 1.8,
    fogColor: 0xdbeafe,
    cliffColor: 0x475569,
    snowColor: 0xf8fafc,
    valleyColor: 0xe2e8f0,
    waterColor: 0x38bdf8,
    propType: 'crystalSpire',
    propPrimaryColor: 0x7dd3fc,
    propSecondaryColor: 0xe0f2fe,
    rockCount: 140,
    spikeRatio: 0.24,
    iceRatio: 0.36,
    bounceRatio: 0.12,
  }),

  // Map 4 — Lvl 6
  buildMountainLevel({
    id: 'volcano_gorge',
    nameRu: '4. Супервулкан Кракатау (1200м)',
    nameEn: '4. Krakatoa Supervolcano (1200m)',
    descRu: 'Багровое небо над гигантским базальтовым кратером со светящимися кристаллами и морем лавы.',
    descEn: 'Crimson sky over a massive basalt caldera covered in glowing ruby crystals and a magma sea.',
    requiredPlayerLevel: 6,
    unlockCash: 1600,
    unlockDamage: 12000,
    height: 260,
    width: 80,
    segments: 15,
    slopeAngleDeg: 55,
    seed: 443,
    sunElevation: 5,
    sunAzimuth: 175,
    turbidity: 8.5,
    fogColor: 0xfecaca,
    cliffColor: 0x27272a,
    snowColor: 0xdc2626,
    valleyColor: 0x18181b,
    waterColor: 0xea580c,
    propType: 'crystalSpire',
    propPrimaryColor: 0xef4444,
    propSecondaryColor: 0xf97316,
    rockCount: 155,
    spikeRatio: 0.42,
    iceRatio: 0.08,
    bounceRatio: 0.22,
  }),

  // Map 5 — Lvl 8
  buildMountainLevel({
    id: 'everest_abyss',
    nameRu: '5. Хребет Эвереста (1450м)',
    nameEn: '5. Everest Ridge Abyss (1450m)',
    descRu: 'Исполинская гималайская вершина в облаках со снежными лавинными уступами!',
    descEn: 'Colossal Himalayan summit above the clouds with towering snow-capped avalanche ledges!',
    requiredPlayerLevel: 8,
    unlockCash: 3000,
    unlockDamage: 24000,
    height: 315,
    width: 85,
    segments: 16,
    slopeAngleDeg: 57,
    seed: 587,
    sunElevation: 22,
    sunAzimuth: 140,
    turbidity: 2.0,
    fogColor: 0xe0e7ff,
    cliffColor: 0x3f3f46,
    snowColor: 0xffffff,
    valleyColor: 0xf1f5f9,
    propType: 'pine',
    propPrimaryColor: 0xe2e8f0,
    propSecondaryColor: 0x475569,
    rockCount: 170,
    spikeRatio: 0.35,
    iceRatio: 0.24,
    bounceRatio: 0.2,
  }),

  // Map 6 — LEVEL 10 MILESTONE: Sahara Sand Dunes & Red Sandstone Desert
  buildMountainLevel({
    id: 'sahara_dunes',
    nameRu: '6. Пустыня Сахара (1700м) [УР. 10]',
    nameEn: '6. Sahara Mega Dunes (1700m) [LVL 10]',
    descRu: 'Бескрайний песчаный каньон с гигантскими барханами, кактусами сагуаро и огромным оазисом.',
    descEn: 'Vast desert sandstone canyon with colossal golden dunes, giant saguaro cacti, and a grand oasis.',
    requiredPlayerLevel: 10,
    unlockCash: 5000,
    unlockDamage: 42000,
    height: 375,
    width: 90,
    segments: 17,
    slopeAngleDeg: 49,
    seed: 1010,
    sunElevation: 38,
    sunAzimuth: 155,
    turbidity: 6.5,
    fogColor: 0xfde68a,
    cliffColor: 0xd97706,
    snowColor: 0xfbbf24,
    valleyColor: 0xf59e0b,
    waterColor: 0x06b6d4,
    propType: 'cactus',
    propPrimaryColor: 0x16a34a,
    propSecondaryColor: 0x15803d,
    rockCount: 185,
    spikeRatio: 0.32,
    iceRatio: 0.06,
    bounceRatio: 0.18,
  }),

  // Map 7 — LEVEL 20 MILESTONE: Subterranean Crystal Cavern (Giant Cave with Ceiling & Stalactites)
  buildMountainLevel({
    id: 'crystal_cavern',
    nameRu: '7. Подземный Мир Кристаллов (2000м) [УР. 20]',
    nameEn: '7. Subterranean Crystal World (2000m) [LVL 20]',
    descRu: 'Двухкилометровый подземный грот со сводчатым потолком, сталактитами и светящимися аметистами!',
    descEn: 'Two-kilometer subterranean cavern with arched ceilings, stalactites, and glowing amethyst clusters!',
    requiredPlayerLevel: 20,
    unlockCash: 9500,
    unlockDamage: 85000,
    height: 440,
    width: 95,
    segments: 18,
    slopeAngleDeg: 54,
    seed: 2020,
    sunElevation: 4,
    sunAzimuth: 120,
    turbidity: 9.0,
    fogColor: 0x3b0764,
    cliffColor: 0x1e1b4b,
    snowColor: 0xa855f7,
    valleyColor: 0x312e81,
    waterColor: 0x7e22ce,
    propType: 'stalactite',
    propPrimaryColor: 0xc084fc,
    propSecondaryColor: 0x4c1d95,
    hasCaveCeiling: true,
    rockCount: 200,
    spikeRatio: 0.38,
    iceRatio: 0.28,
    bounceRatio: 0.18,
  }),

  // Map 8 — LEVEL 30 MILESTONE: Amazon Jungle Waterfall & Mayan Temple Cliffs
  buildMountainLevel({
    id: 'amazon_waterfall',
    nameRu: '8. Водопад Анхель: Джунгли (2300м) [УР. 30]',
    nameEn: '8. Angel Falls Jungle Cliff (2300m) [LVL 30]',
    descRu: 'Гигантский тропический водопад среди вековых пальм, мшистых скал и изумрудной лагуны.',
    descEn: 'Colossal tropical jungle waterfall lined with giant palms, mossy crags, and an emerald lagoon.',
    requiredPlayerLevel: 30,
    unlockCash: 16000,
    unlockDamage: 150000,
    height: 510,
    width: 100,
    segments: 19,
    slopeAngleDeg: 52,
    seed: 3030,
    sunElevation: 44,
    sunAzimuth: 135,
    turbidity: 3.2,
    fogColor: 0xa7f3d0,
    cliffColor: 0x3f6212,
    snowColor: 0x22c55e,
    valleyColor: 0x15803d,
    waterColor: 0x10b981,
    propType: 'palm',
    propPrimaryColor: 0x16a34a,
    propSecondaryColor: 0x78350f,
    rockCount: 215,
    spikeRatio: 0.30,
    iceRatio: 0.12,
    bounceRatio: 0.26,
  }),

  // Map 9 — LEVEL 40 MILESTONE: Bioluminescent Mushroom Gorge
  buildMountainLevel({
    id: 'fungal_gorge',
    nameRu: '9. Неоновый Грибной Каньон (2650м) [УР. 40]',
    nameEn: '9. Bioluminescent Fungal Abyss (2650m) [LVL 40]',
    descRu: 'Исполинское биолюминесцентное ущелье с гигантскими грибами-батутами и бирюзовыми спорами.',
    descEn: 'Colossal bioluminescent abyss filled with giant bouncy mushroom caps and glowing cyan spores.',
    requiredPlayerLevel: 40,
    unlockCash: 26000,
    unlockDamage: 260000,
    height: 585,
    width: 104,
    segments: 20,
    slopeAngleDeg: 53,
    seed: 4040,
    sunElevation: 8,
    sunAzimuth: 190,
    turbidity: 7.5,
    fogColor: 0x99f6e4,
    cliffColor: 0x134e4a,
    snowColor: 0x2dd4bf,
    valleyColor: 0x0f766e,
    waterColor: 0x06b6d4,
    propType: 'mushroom',
    propPrimaryColor: 0xec4899,
    propSecondaryColor: 0xfdf2f8,
    hasCaveCeiling: true,
    rockCount: 230,
    spikeRatio: 0.32,
    iceRatio: 0.18,
    bounceRatio: 0.34,
  }),

  // Map 10 — LEVEL 50 MILESTONE: Grand Mesa Red Badlands
  buildMountainLevel({
    id: 'grand_mesa',
    nameRu: '10. Гранд-Каньон Колорадо (3000м) [УР. 50]',
    nameEn: '10. Grand Mesa Badlands (3000m) [LVL 50]',
    descRu: 'Трёхкилометровые терракотовые ступени Гранд-Каньона с отвесными уступами и великой рекой.',
    descEn: 'Three-kilometer terracotta staircase cliffs of Grand Mesa dropping into a vast canyon river.',
    requiredPlayerLevel: 50,
    unlockCash: 42000,
    unlockDamage: 420000,
    height: 660,
    width: 108,
    segments: 21,
    slopeAngleDeg: 55,
    seed: 5050,
    sunElevation: 16,
    sunAzimuth: 168,
    turbidity: 5.5,
    fogColor: 0xfdba74,
    cliffColor: 0x9a3412,
    snowColor: 0xf97316,
    valleyColor: 0xc2410c,
    waterColor: 0x0284c7,
    propType: 'cactus',
    propPrimaryColor: 0x65a30d,
    propSecondaryColor: 0x365314,
    rockCount: 245,
    spikeRatio: 0.40,
    iceRatio: 0.10,
    bounceRatio: 0.18,
  }),

  // Map 11 — LEVEL 60 MILESTONE: Ancient Atlantis Sunken Ruins
  buildMountainLevel({
    id: 'atlantis_ruins',
    nameRu: '11. Впадина Атлантиды (3400м) [УР. 60]',
    nameEn: '11. Atlantis Ocean Trench (3400m) [LVL 60]',
    descRu: 'Гигантский мраморный акрополь с античными колоннами, золотыми плитами и океанской бездной.',
    descEn: 'Gigantic marble acropolis with shattered temple columns, golden plinths, and an ocean trench.',
    requiredPlayerLevel: 60,
    unlockCash: 68000,
    unlockDamage: 680000,
    height: 750,
    width: 112,
    segments: 22,
    slopeAngleDeg: 56,
    seed: 6060,
    sunElevation: 28,
    sunAzimuth: 140,
    turbidity: 2.5,
    fogColor: 0xbae6fd,
    cliffColor: 0xcbd5e1,
    snowColor: 0xfacc15,
    valleyColor: 0x94a3b8,
    waterColor: 0x0369a1,
    propType: 'ruinPillar',
    propPrimaryColor: 0xf8fafc,
    propSecondaryColor: 0xeab308,
    rockCount: 260,
    spikeRatio: 0.36,
    iceRatio: 0.26,
    bounceRatio: 0.20,
  }),

  // Map 12 — LEVEL 70 MILESTONE: Cyber Megacity Skyscraper Cascade
  buildMountainLevel({
    id: 'cyber_megacity',
    nameRu: '12. Кибер-Мегаполис 2099 (3800м) [УР. 70]',
    nameEn: '12. Cyber Megacity Spire (3800m) [LVL 70]',
    descRu: 'Прыжок с вершины стратосферной мега-башни сквозь неоновые мосты и стальные небоскрёбы!',
    descEn: 'Plunge off a stratospheric cyberpunk megatower through neon skybridges and steel monoliths!',
    requiredPlayerLevel: 70,
    unlockCash: 105000,
    unlockDamage: 1050000,
    height: 840,
    width: 116,
    segments: 23,
    slopeAngleDeg: 58,
    seed: 7070,
    sunElevation: 3,
    sunAzimuth: 180,
    turbidity: 9.2,
    fogColor: 0xf0abfc,
    cliffColor: 0x0f172a,
    snowColor: 0x38bdf8,
    valleyColor: 0x1e1b4b,
    waterColor: 0xd946ef,
    propType: 'neonTower',
    propPrimaryColor: 0x06b6d4,
    propSecondaryColor: 0x0f172a,
    rockCount: 280,
    spikeRatio: 0.42,
    iceRatio: 0.32,
    bounceRatio: 0.22,
  }),

  // Map 13 — LEVEL 80 MILESTONE: Mars Olympus Mons Crater
  buildMountainLevel({
    id: 'mars_olympus',
    nameRu: '13. Марс: Супервулкан Олимп (4200м) [УР. 80]',
    nameEn: '13. Mars: Olympus Mons (4200m) [LVL 80]',
    descRu: 'Красная планета: исполинский склон высочайшего вулкана Солнечной системы с кратерами!',
    descEn: 'The Red Planet: colossal flank of the tallest volcano in the Solar System packed with craters!',
    requiredPlayerLevel: 80,
    unlockCash: 160000,
    unlockDamage: 1650000,
    height: 930,
    width: 120,
    segments: 24,
    slopeAngleDeg: 57,
    seed: 8080,
    sunElevation: 19,
    sunAzimuth: 158,
    turbidity: 7.8,
    fogColor: 0xfca5a5,
    cliffColor: 0x991b1b,
    snowColor: 0xf87171,
    valleyColor: 0x7f1d1d,
    waterColor: 0xd97706,
    propType: 'crystalSpire',
    propPrimaryColor: 0xfbbf24,
    propSecondaryColor: 0x7c2d12,
    rockCount: 300,
    spikeRatio: 0.46,
    iceRatio: 0.14,
    bounceRatio: 0.24,
  }),

  // Map 14 — LEVEL 90 MILESTONE: Astral Void & Floating Shattered Monoliths
  buildMountainLevel({
    id: 'astral_void',
    nameRu: '14. Астральный Мега-Разлом (4800м) [УР. 90]',
    nameEn: '14. Astral Void Megaliths (4800m) [LVL 90]',
    descRu: 'Почти пятикилометровая космическая бездна из обсидиановых мегалитов и звёздных кристаллов!',
    descEn: 'Nearly five-kilometer cosmic abyss of shattered obsidian megaliths and starlight crystals!',
    requiredPlayerLevel: 90,
    unlockCash: 250000,
    unlockDamage: 2600000,
    height: 1060,
    width: 126,
    segments: 25,
    slopeAngleDeg: 59,
    seed: 9090,
    sunElevation: 7,
    sunAzimuth: 145,
    turbidity: 8.8,
    fogColor: 0xc4b5fd,
    cliffColor: 0x18181b,
    snowColor: 0xc084fc,
    valleyColor: 0x2e1065,
    waterColor: 0x6366f1,
    propType: 'crystalSpire',
    propPrimaryColor: 0xa855f7,
    propSecondaryColor: 0x38bdf8,
    rockCount: 320,
    spikeRatio: 0.50,
    iceRatio: 0.28,
    bounceRatio: 0.22,
  }),
];

export class LevelBuilder {
  private levelGroup: THREE.Group;
  private geometries: THREE.BufferGeometry[] = [];
  private materials = new Map<SurfaceMaterialId, THREE.Material>();
  private extraMaterials: THREE.Material[] = [];
  private breakableMeshes = new Map<number, THREE.Object3D>();
  public activeZones: GravityZoneDef[] = [];

  constructor(private scene: THREE.Scene) {
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);

    this.materials.set(
      'concrete',
      new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.78,
        metalness: 0.08,
        side: THREE.DoubleSide,
      })
    );
    this.materials.set(
      'metal',
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.55,
        metalness: 0.25,
        side: THREE.DoubleSide,
      })
    );
    this.materials.set(
      'spikes',
      new THREE.MeshPhysicalMaterial({
        color: 0xef4444,
        emissive: 0x7f1d1d,
        emissiveIntensity: 0.4,
        roughness: 0.24,
        metalness: 0.35,
        clearcoat: 0.8,
      })
    );
    this.materials.set(
      'rubber',
      new THREE.MeshPhysicalMaterial({
        color: 0x10b981,
        emissive: 0x064e3b,
        emissiveIntensity: 0.25,
        roughness: 0.35,
        metalness: 0.1,
        clearcoat: 0.6,
      })
    );
    this.materials.set(
      'glass',
      new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        emissive: 0x0284c7,
        emissiveIntensity: 0.18,
        roughness: 0.08,
        metalness: 0.1,
        transmission: 0.65,
        transparent: true,
        opacity: 0.82,
        clearcoat: 1.0,
      })
    );
    this.materials.set(
      'boost',
      new THREE.MeshPhysicalMaterial({
        color: 0xa855f7,
        emissive: 0x6b21a8,
        emissiveIntensity: 0.55,
        roughness: 0.2,
        metalness: 0.5,
        clearcoat: 0.9,
      })
    );
    this.materials.set(
      'grass',
      new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        roughness: 0.84,
        metalness: 0.04,
        side: THREE.DoubleSide,
      })
    );
    this.materials.set(
      'water',
      new THREE.MeshPhysicalMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.15,
        roughness: 0.05,
        metalness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0.92,
      })
    );
  }

  private createScaledConvexCollider(
    baseGeo: THREE.BufferGeometry,
    sx: number,
    sy: number,
    sz: number
  ): RAPIER.ColliderDesc {
    const posAttr = baseGeo.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    const verts = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      verts[i * 3] = posAttr.getX(i) * sx;
      verts[i * 3 + 1] = posAttr.getY(i) * sy;
      verts[i * 3 + 2] = posAttr.getZ(i) * sz;
    }
    return RAPIER.ColliderDesc.convexHull(verts) ?? RAPIER.ColliderDesc.cuboid(sx, sy, sz);
  }

  private buildSeamlessFunnelVisuals(level: LevelDef, physics: PhysicsWorld): void {
    const fp = level.funnelGeoParams;
    if (!fp) return;

    const { H, topRadius, bottomRadius, outerDepth, rings, seed } = fp;
    const cx = 0;
    const cz = -topRadius;

    // 1. Continuous 360° Seamless Upper-World Plateau Ring (ordered outer -> inner so normals face +Y UP)
    const plateauPoints: THREE.Vector2[] = [
      new THREE.Vector2(topRadius + outerDepth + 18, H - 36),
      new THREE.Vector2(topRadius + outerDepth, H - 0.08),
      new THREE.Vector2(topRadius, H - 0.08),
      new THREE.Vector2(Math.max(10, topRadius - 0.6), H - 3.6),
    ];
    const plateauGeo = new THREE.LatheGeometry(plateauPoints, 96);
    this.geometries.push(plateauGeo);
    const plateauMesh = new THREE.Mesh(plateauGeo, this.materials.get('grass')!);
    plateauMesh.position.set(cx, 0, cz);
    plateauMesh.receiveShadow = true;
    this.levelGroup.add(plateauMesh);

    const plateauBody = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0, cz)
    );
    const pVerts = new Float32Array((plateauGeo.attributes.position as THREE.BufferAttribute).array);
    const pIndices = new Uint32Array(plateauGeo.index!.array);
    const plateauColDesc = RAPIER.ColliderDesc.trimesh(pVerts, pIndices)
      .setRestitution(CONFIG.MATERIALS.grass.restitution)
      .setFriction(CONFIG.MATERIALS.grass.friction)
      .setCollisionGroups(CONFIG.PHYSICS.COLLISION_GROUP_ENV);
    const plateauCol = physics.world.createCollider(plateauColDesc, plateauBody);
    physics.colliderMeta.set(plateauCol.handle, {
      isRagdoll: false,
      material: 'grass',
      obstacleId: -1,
      breakable: false,
      isSlopeBase: true,
    });

    // 2. Continuous 360° Seamless Funnel Wall + Natural 3D Relief + Bottom Crater Basin
    const radialSegs = 128;
    const verticalSteps = Math.max(48, rings * 4);
    const funnelPoints: THREE.Vector2[] = [];
    for (let step = 0; step <= verticalSteps; step++) {
      const t = step / verticalSteps;
      const y = H * (1 - t);
      const r = bottomRadius + (topRadius - bottomRadius) * Math.pow(1 - t, 0.94);
      funnelPoints.push(new THREE.Vector2(r, y));
    }
    funnelPoints.push(new THREE.Vector2(0, -0.4));

    const funnelGeo = new THREE.LatheGeometry(funnelPoints, radialSegs);
    const fPosAttr = funnelGeo.attributes.position as THREE.BufferAttribute;
    const ptsPerRing = funnelPoints.length;

    for (let i = 0; i <= radialSegs; i++) {
      const segIdx = i === radialSegs ? 0 : i;
      const phi = (segIdx / radialSegs) * Math.PI * 2;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let step = 0; step <= verticalSteps; step++) {
        const t = step / verticalSteps;
        const { r, y } = evalFunnelPoint(t, phi, H, topRadius, bottomRadius, seed);
        const vIdx = i * ptsPerRing + step;
        fPosAttr.setXYZ(vIdx, r * sinPhi, y, r * cosPhi);
      }
    }
    funnelGeo.computeVertexNormals();

    this.geometries.push(funnelGeo);
    const funnelMesh = new THREE.Mesh(funnelGeo, this.materials.get('concrete')!);
    funnelMesh.position.set(cx, 0, cz);
    funnelMesh.receiveShadow = true;
    this.levelGroup.add(funnelMesh);

    const funnelBody = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0, cz)
    );
    const fVerts = new Float32Array((funnelGeo.attributes.position as THREE.BufferAttribute).array);
    const fIndices = new Uint32Array(funnelGeo.index!.array);
    const funnelColDesc = RAPIER.ColliderDesc.trimesh(fVerts, fIndices)
      .setRestitution(CONFIG.MATERIALS.concrete.restitution)
      .setFriction(CONFIG.MATERIALS.concrete.friction)
      .setCollisionGroups(CONFIG.PHYSICS.COLLISION_GROUP_ENV);
    const funnelCol = physics.world.createCollider(funnelColDesc, funnelBody);
    physics.colliderMeta.set(funnelCol.handle, {
      isRagdoll: false,
      material: 'concrete',
      obstacleId: -2,
      breakable: false,
      isSlopeBase: true,
    });

    // 3. Continuous 360° Circular Crater Lake at the bottom of the Funnel
    const lakeRadius = bottomRadius * 0.94;
    const lakeHalfH = 1.1;
    const lakeGeo = new THREE.CylinderGeometry(lakeRadius, lakeRadius, lakeHalfH * 2, 72);
    this.geometries.push(lakeGeo);
    const lakeMesh = new THREE.Mesh(lakeGeo, this.materials.get('water')!);
    lakeMesh.position.set(cx, 0.2, cz);
    lakeMesh.receiveShadow = true;
    this.levelGroup.add(lakeMesh);

    const lakeBody = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0.2, cz)
    );
    const lakeColDesc = RAPIER.ColliderDesc.cylinder(lakeHalfH, lakeRadius)
      .setRestitution(CONFIG.MATERIALS.water.restitution)
      .setFriction(CONFIG.MATERIALS.water.friction)
      .setCollisionGroups(CONFIG.PHYSICS.COLLISION_GROUP_ENV);
    const lakeCol = physics.world.createCollider(lakeColDesc, lakeBody);
    physics.colliderMeta.set(lakeCol.handle, {
      isRagdoll: false,
      material: 'water',
      obstacleId: -3,
      breakable: false,
      isSlopeBase: true,
    });
  }

  public loadLevel(
    level: LevelDef,
    physics: PhysicsWorld,
    onSetAtmosphere?: (elev: number, azim: number, turb: number, fogCol: number) => void
  ): void {
    this.clearLevelVisuals();
    this.breakableMeshes.clear();
    this.activeZones = level.gravityZones ?? [];

    if (onSetAtmosphere) {
      onSetAtmosphere(level.sunElevation, level.sunAzimuth, level.turbidity, level.fogColor);
    }

    // Update solid unified biome material colors
    const concreteMat = this.materials.get('concrete') as THREE.MeshStandardMaterial;
    if (concreteMat) {
      concreteMat.color.setHex(level.cliffColor);
    }
    const metalMat = this.materials.get('metal') as THREE.MeshStandardMaterial;
    if (metalMat) {
      metalMat.color.setHex(level.cliffColor).lerp(new THREE.Color(level.snowColor), 0.26);
    }
    const grassMat = this.materials.get('grass') as THREE.MeshStandardMaterial;
    if (grassMat) {
      grassMat.color.setHex(level.valleyColor);
    }
    const waterMat = this.materials.get('water') as THREE.MeshPhysicalMaterial;
    if (waterMat) {
      waterMat.color.setHex(level.waterColor);
      waterMat.emissive.setHex(level.waterColor);
    }

    // Build continuous 360° seamless funnel, plateau, and crater lake meshes + exact 1-to-1 trimesh colliders
    this.buildSeamlessFunnelVisuals(level, physics);

    const deg2rad = Math.PI / 180;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const quat = new THREE.Quaternion();

    // Shared high-poly unit boulder & slab geometries (solid unified shading)
    const unitBoulderCliff = createSculptedBoulderGeometry(1, 1, 1, 2, level.cliffColor, level.snowColor);
    const unitBoulderSpikes = createSculptedBoulderGeometry(1, 1, 1, 2, 0xdc2626, 0xfecaca);
    const unitBoulderRubber = createSculptedBoulderGeometry(1, 1, 1, 2, 0x10b981, 0x6ee7b7);
    const unitSlabCliff = createSculptedRockGeometry(1, 1, 1, 12, 4, 12, level.cliffColor, level.snowColor, 0.08);
    const unitSlabGrass = createSculptedRockGeometry(1, 1, 1, 12, 4, 12, level.valleyColor, level.snowColor, 0.06);
    const unitPlatformFlat = createSculptedRockGeometry(1, 1, 1, 8, 2, 8, level.cliffColor, level.snowColor, 0.0);
    const unitBoxFlat = new THREE.BoxGeometry(2, 2, 2, 4, 2, 4);
    const unitCylinder = new THREE.CylinderGeometry(1, 1, 2, 20);
    this.geometries.push(
      unitBoulderCliff,
      unitBoulderSpikes,
      unitBoulderRubber,
      unitSlabCliff,
      unitSlabGrass,
      unitPlatformFlat,
      unitBoxFlat,
      unitCylinder
    );

    level.obstacles.forEach((obs, idx) => {
      const matCfg = CONFIG.MATERIALS[obs.material];
      const threeMat = this.materials.get(obs.material)!;

      euler.set(
        (obs.rot?.[0] ?? 0) * deg2rad,
        (obs.rot?.[1] ?? 0) * deg2rad,
        (obs.rot?.[2] ?? 0) * deg2rad,
        'YXZ'
      );
      quat.setFromEuler(euler);

      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(obs.pos[0], obs.pos[1], obs.pos[2])
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
      const body = physics.world.createRigidBody(bodyDesc);

      let colDesc: RAPIER.ColliderDesc;
      let geom: THREE.BufferGeometry;
      let meshScale: [number, number, number] = [1, 1, 1];

      if (obs.shape === 'cylinder') {
        const halfH = obs.size[0];
        const radius = obs.size[1];
        colDesc = RAPIER.ColliderDesc.cylinder(halfH, radius);
        geom = unitCylinder;
        meshScale = [radius, halfH, radius];
      } else if (obs.shape === 'wedge') {
        const [hx, hy, hz] = obs.size;
        geom =
          obs.material === 'spikes'
            ? unitBoulderSpikes
            : obs.material === 'rubber'
            ? unitBoulderRubber
            : unitBoulderCliff;
        meshScale = [hx, hy, hz];
        colDesc = this.createScaledConvexCollider(geom, hx, hy, hz);
      } else {
        const [hx, hy, hz] = obs.size;

        if (obs.material === 'water' || obs.material === 'glass' || obs.material === 'boost') {
          colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
          geom = unitBoxFlat;
          meshScale = [hx, hy, hz];
        } else if (obs.isFlatPlatform) {
          colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
          geom = unitPlatformFlat;
          meshScale = [hx, hy, hz];
        } else if (obs.isSlopeBase) {
          colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
          geom = obs.material === 'grass' ? unitSlabGrass : unitSlabCliff;
          meshScale = [hx, hy, hz];
        } else {
          geom =
            obs.material === 'spikes'
              ? unitBoulderSpikes
              : obs.material === 'rubber'
              ? unitBoulderRubber
              : unitBoulderCliff;
          meshScale = [hx, hy, hz];
          colDesc = this.createScaledConvexCollider(geom, hx, hy, hz);
        }
      }

      colDesc
        .setRestitution(matCfg.restitution)
        .setFriction(matCfg.friction)
        .setCollisionGroups(CONFIG.PHYSICS.COLLISION_GROUP_ENV);

      const collider = physics.world.createCollider(colDesc, body);
      physics.colliderMeta.set(collider.handle, {
        isRagdoll: false,
        material: obs.material,
        obstacleId: idx,
        breakable: matCfg.breakable,
        isSlopeBase: Boolean(obs.isSlopeBase),
      });

      if (obs.isColliderOnly) {
        return;
      }

      const mesh = new THREE.Mesh(geom, threeMat);
      mesh.position.set(obs.pos[0], obs.pos[1], obs.pos[2]);
      mesh.quaternion.copy(quat);
      mesh.scale.set(meshScale[0], meshScale[1], meshScale[2]);
      mesh.receiveShadow = true;
      mesh.castShadow = !matCfg.breakable && obs.material !== 'water';
      this.levelGroup.add(mesh);

      if (matCfg.breakable) {
        this.breakableMeshes.set(idx, mesh);
      }
    });

    this.buildBiomeProps(level);

    // Panoramic Distant Sculpted Mountain Peaks (solid unified shading)
    for (const peak of level.distantPeaks) {
      const pGeo = new THREE.ConeGeometry(peak.radius, peak.height, 28, 12);
      const posAttr = pGeo.attributes.position as THREE.BufferAttribute;
      const pCount = posAttr.count;

      for (let i = 0; i < pCount; i++) {
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const vz = posAttr.getZ(i);

        const n = fbm3(vx * 0.02, vy * 0.02, vz * 0.02);
        posAttr.setXYZ(i, vx * (1 + n * 0.22), vy, vz * (1 + n * 0.22));
      }

      pGeo.computeVertexNormals();
      this.geometries.push(pGeo);

      const pMesh = new THREE.Mesh(pGeo, this.materials.get('concrete')!);
      pMesh.position.set(peak.pos[0], peak.pos[1], peak.pos[2]);
      pMesh.receiveShadow = true;
      this.levelGroup.add(pMesh);
    }

    // Volumetric 3D Cloud Clusters
    if (level.clouds.length > 0) {
      const cloudGeo = new THREE.IcosahedronGeometry(1.0, 2);
      this.geometries.push(cloudGeo);
      const cloudMat = new THREE.MeshStandardMaterial({
        color: level.hasCaveCeiling ? level.snowColor : 0xffffff,
        roughness: 0.9,
        transparent: true,
        opacity: level.hasCaveCeiling ? 0.35 : 0.86,
      });
      this.extraMaterials.push(cloudMat);

      const cloudInst = new THREE.InstancedMesh(cloudGeo, cloudMat, level.clouds.length);
      const dummy = new THREE.Object3D();
      level.clouds.forEach((c, idx) => {
        dummy.position.set(c.pos[0], c.pos[1], c.pos[2]);
        dummy.scale.set(c.scale[0], c.scale[1], c.scale[2]);
        dummy.updateMatrix();
        cloudInst.setMatrixAt(idx, dummy.matrix);
      });
      this.levelGroup.add(cloudInst);
    }
  }

  private buildBiomeProps(level: LevelDef): void {
    const count = level.trees.length;
    if (count === 0) return;

    const dummy = new THREE.Object3D();
    const pType = level.propType;

    if (pType === 'cactus') {
      // Saguaro Desert Cacti (tall ribbed trunk + two side arms)
      const trunkGeo = new THREE.CapsuleGeometry(0.55, 5.2, 10, 16);
      const armGeo = new THREE.CapsuleGeometry(0.38, 2.2, 8, 14);
      this.geometries.push(trunkGeo, armGeo);

      const cactusMat = new THREE.MeshStandardMaterial({
        color: level.propPrimaryColor,
        roughness: 0.72,
      });
      this.extraMaterials.push(cactusMat);

      const trunkInst = new THREE.InstancedMesh(trunkGeo, cactusMat, count);
      const armLInst = new THREE.InstancedMesh(armGeo, cactusMat, count);
      const armRInst = new THREE.InstancedMesh(armGeo, cactusMat, count);
      trunkInst.castShadow = true;
      armLInst.castShadow = true;
      armRInst.castShadow = true;

      level.trees.forEach((t, i) => {
        const s = t.scale;
        dummy.position.set(t.pos[0], t.pos[1] + 2.6 * s, t.pos[2]);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, i * 1.1, 0);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.pos[0] - 0.9 * s, t.pos[1] + 3.2 * s, t.pos[2]);
        dummy.rotation.set(0, 0, 0.35);
        dummy.updateMatrix();
        armLInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.pos[0] + 0.9 * s, t.pos[1] + 2.5 * s, t.pos[2]);
        dummy.rotation.set(0, 0, -0.35);
        dummy.updateMatrix();
        armRInst.setMatrixAt(i, dummy.matrix);
      });

      this.levelGroup.add(trunkInst, armLInst, armRInst);
    } else if (pType === 'mushroom') {
      // Giant Bioluminescent Mushrooms (curved stalk + glowing umbrella cap)
      const stalkGeo = new THREE.CylinderGeometry(0.32, 0.55, 4.2, 14);
      const capGeo = new THREE.SphereGeometry(2.4, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      this.geometries.push(stalkGeo, capGeo);

      const stalkMat = new THREE.MeshStandardMaterial({
        color: level.propSecondaryColor,
        roughness: 0.7,
      });
      const capMat = new THREE.MeshPhysicalMaterial({
        color: level.propPrimaryColor,
        emissive: level.propPrimaryColor,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        clearcoat: 0.9,
      });
      this.extraMaterials.push(stalkMat, capMat);

      const stalkInst = new THREE.InstancedMesh(stalkGeo, stalkMat, count);
      const capInst = new THREE.InstancedMesh(capGeo, capMat, count);

      level.trees.forEach((t, i) => {
        const s = t.scale;
        dummy.position.set(t.pos[0], t.pos[1] + 2.0 * s, t.pos[2]);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        stalkInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.pos[0], t.pos[1] + 3.9 * s, t.pos[2]);
        dummy.updateMatrix();
        capInst.setMatrixAt(i, dummy.matrix);
      });

      this.levelGroup.add(stalkInst, capInst);
    } else if (pType === 'stalactite' || pType === 'crystalSpire') {
      // Glowing Crystal Spires & Cavern Stalagmites
      const spireGeo = new THREE.ConeGeometry(1.4, 7.5, 7);
      this.geometries.push(spireGeo);

      const spireMat = new THREE.MeshPhysicalMaterial({
        color: level.propPrimaryColor,
        emissive: level.propSecondaryColor,
        emissiveIntensity: 0.5,
        roughness: 0.12,
        metalness: 0.35,
        clearcoat: 1.0,
      });
      this.extraMaterials.push(spireMat);

      const spireInst = new THREE.InstancedMesh(spireGeo, spireMat, count);
      level.trees.forEach((t, i) => {
        const s = t.scale;
        dummy.position.set(t.pos[0], t.pos[1] + 3.4 * s, t.pos[2]);
        dummy.scale.set(s, s * 1.2, s);
        dummy.rotation.set((i % 3 - 1) * 0.18, i * 0.8, ((i + 1) % 3 - 1) * 0.18);
        dummy.updateMatrix();
        spireInst.setMatrixAt(i, dummy.matrix);
      });
      this.levelGroup.add(spireInst);
    } else if (pType === 'ruinPillar' || pType === 'neonTower') {
      // Ancient Marble Pillars or Cyberpunk Neon Skyscrapers
      const colGeo =
        pType === 'neonTower'
          ? new THREE.BoxGeometry(3.2, 14.0, 3.2)
          : new THREE.CylinderGeometry(0.95, 1.05, 8.5, 16);
      this.geometries.push(colGeo);

      const colMat = new THREE.MeshPhysicalMaterial({
        color: level.propSecondaryColor,
        emissive: pType === 'neonTower' ? level.propPrimaryColor : 0x000000,
        emissiveIntensity: pType === 'neonTower' ? 0.65 : 0.0,
        roughness: 0.25,
        metalness: pType === 'neonTower' ? 0.8 : 0.15,
        clearcoat: 0.8,
      });
      this.extraMaterials.push(colMat);

      const colInst = new THREE.InstancedMesh(colGeo, colMat, count);
      colInst.castShadow = true;
      level.trees.forEach((t, i) => {
        const s = t.scale;
        dummy.position.set(t.pos[0], t.pos[1] + 4.0 * s, t.pos[2]);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, i * 0.5, 0);
        dummy.updateMatrix();
        colInst.setMatrixAt(i, dummy.matrix);
      });
      this.levelGroup.add(colInst);
    } else {
      // Multi-tiered Alpine Pines or Tropical Palms
      const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 2.8, 12);
      const tier1Geo = new THREE.ConeGeometry(2.1, 3.0, 14);
      const tier2Geo = new THREE.ConeGeometry(1.65, 2.6, 14);
      const tier3Geo = new THREE.ConeGeometry(1.15, 2.2, 14);
      this.geometries.push(trunkGeo, tier1Geo, tier2Geo, tier3Geo);

      const trunkMat = new THREE.MeshStandardMaterial({
        color: level.propSecondaryColor,
        roughness: 0.9,
      });
      const foliageMat = new THREE.MeshStandardMaterial({
        color: level.propPrimaryColor,
        roughness: 0.72,
      });
      this.extraMaterials.push(trunkMat, foliageMat);

      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const tier1Inst = new THREE.InstancedMesh(tier1Geo, foliageMat, count);
      const tier2Inst = new THREE.InstancedMesh(tier2Geo, foliageMat, count);
      const tier3Inst = new THREE.InstancedMesh(tier3Geo, foliageMat, count);

      trunkInst.castShadow = true;
      tier1Inst.castShadow = true;
      tier2Inst.castShadow = true;
      tier3Inst.castShadow = true;

      level.trees.forEach((t, i) => {
        const s = t.scale;
        dummy.position.set(t.pos[0], t.pos[1] + 1.2 * s, t.pos[2]);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.pos[0], t.pos[1] + 2.8 * s, t.pos[2]);
        dummy.updateMatrix();
        tier1Inst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.pos[0], t.pos[1] + 4.3 * s, t.pos[2]);
        dummy.updateMatrix();
        tier2Inst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.pos[0], t.pos[1] + 5.7 * s, t.pos[2]);
        dummy.updateMatrix();
        tier3Inst.setMatrixAt(i, dummy.matrix);
      });

      this.levelGroup.add(trunkInst, tier1Inst, tier2Inst, tier3Inst);
    }
  }

  public shatterObstacle(obstacleId: number, colliderHandle: number, physics: PhysicsWorld): void {
    const mesh = this.breakableMeshes.get(obstacleId);
    if (mesh) {
      mesh.visible = false;
      this.breakableMeshes.delete(obstacleId);
    }
    const col = physics.world.getCollider(colliderHandle);
    if (col) {
      physics.world.removeCollider(col, true);
    }
    physics.colliderMeta.delete(colliderHandle);
  }

  public clearLevelVisuals(): void {
    while (this.levelGroup.children.length > 0) {
      this.levelGroup.remove(this.levelGroup.children[0]);
    }
    for (const g of this.geometries) {
      g.dispose();
    }
    for (const m of this.extraMaterials) {
      m.dispose();
    }
    this.geometries = [];
    this.extraMaterials = [];
  }
}
