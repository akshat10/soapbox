// @ts-check
import * as THREE from 'three';

/** @typedef {'mobile' | 'desktop'} LightingQuality */
/** @typedef {{shadowSize: number, raceExtent: number, showroomExtent: number, environmentSize: number, pixelRatio: number}} QualitySettings */

/** Colors are sRGB author values; Three converts Color(hex) to linear light. */
export const REFERENCE_LOOK = Object.freeze({
  exposure: 1.0,
  keyColor: 0xffe3b4,
  keyIntensity: 3.4,
  fillColor: 0xadc9f1,
  fillIntensity: 0.55,
  skyColor: 0xb8d5ee,
  bounceColor: 0x806b55,
  hemisphereIntensity: 0.28,
  environmentIntensity: 0.85,
  background: 0xb8d8cb,
  studioBackground: 0x3d4547,
  studioGround: 0x777b76,
  studioCamera: [6, 4.8, 7],
  studioKey: [-1.8, 2.8, 2.6],
});

/** @type {Record<LightingQuality, QualitySettings>} */
const QUALITY = {
  mobile: { shadowSize: 1024, raceExtent: 23, showroomExtent: 12, environmentSize: 128, pixelRatio: 1.5 },
  desktop: { shadowSize: 2048, raceExtent: 23, showroomExtent: 12, environmentSize: 256, pixelRatio: 1.5 },
};

/**
 * One static HDR reflection texture, generated during loading. The panels exist
 * only in this temporary capture scene, never in the game or an exported GLB.
 * Their dark gaps are essential: uniformly bright environments turn foil white.
 * @param {THREE.WebGLRenderer} renderer
 * @param {number} size
 */
function createReflectionEnvironment(renderer, size) {
  const source = new THREE.Scene();
  const colors = [0x6e7c88, 0x626c71, 0xadc4d4, 0x43382f, 0x798480, 0x566473];
  const walls = colors.map(color => new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  source.add(new THREE.Mesh(new THREE.BoxGeometry(60, 60, 60), walls));
  /** @param {number[]} xyz @param {number[]} scale @param {number} color @param {number} radiance */
  const panel = (xyz, scale, color, radiance) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(radiance),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale[0], scale[1]), material);
    mesh.position.set(xyz[0], xyz[1], xyz[2]);
    mesh.lookAt(0, 0, 0);
    source.add(mesh);
  };
  panel([-9, 14, 13], [8, 6], 0xffe7c5, 5.0);
  panel([11, 5.5, 6.5], [4, 10], 0xc5ddff, 2.4);
  panel([1.5, 11, -10.5], [7, 3], 0xffffff, 3.0);
  // Neutral side card reflects toward the positive-X reference camera through
  // crumpled foil's side normals. It prevents the entire wrap becoming blue.
  panel([14, 7, -9], [9, 12], 0xf1f3f5, 4.5);
  // Narrow black flag separates a bright stripe from the broader sky reflection.
  panel([-7, 2, -10], [3, 9], 0x161d26, 0.5);
  const generator = new THREE.PMREMGenerator(renderer);
  let result;
  try {
    result = generator.fromScene(source, 0.015, 0.1, 100, { size });
    result.texture.name = 'SF reference studio reflection';
  } finally {
    generator.dispose();
    source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    });
  }
  return result;
}

class SceneLightRig {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Texture} environment
   * @param {QualitySettings} settings
   * @param {boolean} race
   */
  constructor(scene, environment, settings, race) {
    this.scene = scene;
    this.previousEnvironment = scene.environment;
    this.previousIntensity = scene.environmentIntensity;
    this.previousRotation = scene.environmentRotation.clone();
    this.group = new THREE.Group();
    this.group.name = race ? 'SF race lighting' : 'SF showroom lighting';
    this.key = new THREE.DirectionalLight(REFERENCE_LOOK.keyColor, REFERENCE_LOOK.keyIntensity);
    this.key.name = 'SF warm key';
    this.fill = new THREE.DirectionalLight(REFERENCE_LOOK.fillColor, REFERENCE_LOOK.fillIntensity);
    this.fill.name = 'SF cool fill (no shadow map)';
    this.hemisphere = new THREE.HemisphereLight(REFERENCE_LOOK.skyColor, REFERENCE_LOOK.bounceColor, REFERENCE_LOOK.hemisphereIntensity);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(settings.shadowSize, settings.shadowSize);
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 150;
    const extent = race ? settings.raceExtent : settings.showroomExtent;
    this.key.shadow.camera.left = -extent;
    this.key.shadow.camera.right = extent;
    this.key.shadow.camera.top = extent;
    this.key.shadow.camera.bottom = -extent;
    this.key.shadow.camera.updateProjectionMatrix();
    this.key.shadow.bias = -0.00012;
    this.key.shadow.normalBias = race ? 0.025 : 0.012;
    this.key.shadow.radius = 2.5;
    this.key.shadow.autoUpdate = false;
    this.direction = new THREE.Vector3(-1.8, 2.8, race ? -2.6 : 2.6).normalize();
    this.right = new THREE.Vector3().crossVectors(THREE.Object3D.DEFAULT_UP, this.direction).normalize();
    this.up = new THREE.Vector3().crossVectors(this.direction, this.right).normalize();
    this.snapped = new THREE.Vector3();
    this.texel = extent * 2 / settings.shadowSize;
    this.fillDirection = new THREE.Vector3(2.2, 1.1, race ? -1.3 : 1.3).normalize();
    this.group.add(this.key, this.key.target, this.fill, this.fill.target, this.hemisphere);
    scene.add(this.group);
    scene.environment = environment;
    scene.environmentIntensity = REFERENCE_LOOK.environmentIntensity;
    const studioAzimuth = Math.atan2(-1.8, 2.6);
    scene.environmentRotation.set(0, Math.atan2(this.direction.x, this.direction.z) - studioAzimuth, 0);
    this.updateFocus(new THREE.Vector3(0, 1, 0));
  }

  /** Update immediately before rendering THIS scene/viewport. @param {THREE.Vector3} focus */
  updateFocus(focus) {
    // Snap in the light camera's two transverse axes to reduce crawl on asphalt.
    const x = Math.round(focus.dot(this.right) / this.texel) * this.texel;
    const y = Math.round(focus.dot(this.up) / this.texel) * this.texel;
    this.snapped.copy(this.right).multiplyScalar(x)
      .addScaledVector(this.up, y)
      .addScaledVector(this.direction, focus.dot(this.direction));
    this.key.target.position.copy(this.snapped);
    this.key.position.copy(this.snapped).addScaledVector(this.direction, 70);
    this.fill.target.position.copy(focus);
    this.fill.position.copy(focus).addScaledVector(this.fillDirection, 40);
    this.key.target.updateMatrixWorld();
    this.fill.target.updateMatrixWorld();
    this.key.shadow.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.key.dispose();
    this.fill.dispose();
    this.hemisphere.dispose();
    this.scene.environment = this.previousEnvironment;
    this.scene.environmentIntensity = this.previousIntensity;
    this.scene.environmentRotation.copy(this.previousRotation);
  }
}

/**
 * Own once per WebGLRenderer. Remove the old lights first; this class does not
 * delete callers' lights, materials, backgrounds, fog, or geometry.
 */
export class ReferenceLighting {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{raceScene?: THREE.Scene, showroomScene?: THREE.Scene, quality?: LightingQuality}} options
   */
  constructor(renderer, { raceScene, showroomScene, quality = 'mobile' } = {}) {
    this.renderer = renderer;
    this.settings = QUALITY[quality];
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = REFERENCE_LOOK.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    this.environment = createReflectionEnvironment(renderer, this.settings.environmentSize);
    this.race = raceScene ? new SceneLightRig(raceScene, this.environment.texture, this.settings, true) : undefined;
    this.showroom = showroomScene ? new SceneLightRig(showroomScene, this.environment.texture, this.settings, false) : undefined;
    this.showroomFocus = new THREE.Vector3(0, 1, 0);
  }

  /** @param {THREE.Vector3} focus Road position 8–12 units ahead of this viewport's racer. */
  prepareRaceView(focus) {
    this.race?.updateFocus(focus);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** @param {THREE.Vector3} [focus] Center of displayed build(s), not camera position. */
  prepareShowroom(focus = this.showroomFocus) {
    this.showroom?.updateFocus(focus);
    this.renderer.shadowMap.needsUpdate = true;
  }

  dispose() {
    this.race?.dispose();
    this.showroom?.dispose();
    this.environment.dispose();
  }
}

/**
 * Optional replacement for the hard-edged CircleGeometry already in renderer.ts.
 * One 64px alpha texture shared by all racers. No AO or full-screen render pass.
 * @returns {THREE.DataTexture}
 */
export function createContactShadowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const alpha = Math.pow(Math.max(0, 1 - radius * radius), 2.5);
    const offset = (y * size + x) * 4;
    data.set([255, 255, 255, Math.round(alpha * 255)], offset);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class VehicleContactShadow {
  /** @param {THREE.Texture} sharedTexture @param {number} width @param {number} length */
  constructor(sharedTexture, width, length) {
    this.material = new THREE.MeshBasicMaterial({
      map: sharedTexture, color: 0x101921, opacity: 0.28,
      transparent: true, depthWrite: false, polygonOffset: true,
      polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.name = 'SF soft ground contact';
    this.width = width;
    this.length = length;
    this.normal = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
  }

  /**
   * gap is height above NORMAL grounded ride height, not chassis-origin Y.
   * Sample the ground normal from the same collision/track height function.
   * @param {THREE.Vector3} groundPosition
   * @param {number} gap
   * @param {number} [yaw]
   * @param {THREE.Vector3} [groundNormal]
   */
  update(groundPosition, gap, yaw = 0, groundNormal = THREE.Object3D.DEFAULT_UP) {
    gap = Math.max(0, gap);
    this.normal.copy(groundNormal).normalize();
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.right.crossVectors(this.normal, this.forward).normalize();
    this.up.crossVectors(this.normal, this.right).normalize();
    this.matrix.makeBasis(this.right, this.up, this.normal);
    this.mesh.quaternion.setFromRotationMatrix(this.matrix);
    this.mesh.position.copy(groundPosition).addScaledVector(this.normal, 0.025);
    const spread = 1 + Math.min(gap, 3) * 0.14;
    this.mesh.scale.set(this.width * spread, this.length * spread, 1);
    this.material.opacity = 0.28 * Math.exp(-gap * 1.15);
    this.mesh.visible = gap < 3.5;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    // The caller owns and disposes the shared texture after every car is removed.
  }
}
