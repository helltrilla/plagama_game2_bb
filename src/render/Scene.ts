import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { CONFIG, type QualityPreset } from '../config';

export class GameScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public dirLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  private sky: Sky;
  private sunVec = new THREE.Vector3();
  private currentQuality: QualityPreset = 'high';

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x38bdf8);
    this.scene.fog = new THREE.FogExp2(0x93c5fd, 0.0018);

    this.camera = new THREE.PerspectiveCamera(
      66,
      window.innerWidth / window.innerHeight,
      0.35,
      12000
    );
    this.camera.position.set(0, 100, 15);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, CONFIG.PERFORMANCE.MAX_PIXEL_RATIO)
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    container.appendChild(this.renderer.domElement);

    // Procedural HDR PMREM Environment for rich PBR specular/metallic reflections on helmet, rocks, ice & water
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const envScene = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    pmremGenerator.dispose();

    // Physical Rayleigh/Mie Atmospheric Sky Dome
    this.sky = new Sky();
    this.sky.scale.setScalar(16000);
    this.scene.add(this.sky);

    // Warm Golden-Hour / Alpine Sunlight + Sky Hemisphere Bounce Light
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.8);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 2.3);
    this.dirLight.position.set(85, 140, 75);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 520;
    const d = 135;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.04;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    this.setAtmosphere(28, 145, 2.2, 0.00014, 0xbae6fd);

    this.onResize();
    window.addEventListener('resize', this.onResize);
  }

  public setAtmosphere(
    sunElevationDeg: number,
    sunAzimuthDeg: number,
    turbidity: number,
    fogDensity: number,
    fogColorHex: number
  ): void {
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = turbidity;
    uniforms['rayleigh'].value = 1.6;
    uniforms['mieCoefficient'].value = 0.005;
    uniforms['mieDirectionalG'].value = 0.82;

    const phi = THREE.MathUtils.degToRad(90 - sunElevationDeg);
    const theta = THREE.MathUtils.degToRad(sunAzimuthDeg);
    this.sunVec.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(this.sunVec);

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(fogColorHex);
      this.scene.fog.density = fogDensity;
    }
  }

  public applyQuality(quality: QualityPreset): void {
    this.currentQuality = quality;
    const isMobile = window.innerWidth < 768;

    if (quality === 'low') {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.dirLight.castShadow = false;
    } else if (quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.4));
      this.renderer.shadowMap.enabled = true;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(1024, 1024);
      this.dirLight.shadow.map?.dispose();
      this.dirLight.shadow.map = null;
    } else {
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, CONFIG.PERFORMANCE.MAX_PIXEL_RATIO)
      );
      this.renderer.shadowMap.enabled = true;
      this.dirLight.castShadow = true;
      const size = isMobile ? 1024 : 2048;
      this.dirLight.shadow.mapSize.set(size, size);
      this.dirLight.shadow.map?.dispose();
      this.dirLight.shadow.map = null;
    }
  }

  public getQuality(): QualityPreset {
    return this.currentQuality;
  }

  public updateShadowFollow(targetPos: THREE.Vector3): void {
    this.dirLight.target.position.copy(targetPos);
    this.dirLight.position.set(
      targetPos.x + this.sunVec.x * 75,
      targetPos.y + Math.max(35, this.sunVec.y * 85),
      targetPos.z + this.sunVec.z * 75
    );
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 60;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
