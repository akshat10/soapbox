import * as THREE from 'three';
import { createVehicleModel, createWheelModel, createTrackScene } from './visuals';
import { getBody, getWheel } from './catalogue';
import { groundHeight } from './track';
import { RaceEffects } from './race-effects';
import { PLAYER_COLORS } from './race';
import { batchStaticTrack } from './scene-batch';
import type { Blueprint, PlayerId, Stage, VehicleSnapshot } from './types';

const COLORS = PLAYER_COLORS.map(color => new THREE.Color(color).getHex());
const MAX_RACERS = 4;
export const CHASE_CAMERA = {
 fov: 58,
 far: 215,
 speedFov: 6,
 fullSpeed: 15,
 distance: 10.7,
 height: 5.6,
 shoulder: 0.45,
 lookAhead: 12.8,
 lookHeight: 0.9,
 portraitAimDrop: 1.4,
 positionResponse: 9,
 verticalResponse: 4.5,
 aimResponse: 7,
 fovResponse: 2.5,
 jumpFollow: 0.22,
 maxJumpFollow: 1.25,
 teleportDistance: 14,
} as const;

type Car = { chassis: THREE.Group; wheels: THREE.Group[]; shadow: THREE.Mesh; effects: RaceEffects };
type CameraRig = { ready: boolean; aim: THREE.Vector3; previousPosition: THREE.Vector3; recovering: boolean; recoveries: number };
type Viewport = { x: number; y: number; width: number; height: number };
const smooth = (response: number, dt: number) => 1 - Math.exp(-response * dt);

/** Follow the road envelope, keeping the camera steady above short holes and bumps. */
function cameraRoadHeight(z: number) {
 return Math.max(groundHeight(z), groundHeight(z - 4.5), groundHeight(z + 4.5));
}

export class DerbyRenderer {
 renderer: THREE.WebGLRenderer;
 scene = new THREE.Scene();
 showroom = new THREE.Scene();
 cameras = Array.from({ length: MAX_RACERS }, () => new THREE.PerspectiveCamera(CHASE_CAMERA.fov, 1, 0.1, CHASE_CAMERA.far));
 showroomCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
 cars: Car[] = [];
 previewCars: THREE.Group[] = [];
 parent: HTMLElement;
 width = 1;
 height = 1;
 resizeObserver: ResizeObserver;
 private plinths: THREE.Mesh[] = [];
 private cameraRigs: CameraRig[] = Array.from({ length: MAX_RACERS }, () => ({ ready: false, aim: new THREE.Vector3(), previousPosition: new THREE.Vector3(), recovering: false, recoveries: 0 }));
 private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
 private reducedMotion = this.motionPreference.matches;
 private onMotionPreference = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };
 private raceLight: THREE.DirectionalLight | null = null;
 private positionTarget = new THREE.Vector3();
 private aimTarget = new THREE.Vector3();

 constructor(parent: HTMLElement) {
  this.parent = parent;
  this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  this.renderer.shadowMap.enabled = true;
  this.renderer.shadowMap.type = THREE.PCFShadowMap;
  this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure = 1.25;
  parent.appendChild(this.renderer.domElement);
  this.scene.background = new THREE.Color(0xade2ef);
  this.scene.fog = new THREE.Fog(0xade2ef, 85, 205);
  this.showroom.background = new THREE.Color(0xafdcd9);
  for (const scene of [this.scene, this.showroom]) {
   scene.add(new THREE.HemisphereLight(0xfffbdd, 0x4b7a67, 2.5));
   const light = new THREE.DirectionalLight(0xfff3d6, 3);
   light.position.set(-20, 50, -25);
   light.castShadow = true;
   light.shadow.mapSize.set(2048, 2048);
   light.shadow.camera.left = -35;
   light.shadow.camera.right = 35;
   light.shadow.camera.top = 40;
   light.shadow.camera.bottom = -35;
   light.shadow.camera.far = 130;
   light.shadow.bias = -0.0007;
   scene.add(light);
   scene.add(light.target);
   if (scene === this.scene) this.raceLight = light;
  }
  this.scene.add(batchStaticTrack(createTrackScene()));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xafdcd9, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  this.showroom.add(floor);
  for (let i = 0; i < MAX_RACERS; i++) {
   const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.9, 0.35, 48), new THREE.MeshStandardMaterial({ color: COLORS[i], roughness: 0.7 }));
   plinth.receiveShadow = true;
   this.showroom.add(plinth);
   this.plinths.push(plinth);
  }
  this.showroomCamera.position.set(-13, 13, 22);
  this.showroomCamera.lookAt(0, 0.8, 0);
  this.motionPreference.addEventListener('change', this.onMotionPreference);
  this.resizeObserver = new ResizeObserver(() => this.resize());
  this.resizeObserver.observe(parent);
  this.resize();
 }

 resize() {
  this.width = Math.max(1, this.parent.clientWidth);
  this.height = Math.max(1, this.parent.clientHeight);
  this.renderer.setSize(this.width, this.height, false);
  this.showroomCamera.aspect = this.width / this.height;
  this.showroomCamera.updateProjectionMatrix();
 }

 setBuilds(builds: Blueprint[]) {
  for (const car of this.cars) {
   this.scene.remove(car.chassis, car.shadow, car.effects.group, ...car.wheels);
   this.disposeObjects([car.chassis, car.shadow, car.effects.group, ...car.wheels]);
  }
  for (const car of this.previewCars) { this.showroom.remove(car); this.disposeObjects([car]); }
  this.cars = [];
  this.previewCars = [];
  this.cameraRigs.forEach(rig => { rig.ready = false; });
  this.plinths.forEach((plinth, index) => { plinth.visible = index < builds.length; });
  builds.slice(0, MAX_RACERS).forEach((build, i) => {
   const chassis = createVehicleModel(build, COLORS[i]);
   const wheels = Array.from({ length: 4 }, () => createWheelModel(build, COLORS[i]));
   const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ color: 0x101b20, transparent: true, opacity: 0.18, depthWrite: false }));
   shadow.rotation.x = -Math.PI / 2;
   const effects = new RaceEffects(COLORS[i]);
   this.scene.add(chassis, shadow, effects.group, ...wheels);
   this.cars.push({ chassis, wheels, shadow, effects });
   const preview = new THREE.Group();
   const body = getBody(build.bodyId), wheel = getWheel(build.wheelId);
   const model = createVehicleModel(build, COLORS[i]);
   model.position.y = body.height / 2 + wheel.radius * 0.95 + 0.12;
   preview.add(model);
   const factor = { short: 0.62, standard: 0.7, long: 0.9 }[build.wheelbase];
   for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const w = createWheelModel(build, COLORS[i]);
    w.position.set(x * (body.width / 2 + 0.13), wheel.radius + 0.16, z * body.length * factor / 2);
    preview.add(w);
   }
   const x = builds.length > 2 ? (i % 2 === 0 ? -3.5 : 3.5) : (i === 0 ? -2 : 2);
   const z = builds.length > 2 ? (i < 2 ? -3 : 3) : (i === 0 ? -1.2 : 1.2);
   preview.position.set(x, 0, z);
   preview.rotation.y = i % 2 === 0 ? -0.15 : 0.12;
   this.plinths[i].position.set(x, -0.08, z);
   this.showroom.add(preview);
   this.previewCars.push(preview);
  });
 }

 private viewport(index: number, count: number, focused: boolean): Viewport {
  if (focused || count === 1) return { x: 0, y: 0, width: this.width, height: this.height };
  if (count > 2) {
   const column = index % 2, row = index < 2 ? 1 : 0;
   const width = Math.floor(this.width / 2), height = Math.floor(this.height / 2);
   return { x: column * width, y: row * height, width, height };
  }
  const horizontal = this.width > 780;
  const width = horizontal ? Math.floor(this.width / 2) : this.width;
  const height = horizontal ? this.height : Math.floor(this.height / 2);
  return { x: horizontal ? index * width : 0, y: horizontal ? 0 : (1 - index) * height, width, height };
 }

 private updateCamera(snapshot: VehicleSnapshot, dt: number, aspect: number, focused: boolean) {
  const camera = this.cameras[snapshot.id], rig = this.cameraRigs[snapshot.id];
  const road = cameraRoadHeight(snapshot.position.z);
  const jumpHeight = Math.max(0, snapshot.position.y - road - 1.1);
  const hopLift = this.reducedMotion ? 0 : Math.min(CHASE_CAMERA.maxJumpFollow, jumpHeight * CHASE_CAMERA.jumpFollow);
  const narrow = aspect < 0.7;
  this.positionTarget.set(
   snapshot.position.x + (snapshot.id % 2 === 0 ? -1 : 1) * CHASE_CAMERA.shoulder,
   road + CHASE_CAMERA.height + hopLift + (narrow ? 0.65 : 0),
   snapshot.position.z - CHASE_CAMERA.distance - (narrow ? 1.8 : 0),
  );
  const portraitAimDrop = focused && aspect < 0.8 ? CHASE_CAMERA.portraitAimDrop : 0;
  this.aimTarget.set(snapshot.position.x, cameraRoadHeight(snapshot.position.z + CHASE_CAMERA.lookAhead) + CHASE_CAMERA.lookHeight - portraitAimDrop, snapshot.position.z + CHASE_CAMERA.lookAhead);

  const teleported = rig.previousPosition.distanceToSquared(snapshot.position) > CHASE_CAMERA.teleportDistance ** 2;
  const recovered = rig.recovering !== snapshot.recovering || rig.recoveries !== snapshot.recoveries;
  if (!rig.ready || teleported || recovered) {
   // A reset is an immediate reframe, never a backwards flight over the course.
   camera.position.copy(this.positionTarget);
   rig.aim.copy(this.aimTarget);
   rig.ready = true;
  } else {
   camera.position.x = THREE.MathUtils.lerp(camera.position.x, this.positionTarget.x, smooth(CHASE_CAMERA.positionResponse, dt));
   camera.position.y = THREE.MathUtils.lerp(camera.position.y, this.positionTarget.y, smooth(CHASE_CAMERA.verticalResponse, dt));
   camera.position.z = THREE.MathUtils.lerp(camera.position.z, this.positionTarget.z, smooth(CHASE_CAMERA.positionResponse, dt));
   rig.aim.lerp(this.aimTarget, smooth(CHASE_CAMERA.aimResponse, dt));
  }
  const speed = THREE.MathUtils.clamp(snapshot.speed / CHASE_CAMERA.fullSpeed, 0, 1);
  const fov = CHASE_CAMERA.fov + (this.reducedMotion ? 0 : speed * CHASE_CAMERA.speedFov);
  camera.fov = THREE.MathUtils.lerp(camera.fov, fov, smooth(CHASE_CAMERA.fovResponse, dt));
  camera.lookAt(rig.aim);
  rig.previousPosition.copy(snapshot.position);
  rig.recovering = snapshot.recovering;
  rig.recoveries = snapshot.recoveries;
 }

 /** Focused mode gives a phone one full-screen racer; omitted focus is the shared race TV. */
 render(stage: Stage, snapshots: VehicleSnapshot[], dt: number, time: number, focusPlayerId?: PlayerId) {
  const frameDt = Math.min(Math.max(dt, 0), 0.1);
  const focused = focusPlayerId !== undefined;
  if (stage === 'garage') {
   this.renderer.setScissorTest(false);
   this.renderer.setViewport(0, 0, this.width, this.height);
   this.previewCars.forEach((car, i) => {
    car.visible = !focused || i === focusPlayerId;
    this.plinths[i].visible = car.visible;
    car.rotation.y = (i % 2 === 0 ? -0.15 : 0.12) + (this.reducedMotion ? 0 : Math.sin(time * 0.25) * 0.13);
   });
   const preview = focused ? this.previewCars[focusPlayerId] : undefined;
   if (preview) {
    const { x, z } = preview.position;
    const distance = this.width / this.height < 0.7 ? 1.3 : 1;
    this.showroomCamera.position.set(x - 7 * distance, 6.5 * distance, z + 9 * distance);
    this.showroomCamera.lookAt(x, 0.8, z);
   } else {
    const distance = this.previewCars.length > 2 ? 1.35 : 1;
    this.showroomCamera.position.set(-13 * distance, 13 * distance, 22 * distance);
    this.showroomCamera.lookAt(0, 0.8, 0);
   }
   this.cameraRigs.forEach(rig => { rig.ready = false; });
   this.renderer.render(this.showroom, this.showroomCamera);
   return;
  }
  const displayed = focused ? snapshots.filter(snapshot => snapshot.id === focusPlayerId) : snapshots;
  const activeIds = new Set<number>(snapshots.map(snapshot => snapshot.id));
  this.cars.forEach((car, index) => {
   const active = activeIds.has(index);
   car.chassis.visible = active;
   car.shadow.visible = active;
   car.effects.group.visible = active;
   car.wheels.forEach(wheel => { wheel.visible = active; });
  });
  for (const snapshot of snapshots) {
   const car = this.cars[snapshot.id];
   if (!car) continue;
   car.chassis.position.copy(snapshot.position);
   car.chassis.quaternion.copy(snapshot.quaternion);
   car.chassis.scale.y = 1 - (this.reducedMotion ? 0 : snapshot.charge * 0.075);
   snapshot.wheels.forEach((wheel, i) => {
    if (car.wheels[i]) { car.wheels[i].position.copy(wheel.position); car.wheels[i].quaternion.copy(wheel.quaternion); }
   });
   car.chassis.visible = !snapshot.recovering || this.reducedMotion || Math.floor(time * 7) % 2 === 0;
   car.shadow.position.set(snapshot.position.x, groundHeight(snapshot.position.z) + 0.06, snapshot.position.z);
   car.shadow.scale.set(1, 1.55, 1);
   car.effects.update(snapshot, frameDt, stage === 'racing', this.reducedMotion);
   const view = this.viewport(0, displayed.length, focused);
   this.updateCamera(snapshot, frameDt, view.width / view.height, focused);
  }
  if (this.raceLight && snapshots.length) {
   const focus = focused ? snapshots.find(snapshot => snapshot.id === focusPlayerId) : undefined;
   const middleZ = focus ? focus.position.z : snapshots.reduce((sum, snapshot) => sum + snapshot.position.z, 0) / snapshots.length;
   const road = cameraRoadHeight(middleZ);
   this.raceLight.position.set(-20, road + 42, middleZ - 25);
   this.raceLight.target.position.set(0, road, middleZ);
  }
  // Clear the whole canvas first so an unused fourth quadrant never retains an old frame.
  this.renderer.setScissorTest(false);
  this.renderer.setViewport(0, 0, this.width, this.height);
  this.renderer.clear();
  this.renderer.setScissorTest(true);
  displayed.forEach((snapshot, index) => {
   const view = this.viewport(index, displayed.length, focused);
   const camera = this.cameras[snapshot.id];
   if (!camera) return;
   camera.aspect = view.width / view.height;
   camera.updateProjectionMatrix();
   this.renderer.setViewport(view.x, view.y, view.width, view.height);
   this.renderer.setScissor(view.x, view.y, view.width, view.height);
   this.renderer.render(this.scene, camera);
  });
 }

 disposeObjects(objects: THREE.Object3D[]) {
  for (const object of objects) object.traverse(node => {
   if (node instanceof THREE.Mesh) {
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => material.dispose());
   }
  });
 }

 dispose() {
  this.resizeObserver.disconnect();
  this.motionPreference.removeEventListener('change', this.onMotionPreference);
  this.disposeObjects([this.scene, this.showroom]);
  this.renderer.dispose();
  this.renderer.domElement.remove();
 }
}
