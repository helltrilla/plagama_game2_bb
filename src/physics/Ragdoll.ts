import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CONFIG, type BodyPartId, type BoneId } from '../config';
import type { BoneDamageStage } from '../core/EventBus';
import type { PhysicsWorld } from './World';

export interface BodyPartState {
  id: BodyPartId;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Group;
  mainMesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
  prevVel: THREE.Vector3;
  mass: number;
}

export interface BoneState {
  id: BoneId;
  bodyPart: BodyPartId;
  nameRu: string;
  nameEn: string;
  maxHealth: number;
  health: number;
  fragility: number;
  breakBonusCash: number;
  stage: BoneDamageStage;
  broken: boolean;
}

export class Ragdoll {
  public parts = new Map<BodyPartId, BodyPartState>();
  public colliderToPart = new Map<number, BodyPartId>();
  public bones = new Map<BoneId, BoneState>();
  public joints: RAPIER.ImpulseJoint[] = [];
  public isStandingPreLaunch = true;

  private rootGroup: THREE.Group;
  private sharedGeometries: THREE.BufferGeometry[] = [];
  private sharedMaterials: THREE.Material[] = [];
  private boneMeshes = new Map<BoneId, THREE.Object3D>();
  private boneMaterials = new Map<BoneId, THREE.MeshStandardMaterial>();
  private partDamageStage = new Map<BodyPartId, BoneDamageStage>();

  private standOrigin = new THREE.Vector3();
  private walkAnimPhase = 0;
  private partOffsets = new Map<BodyPartId, { dx: number; dy: number; dz: number; rotZ: number }>();

  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly xAxis = new THREE.Vector3(1, 0, 0);

  constructor(private scene: THREE.Scene) {
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);
  }

  public spawn(
    physics: PhysicsWorld,
    origin: { x: number; y: number; z: number },
    massMultiplier = 1.0,
    bounceMultiplier = 1.0
  ): void {
    this.disposeVisuals();
    this.parts.clear();
    this.colliderToPart.clear();
    this.bones.clear();
    this.boneMeshes.clear();
    this.boneMaterials.clear();
    this.partDamageStage.clear();
    this.partOffsets.clear();
    this.joints = [];
    this.isStandingPreLaunch = true;
    this.walkAnimPhase = 0;

    for (const bCfg of CONFIG.BONES) {
      this.bones.set(bCfg.id, {
        id: bCfg.id,
        bodyPart: bCfg.bodyPart,
        nameRu: bCfg.nameRu,
        nameEn: bCfg.nameEn,
        maxHealth: bCfg.maxHealth,
        health: bCfg.maxHealth,
        fragility: bCfg.fragility,
        breakBonusCash: bCfg.breakBonusCash,
        stage: 'healthy',
        broken: false,
      });
    }

    const ox = origin.x;
    const oy = origin.y + CONFIG.RAGDOLL.SPAWN_HEIGHT_OFFSET;
    const oz = origin.z;
    this.standOrigin.set(ox, oy, oz);

    const offsets: Record<BodyPartId, { dx: number; dy: number; dz: number; rotZ: number }> = {
      pelvis: { dx: 0, dy: 0.0, dz: 0, rotZ: 0 },
      torso: { dx: 0, dy: 0.42, dz: 0, rotZ: 0 },
      head: { dx: 0, dy: 0.88, dz: 0, rotZ: 0 },
      upperArmL: { dx: -0.34, dy: 0.56, dz: 0, rotZ: Math.PI / 2 },
      upperArmR: { dx: 0.34, dy: 0.56, dz: 0, rotZ: -Math.PI / 2 },
      lowerArmL: { dx: -0.68, dy: 0.56, dz: 0, rotZ: Math.PI / 2 },
      lowerArmR: { dx: 0.68, dy: 0.56, dz: 0, rotZ: -Math.PI / 2 },
      upperLegL: { dx: -0.13, dy: -0.38, dz: 0, rotZ: 0 },
      upperLegR: { dx: 0.13, dy: -0.38, dz: 0, rotZ: 0 },
      lowerLegL: { dx: -0.13, dy: -0.84, dz: 0, rotZ: 0 },
      lowerLegR: { dx: 0.13, dy: -0.84, dz: 0, rotZ: 0 },
    };

    // Translucent X-Ray armor materials so the internal 3D skeleton is clearly visible
    const carbonArmorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.28,
      metalness: 0.45,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
      roughness: 0.08,
      metalness: 0.6,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    const thrusterGlowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const jointBallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.5,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    this.sharedMaterials.push(carbonArmorMat, visorMat, thrusterGlowMat, jointBallMat);

    const partIds = Object.keys(CONFIG.RAGDOLL.PARTS) as BodyPartId[];
    for (const id of partIds) {
      const cfg = CONFIG.RAGDOLL.PARTS[id];
      const off = offsets[id];
      this.partOffsets.set(id, off);
      this.partDamageStage.set(id, 'healthy');

      const px = ox + off.dx;
      const py = oy + off.dy;
      const pz = oz + off.dz;

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(px, py, pz)
        .setLinearDamping(CONFIG.PHYSICS.LINEAR_DAMPING)
        .setAngularDamping(CONFIG.PHYSICS.ANGULAR_DAMPING)
        .setCcdEnabled(true)
        .setGravityScale(0);

      if (off.rotZ !== 0) {
        const q = new THREE.Quaternion().setFromAxisAngle(this.zAxis, off.rotZ);
        bodyDesc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }

      const body = physics.world.createRigidBody(bodyDesc);

      const restitution = Math.min(1.25, CONFIG.RAGDOLL.BASE_RESTITUTION * bounceMultiplier);
      const partMass = cfg.mass * massMultiplier;

      const colDesc = RAPIER.ColliderDesc.capsule(cfg.halfHeight, cfg.radius)
        .setMass(partMass)
        .setRestitution(restitution)
        .setFriction(CONFIG.RAGDOLL.BASE_FRICTION)
        .setCollisionGroups(CONFIG.PHYSICS.COLLISION_GROUP_RAGDOLL)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(10.0);

      const collider = physics.world.createCollider(colDesc, body);

      physics.colliderMeta.set(collider.handle, {
        isRagdoll: true,
        bodyPart: id,
      });
      this.colliderToPart.set(collider.handle, id);

      const group = new THREE.Group();
      // Translucent X-Ray outer body capsule
      const geom = new THREE.CapsuleGeometry(cfg.radius, cfg.halfHeight * 2, 16, 28);
      this.sharedGeometries.push(geom);

      const mat = new THREE.MeshPhysicalMaterial({
        color: cfg.color,
        emissive: 0x0c4a6e,
        emissiveIntensity: 0.18,
        roughness: 0.25,
        metalness: 0.12,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      });
      this.sharedMaterials.push(mat);

      const mainMesh = new THREE.Mesh(geom, mat);
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = false;
      mainMesh.renderOrder = 2;
      group.add(mainMesh);

      // Detailed anatomical armor & helmet attachments (X-Ray translucent)
      if (id === 'head') {
        const crestGeo = new THREE.BoxGeometry(0.06, 0.22, 0.26);
        const visorGeo = new THREE.CylinderGeometry(
          cfg.radius * 1.05,
          cfg.radius * 1.05,
          0.11,
          24,
          1,
          false,
          Math.PI * 0.65,
          Math.PI * 0.7
        );
        const earGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.30, 16);
        earGeo.rotateZ(Math.PI / 2);
        this.sharedGeometries.push(crestGeo, visorGeo, earGeo);

        const crest = new THREE.Mesh(crestGeo, carbonArmorMat);
        crest.position.set(0, 0.08, 0.02);
        crest.renderOrder = 3;
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 0.03, 0);
        visor.renderOrder = 3;
        const ears = new THREE.Mesh(earGeo, carbonArmorMat);
        ears.position.set(0, 0.02, 0);
        ears.renderOrder = 3;
        group.add(crest, visor, ears);
      } else if (id === 'torso') {
        const chestGeo = new THREE.BoxGeometry(0.30, 0.28, 0.26);
        const packGeo = new THREE.BoxGeometry(0.24, 0.30, 0.14);
        const coreGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.16, 18);
        coreGeo.rotateX(Math.PI / 2);
        const collarGeo = new THREE.TorusGeometry(0.13, 0.032, 12, 24);
        collarGeo.rotateX(Math.PI / 2);
        this.sharedGeometries.push(chestGeo, packGeo, coreGeo, collarGeo);

        const chest = new THREE.Mesh(chestGeo, carbonArmorMat);
        chest.position.set(0, 0.05, 0);
        chest.renderOrder = 3;

        const pack = new THREE.Mesh(packGeo, jointBallMat);
        pack.position.set(0, 0.04, 0.15);
        pack.renderOrder = 3;

        const core = new THREE.Mesh(coreGeo, thrusterGlowMat);
        core.position.set(0, 0.05, 0.16);
        core.renderOrder = 3;

        const collar = new THREE.Mesh(collarGeo, carbonArmorMat);
        collar.position.set(0, 0.22, 0);
        collar.renderOrder = 3;

        group.add(chest, pack, core, collar);
      } else if (id === 'pelvis') {
        const beltGeo = new THREE.CylinderGeometry(cfg.radius * 1.06, cfg.radius * 1.06, 0.09, 24);
        this.sharedGeometries.push(beltGeo);
        const belt = new THREE.Mesh(beltGeo, carbonArmorMat);
        belt.renderOrder = 3;
        group.add(belt);
      } else if (id === 'upperArmL' || id === 'upperArmR') {
        const pauldronGeo = new THREE.SphereGeometry(cfg.radius * 1.32, 18, 18);
        this.sharedGeometries.push(pauldronGeo);
        const pauldron = new THREE.Mesh(pauldronGeo, carbonArmorMat);
        pauldron.position.set(0, cfg.halfHeight * 0.85, 0);
        pauldron.renderOrder = 3;
        group.add(pauldron);
      } else if (id === 'lowerArmL' || id === 'lowerArmR') {
        const gauntletGeo = new THREE.CylinderGeometry(cfg.radius * 1.15, cfg.radius * 1.05, 0.14, 18);
        const handGeo = new THREE.SphereGeometry(cfg.radius * 1.22, 16, 16);
        this.sharedGeometries.push(gauntletGeo, handGeo);

        const gauntlet = new THREE.Mesh(gauntletGeo, carbonArmorMat);
        gauntlet.position.set(0, -0.04, 0);
        gauntlet.renderOrder = 3;
        const hand = new THREE.Mesh(handGeo, jointBallMat);
        hand.position.set(0, -(cfg.halfHeight + cfg.radius * 0.6), 0);
        hand.renderOrder = 3;
        group.add(gauntlet, hand);
      } else if (id === 'upperLegL' || id === 'upperLegR') {
        const strapGeo = new THREE.CylinderGeometry(cfg.radius * 1.08, cfg.radius * 1.08, 0.08, 20);
        const kneeGeo = new THREE.SphereGeometry(cfg.radius * 1.18, 16, 16);
        this.sharedGeometries.push(strapGeo, kneeGeo);
        const strap = new THREE.Mesh(strapGeo, carbonArmorMat);
        strap.renderOrder = 3;
        const knee = new THREE.Mesh(kneeGeo, carbonArmorMat);
        knee.position.set(0, -cfg.halfHeight, -0.03);
        knee.renderOrder = 3;
        group.add(strap, knee);
      } else if (id === 'lowerLegL' || id === 'lowerLegR') {
        const bootGeo = new THREE.BoxGeometry(0.15, 0.11, 0.24);
        const shinGeo = new THREE.CylinderGeometry(cfg.radius * 1.12, cfg.radius * 1.08, 0.18, 18);
        this.sharedGeometries.push(bootGeo, shinGeo);
        const boot = new THREE.Mesh(bootGeo, carbonArmorMat);
        boot.position.set(0, -(cfg.halfHeight + 0.05), -0.04);
        boot.renderOrder = 3;
        const shin = new THREE.Mesh(shinGeo, jointBallMat);
        shin.position.set(0, -0.03, 0);
        shin.renderOrder = 3;
        group.add(shin, boot);
      }

      // Build 3D anatomical X-Ray skeleton inside this body part
      this.buildPartSkeleton(id, cfg, group);

      group.position.set(px, py, pz);
      if (off.rotZ !== 0) {
        group.rotation.z = off.rotZ;
      }
      this.rootGroup.add(group);

      const initPos = new THREE.Vector3(px, py, pz);
      const initRot = new THREE.Quaternion().setFromEuler(group.rotation);

      this.parts.set(id, {
        id,
        body,
        collider,
        mesh: group,
        mainMesh,
        material: mat,
        prevPos: initPos.clone(),
        currPos: initPos.clone(),
        prevRot: initRot.clone(),
        currRot: initRot.clone(),
        prevVel: new THREE.Vector3(),
        mass: partMass,
      });
    }

    this.createJoints(physics);
  }

  private createBoneMaterial(boneId: BoneId): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.36,
      roughness: 0.3,
      metalness: 0.15,
    });
    this.sharedMaterials.push(mat);
    this.boneMaterials.set(boneId, mat);
    return mat;
  }

  private registerBoneObject(boneId: BoneId, obj: THREE.Object3D, parent: THREE.Group): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.renderOrder = 1;
        child.castShadow = false;
      }
    });
    parent.add(obj);
    this.boneMeshes.set(boneId, obj);
  }

  private buildPartSkeleton(
    id: BodyPartId,
    cfg: { halfHeight: number; radius: number },
    group: THREE.Group
  ): void {
    if (id === 'head') {
      // Skull cranium
      const skullMat = this.createBoneMaterial('skull');
      const skullGeo = new THREE.SphereGeometry(0.086, 14, 12);
      skullGeo.scale(0.92, 1.05, 1.06);
      this.sharedGeometries.push(skullGeo);
      const skullMesh = new THREE.Mesh(skullGeo, skullMat);
      skullMesh.position.set(0, 0.045, 0);
      this.registerBoneObject('skull', skullMesh, group);

      // Mandible (lower jaw)
      const jawMat = this.createBoneMaterial('mandible');
      const jawGeo = new THREE.BoxGeometry(0.095, 0.042, 0.088);
      this.sharedGeometries.push(jawGeo);
      const jawMesh = new THREE.Mesh(jawGeo, jawMat);
      jawMesh.position.set(0, -0.042, -0.015);
      this.registerBoneObject('mandible', jawMesh, group);

      // Cervical spine (neck vertebrae)
      const cervMat = this.createBoneMaterial('cervical');
      const cervGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.10, 10);
      this.sharedGeometries.push(cervGeo);
      const cervMesh = new THREE.Mesh(cervGeo, cervMat);
      cervMesh.position.set(0, -0.125, 0.01);
      this.registerBoneObject('cervical', cervMesh, group);
    } else if (id === 'torso') {
      // Left & Right Clavicles
      const clavGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.135, 8);
      clavGeo.rotateZ(Math.PI / 2);
      this.sharedGeometries.push(clavGeo);

      const clavLMat = this.createBoneMaterial('clavicleL');
      const clavL = new THREE.Mesh(clavGeo, clavLMat);
      clavL.position.set(-0.075, 0.185, -0.045);
      clavL.rotation.z = -0.14;
      this.registerBoneObject('clavicleL', clavL, group);

      const clavRMat = this.createBoneMaterial('clavicleR');
      const clavR = new THREE.Mesh(clavGeo, clavRMat);
      clavR.position.set(0.075, 0.185, -0.045);
      clavR.rotation.z = 0.14;
      this.registerBoneObject('clavicleR', clavR, group);

      // Sternum (breastbone)
      const sternMat = this.createBoneMaterial('sternum');
      const sternGeo = new THREE.BoxGeometry(0.042, 0.16, 0.026);
      this.sharedGeometries.push(sternGeo);
      const sternMesh = new THREE.Mesh(sternGeo, sternMat);
      sternMesh.position.set(0, 0.075, -0.088);
      this.registerBoneObject('sternum', sternMesh, group);

      // Left & Right Ribcages (4 curved rib arches per side)
      const ribArcGeo = new THREE.TorusGeometry(0.078, 0.014, 8, 14, Math.PI * 0.85);
      ribArcGeo.rotateX(Math.PI / 2);
      this.sharedGeometries.push(ribArcGeo);

      const ribsLMat = this.createBoneMaterial('ribsL');
      const ribsLGroup = new THREE.Group();
      for (let r = 0; r < 4; r++) {
        const rib = new THREE.Mesh(ribArcGeo, ribsLMat);
        const s = 1 - r * 0.07;
        rib.scale.set(s, 1, s);
        rib.position.set(-0.045, 0.14 - r * 0.045, -0.01);
        rib.rotation.y = Math.PI * 0.58;
        ribsLGroup.add(rib);
      }
      this.registerBoneObject('ribsL', ribsLGroup, group);

      const ribsRMat = this.createBoneMaterial('ribsR');
      const ribsRGroup = new THREE.Group();
      for (let r = 0; r < 4; r++) {
        const rib = new THREE.Mesh(ribArcGeo, ribsRMat);
        const s = 1 - r * 0.07;
        rib.scale.set(s, 1, s);
        rib.position.set(0.045, 0.14 - r * 0.045, -0.01);
        rib.rotation.y = -Math.PI * 0.42;
        ribsRGroup.add(rib);
      }
      this.registerBoneObject('ribsR', ribsRGroup, group);

      // Thoracic spine (upper back)
      const thorMat = this.createBoneMaterial('thoracic');
      const thorGeo = new THREE.CylinderGeometry(0.032, 0.035, 0.20, 10);
      this.sharedGeometries.push(thorGeo);
      const thorMesh = new THREE.Mesh(thorGeo, thorMat);
      thorMesh.position.set(0, 0.08, 0.05);
      this.registerBoneObject('thoracic', thorMesh, group);

      // Lumbar spine (lower back)
      const lumbMat = this.createBoneMaterial('lumbar');
      const lumbGeo = new THREE.CylinderGeometry(0.036, 0.040, 0.16, 10);
      this.sharedGeometries.push(lumbGeo);
      const lumbMesh = new THREE.Mesh(lumbGeo, lumbMat);
      lumbMesh.position.set(0, -0.115, 0.045);
      this.registerBoneObject('lumbar', lumbMesh, group);
    } else if (id === 'pelvis') {
      const iliumGeo = new THREE.TorusGeometry(0.058, 0.022, 8, 14, Math.PI * 1.15);
      this.sharedGeometries.push(iliumGeo);

      const pelvLMat = this.createBoneMaterial('pelvisL');
      const pelvL = new THREE.Mesh(iliumGeo, pelvLMat);
      pelvL.position.set(-0.065, 0.01, 0);
      pelvL.rotation.set(0.3, 0.35, 0.4);
      this.registerBoneObject('pelvisL', pelvL, group);

      const pelvRMat = this.createBoneMaterial('pelvisR');
      const pelvR = new THREE.Mesh(iliumGeo, pelvRMat);
      pelvR.position.set(0.065, 0.01, 0);
      pelvR.rotation.set(0.3, -0.35, -0.4);
      this.registerBoneObject('pelvisR', pelvR, group);

      const sacrumMat = this.createBoneMaterial('sacrum');
      const sacrumGeo = new THREE.CylinderGeometry(0.040, 0.018, 0.12, 8);
      this.sharedGeometries.push(sacrumGeo);
      const sacrum = new THREE.Mesh(sacrumGeo, sacrumMat);
      sacrum.position.set(0, -0.005, 0.03);
      this.registerBoneObject('sacrum', sacrum, group);
    } else if (id === 'upperArmL' || id === 'upperArmR') {
      const boneId: BoneId = id === 'upperArmL' ? 'humerusL' : 'humerusR';
      const mat = this.createBoneMaterial(boneId);
      const shaftGeo = new THREE.CylinderGeometry(0.024, 0.021, cfg.halfHeight * 1.9, 10);
      const knobGeo = new THREE.SphereGeometry(0.034, 10, 10);
      this.sharedGeometries.push(shaftGeo, knobGeo);

      const humGroup = new THREE.Group();
      const shaft = new THREE.Mesh(shaftGeo, mat);
      const topKnob = new THREE.Mesh(knobGeo, mat);
      topKnob.position.y = cfg.halfHeight * 0.92;
      const botKnob = new THREE.Mesh(knobGeo, mat);
      botKnob.position.y = -cfg.halfHeight * 0.92;
      humGroup.add(shaft, topKnob, botKnob);
      this.registerBoneObject(boneId, humGroup, group);
    } else if (id === 'lowerArmL' || id === 'lowerArmR') {
      const radId: BoneId = id === 'lowerArmL' ? 'radiusL' : 'radiusR';
      const ulnId: BoneId = id === 'lowerArmL' ? 'ulnaL' : 'ulnaR';
      const handId: BoneId = id === 'lowerArmL' ? 'handL' : 'handR';

      const boneGeo = new THREE.CylinderGeometry(0.015, 0.015, cfg.halfHeight * 1.85, 8);
      const handGeo = new THREE.BoxGeometry(0.056, 0.078, 0.034);
      this.sharedGeometries.push(boneGeo, handGeo);

      const radMat = this.createBoneMaterial(radId);
      const radMesh = new THREE.Mesh(boneGeo, radMat);
      radMesh.position.set(0, 0.01, -0.017);
      this.registerBoneObject(radId, radMesh, group);

      const ulnMat = this.createBoneMaterial(ulnId);
      const ulnMesh = new THREE.Mesh(boneGeo, ulnMat);
      ulnMesh.position.set(0, 0.01, 0.017);
      this.registerBoneObject(ulnId, ulnMesh, group);

      const handMat = this.createBoneMaterial(handId);
      const handMesh = new THREE.Mesh(handGeo, handMat);
      handMesh.position.set(0, -(cfg.halfHeight + cfg.radius * 0.55), 0);
      this.registerBoneObject(handId, handMesh, group);
    } else if (id === 'upperLegL' || id === 'upperLegR') {
      const femId: BoneId = id === 'upperLegL' ? 'femurL' : 'femurR';
      const patId: BoneId = id === 'upperLegL' ? 'patellaL' : 'patellaR';

      const femMat = this.createBoneMaterial(femId);
      const femShaftGeo = new THREE.CylinderGeometry(0.032, 0.028, cfg.halfHeight * 1.85, 10);
      const femHeadGeo = new THREE.SphereGeometry(0.044, 10, 10);
      this.sharedGeometries.push(femShaftGeo, femHeadGeo);

      const femGroup = new THREE.Group();
      const shaft = new THREE.Mesh(femShaftGeo, femMat);
      shaft.position.y = 0.02;
      const headKnob = new THREE.Mesh(femHeadGeo, femMat);
      headKnob.position.y = cfg.halfHeight * 0.92;
      femGroup.add(shaft, headKnob);
      this.registerBoneObject(femId, femGroup, group);

      const patMat = this.createBoneMaterial(patId);
      const patGeo = new THREE.SphereGeometry(0.036, 10, 10);
      patGeo.scale(1.0, 0.9, 0.65);
      this.sharedGeometries.push(patGeo);
      const patMesh = new THREE.Mesh(patGeo, patMat);
      patMesh.position.set(0, -cfg.halfHeight * 0.92, -0.045);
      this.registerBoneObject(patId, patMesh, group);
    } else if (id === 'lowerLegL' || id === 'lowerLegR') {
      const tibId: BoneId = id === 'lowerLegL' ? 'tibiaL' : 'tibiaR';
      const footId: BoneId = id === 'lowerLegL' ? 'footL' : 'footR';

      const tibMat = this.createBoneMaterial(tibId);
      const tibGeo = new THREE.CylinderGeometry(0.027, 0.022, cfg.halfHeight * 1.85, 10);
      const fibGeo = new THREE.CylinderGeometry(0.013, 0.012, cfg.halfHeight * 1.75, 8);
      this.sharedGeometries.push(tibGeo, fibGeo);

      const shinGroup = new THREE.Group();
      const tib = new THREE.Mesh(tibGeo, tibMat);
      tib.position.set(0.008, 0.01, -0.005);
      const fib = new THREE.Mesh(fibGeo, tibMat);
      fib.position.set(-0.018, 0.01, 0.01);
      shinGroup.add(tib, fib);
      this.registerBoneObject(tibId, shinGroup, group);

      const footMat = this.createBoneMaterial(footId);
      const footGeo = new THREE.BoxGeometry(0.082, 0.052, 0.175);
      this.sharedGeometries.push(footGeo);
      const footMesh = new THREE.Mesh(footGeo, footMat);
      footMesh.position.set(0, -(cfg.halfHeight + 0.045), -0.038);
      this.registerBoneObject(footId, footMesh, group);
    }
  }

  private createJoints(physics: PhysicsWorld): void {
    const w = physics.world;
    const getBody = (id: BodyPartId) => this.parts.get(id)!.body;

    const spineJoint = RAPIER.JointData.spherical(
      { x: 0, y: 0.16, z: 0 },
      { x: 0, y: -0.26, z: 0 }
    );
    this.joints.push(w.createImpulseJoint(spineJoint, getBody('pelvis'), getBody('torso'), false));

    const neckJoint = RAPIER.JointData.spherical(
      { x: 0, y: 0.28, z: 0 },
      { x: 0, y: -0.18, z: 0 }
    );
    this.joints.push(w.createImpulseJoint(neckJoint, getBody('torso'), getBody('head'), false));

    const shoulderL = RAPIER.JointData.spherical(
      { x: -0.20, y: 0.14, z: 0 },
      { x: 0, y: 0.14, z: 0 }
    );
    this.joints.push(w.createImpulseJoint(shoulderL, getBody('torso'), getBody('upperArmL'), false));

    const shoulderR = RAPIER.JointData.spherical(
      { x: 0.20, y: 0.14, z: 0 },
      { x: 0, y: 0.14, z: 0 }
    );
    this.joints.push(w.createImpulseJoint(shoulderR, getBody('torso'), getBody('upperArmR'), false));

    const elbowL = RAPIER.JointData.revolute(
      { x: 0, y: -0.17, z: 0 },
      { x: 0, y: 0.17, z: 0 },
      { x: 0, y: 0, z: 1 }
    );
    elbowL.limitsEnabled = true;
    elbowL.limits = [-0.1, 2.2];
    this.joints.push(w.createImpulseJoint(elbowL, getBody('upperArmL'), getBody('lowerArmL'), false));

    const elbowR = RAPIER.JointData.revolute(
      { x: 0, y: -0.17, z: 0 },
      { x: 0, y: 0.17, z: 0 },
      { x: 0, y: 0, z: 1 }
    );
    elbowR.limitsEnabled = true;
    elbowR.limits = [-2.2, 0.1];
    this.joints.push(w.createImpulseJoint(elbowR, getBody('upperArmR'), getBody('lowerArmR'), false));

    const hipL = RAPIER.JointData.spherical(
      { x: -0.13, y: -0.12, z: 0 },
      { x: 0, y: 0.26, z: 0 }
    );
    this.joints.push(w.createImpulseJoint(hipL, getBody('pelvis'), getBody('upperLegL'), false));

    const hipR = RAPIER.JointData.spherical(
      { x: 0.13, y: -0.12, z: 0 },
      { x: 0, y: 0.26, z: 0 }
    );
    this.joints.push(w.createImpulseJoint(hipR, getBody('pelvis'), getBody('upperLegR'), false));

    const kneeL = RAPIER.JointData.revolute(
      { x: 0, y: -0.23, z: 0 },
      { x: 0, y: 0.23, z: 0 },
      { x: 1, y: 0, z: 0 }
    );
    kneeL.limitsEnabled = true;
    kneeL.limits = [-2.1, 0.08];
    this.joints.push(w.createImpulseJoint(kneeL, getBody('upperLegL'), getBody('lowerLegL'), false));

    const kneeR = RAPIER.JointData.revolute(
      { x: 0, y: -0.23, z: 0 },
      { x: 0, y: 0.23, z: 0 },
      { x: 1, y: 0, z: 0 }
    );
    kneeR.limitsEnabled = true;
    kneeR.limits = [-2.1, 0.08];
    this.joints.push(w.createImpulseJoint(kneeR, getBody('upperLegR'), getBody('lowerLegR'), false));
  }

  public updateStandingWalk(dt: number, moveX: number, moveZ: number): boolean {
    if (!this.isStandingPreLaunch) return false;

    const speed = CONFIG.RAGDOLL.MAX_WALK_SPEED;
    this.standOrigin.x = THREE.MathUtils.clamp(
      this.standOrigin.x + moveX * speed * dt,
      -74.0,
      74.0
    );
    this.standOrigin.z = THREE.MathUtils.clamp(
      this.standOrigin.z + moveZ * speed * dt,
      -8.5,
      14.0
    );

    const isMoving = Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01;
    if (isMoving) {
      this.walkAnimPhase += dt * 11;
    } else {
      this.walkAnimPhase = 0;
    }

    const swing = Math.sin(this.walkAnimPhase) * 0.35;

    for (const [id, part] of this.parts.entries()) {
      const off = this.partOffsets.get(id)!;
      let dz = off.dz;
      let pitchX = 0;

      if (id === 'upperLegL' || id === 'lowerLegL') {
        dz += swing * 0.22;
        pitchX = swing;
      } else if (id === 'upperLegR' || id === 'lowerLegR') {
        dz -= swing * 0.22;
        pitchX = -swing;
      }

      part.body.setTranslation(
        {
          x: this.standOrigin.x + off.dx,
          y: this.standOrigin.y + off.dy,
          z: this.standOrigin.z + dz,
        },
        true
      );
      part.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      part.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

      if (off.rotZ !== 0) {
        this.tmpQuat.setFromAxisAngle(this.zAxis, off.rotZ);
      } else {
        this.tmpQuat.setFromAxisAngle(this.xAxis, pitchX);
      }
      part.body.setRotation(
        { x: this.tmpQuat.x, y: this.tmpQuat.y, z: this.tmpQuat.z, w: this.tmpQuat.w },
        true
      );
    }

    return this.standOrigin.z <= -8.1;
  }

  public launch(forwardDir: THREE.Vector3, powerMultiplier: number): void {
    this.isStandingPreLaunch = false;
    const vx = forwardDir.x * CONFIG.RAGDOLL.BASE_LAUNCH_SPEED_FORWARD * powerMultiplier;
    const vy = CONFIG.RAGDOLL.BASE_LAUNCH_SPEED_UP * powerMultiplier;
    const vz = forwardDir.z * CONFIG.RAGDOLL.BASE_LAUNCH_SPEED_FORWARD * powerMultiplier;

    for (const part of this.parts.values()) {
      part.body.setGravityScale(1.0, true);
      part.body.wakeUp();
      part.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    }

    const torso = this.parts.get('torso');
    const head = this.parts.get('head');
    if (torso) {
      torso.body.setAngvel(
        {
          x: -CONFIG.RAGDOLL.INITIAL_ANGULAR_IMPULSE,
          y: (Math.random() - 0.5) * 2.5,
          z: (Math.random() - 0.5) * 2.2,
        },
        true
      );
    }
    if (head) {
      head.body.setLinvel({ x: vx, y: vy * 0.9, z: vz * 1.18 }, true);
    }
  }

  public applyAirSteering(steerX: number, steerZ: number, dt: number): void {
    if (this.isStandingPreLaunch) return;
    if (Math.abs(steerX) < 0.01 && Math.abs(steerZ) < 0.01) return;

    const accel = CONFIG.RAGDOLL.AIR_STEER_ACCEL * dt;
    const torso = this.parts.get('torso');
    const pelvis = this.parts.get('pelvis');
    for (const p of [torso, pelvis]) {
      if (!p) continue;
      p.body.wakeUp();
      const v = p.body.linvel();
      p.body.setLinvel(
        {
          x: v.x + steerX * accel,
          y: v.y,
          z: v.z + steerZ * accel,
        },
        true
      );
    }
  }

  public applyDirectionalKick(nx: number, ny: number, nz: number, speedDelta: number): void {
    for (const part of this.parts.values()) {
      part.body.setGravityScale(1.0, true);
      part.body.wakeUp();
      const v = part.body.linvel();
      part.body.setLinvel(
        {
          x: v.x + nx * speedDelta,
          y: v.y + ny * speedDelta,
          z: v.z + nz * speedDelta,
        },
        true
      );
    }
  }

  public setBoneDamageVisual(boneId: BoneId, stage: BoneDamageStage): void {
    const boneMat = this.boneMaterials.get(boneId);
    const boneObj = this.boneMeshes.get(boneId);
    if (!boneMat || !boneObj) return;

    if (stage === 'broken') {
      boneMat.color.setHex(0xff2a2a);
      boneMat.emissive.setHex(0xff0000);
      boneMat.emissiveIntensity = 1.65;
      boneObj.scale.set(1.22, 1.08, 1.22);
      boneObj.rotation.z += 0.22;
      boneObj.rotation.x += 0.14;

      // Add a glowing crimson fracture ring around the broken bone
      const ringGeo = new THREE.TorusGeometry(0.042, 0.011, 8, 16);
      ringGeo.rotateX(Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff4d4d,
      });
      this.sharedGeometries.push(ringGeo);
      this.sharedMaterials.push(ringMat);
      const fractureRing = new THREE.Mesh(ringGeo, ringMat);
      fractureRing.renderOrder = 1;
      boneObj.add(fractureRing);
    } else if (stage === 'dislocated') {
      boneMat.color.setHex(0xfb923c);
      boneMat.emissive.setHex(0xea580c);
      boneMat.emissiveIntensity = 1.15;
      boneObj.scale.set(1.12, 1.04, 1.12);
      boneObj.rotation.z += 0.12;
    } else if (stage === 'sprained') {
      boneMat.color.setHex(0xfde047);
      boneMat.emissive.setHex(0xeab308);
      boneMat.emissiveIntensity = 0.85;
    }
  }

  public setPartDamageVisual(partId: BodyPartId, stage: BoneDamageStage): void {
    const part = this.parts.get(partId);
    if (!part) return;

    const severityOrder: Record<BoneDamageStage, number> = {
      healthy: 0,
      sprained: 1,
      dislocated: 2,
      broken: 3,
    };
    const prevStage = this.partDamageStage.get(partId) ?? 'healthy';
    if (severityOrder[stage] <= severityOrder[prevStage]) return;
    this.partDamageStage.set(partId, stage);

    if (stage === 'broken') {
      part.material.color.setHex(0xef4444);
      part.material.emissive.setHex(0x991b1b);
      part.material.emissiveIntensity = 0.35;
      part.material.opacity = 0.22;

      const jointIdxMap: Partial<Record<BodyPartId, number>> = {
        lowerArmL: 4,
        lowerArmR: 5,
        lowerLegL: 8,
        lowerLegR: 9,
      };
      const jIdx = jointIdxMap[partId];
      if (jIdx !== undefined && this.joints[jIdx]) {
        const rev = this.joints[jIdx] as RAPIER.RevoluteImpulseJoint;
        if (typeof rev.setLimits === 'function') {
          rev.setLimits(-2.75, 2.75);
        }
      }
    } else if (stage === 'dislocated') {
      part.material.color.setHex(0xf97316);
      part.material.emissive.setHex(0x9a3412);
      part.material.emissiveIntensity = 0.28;
      part.material.opacity = 0.24;
    } else if (stage === 'sprained') {
      part.material.emissive.setHex(0x854d0e);
      part.material.emissiveIntensity = 0.22;
    }
  }

  public applyBasinBraking(dt: number): void {
    if (this.isStandingPreLaunch) return;
    const damp = Math.exp(-dt * 4.5);
    for (const part of this.parts.values()) {
      const v = part.body.linvel();
      const w = part.body.angvel();
      part.body.setLinvel({ x: v.x * damp, y: v.y * damp, z: v.z * damp }, true);
      part.body.setAngvel({ x: w.x * damp, y: w.y * damp, z: w.z * damp }, true);
    }
  }

  public capturePreStepState(): void {
    for (const part of this.parts.values()) {
      part.prevPos.copy(part.currPos);
      part.prevRot.copy(part.currRot);
      const v = part.body.linvel();
      part.prevVel.set(v.x, v.y, v.z);
    }
  }

  public capturePostStepState(): void {
    for (const part of this.parts.values()) {
      const t = part.body.translation();
      const r = part.body.rotation();
      part.currPos.set(t.x, t.y, t.z);
      part.currRot.set(r.x, r.y, r.z, r.w);
    }
  }

  public syncRenderInterpolation(alpha: number): void {
    for (const part of this.parts.values()) {
      this.tmpVec.lerpVectors(part.prevPos, part.currPos, alpha);
      this.tmpQuat.slerpQuaternions(part.prevRot, part.currRot, alpha);
      part.mesh.position.copy(this.tmpVec);
      part.mesh.quaternion.copy(this.tmpQuat);
    }
  }

  public getTorsoPosition(out: THREE.Vector3): THREE.Vector3 {
    const torso = this.parts.get('torso');
    if (!torso) return out.set(0, 0, 0);
    return out.copy(torso.mesh.position);
  }

  public getTorsoVelocity(out: THREE.Vector3): THREE.Vector3 {
    const torso = this.parts.get('torso');
    if (!torso) return out.set(0, 0, 0);
    const v = torso.body.linvel();
    return out.set(v.x, v.y, v.z);
  }

  public getTorsoSpeed(): number {
    const torso = this.parts.get('torso');
    if (!torso) return 0;
    const v = torso.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  public disposeVisuals(): void {
    while (this.rootGroup.children.length > 0) {
      this.rootGroup.remove(this.rootGroup.children[0]);
    }
    for (const g of this.sharedGeometries) {
      g.dispose();
    }
    for (const m of this.sharedMaterials) {
      m.dispose();
    }
    this.sharedGeometries = [];
    this.sharedMaterials = [];
  }
}
