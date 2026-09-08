import * as THREE from 'three';
import { createVehicleModel, createWheelModel, createTrackScene } from './visuals';
import { getBody, getWheel } from './catalogue';
import { groundHeight } from './track';
import { courseForSnapshot } from './course';
import { disposeCourseScene, type CourseScene } from './course-scene';
import { RaceEffects } from './race-effects';
import { PLAYER_COLORS } from './race';
import { batchStaticTrack } from './scene-batch';
import { ReferenceLighting, createContactShadowTexture } from './reference-lighting.js';
import type { Blueprint, PlayerId, Stage, VehicleSnapshot } from './types';

const COLORS = PLAYER_COLORS.map(color => new THREE.Color(color).getHex());
const MAX_RACERS = 4;
export const CHASE_CAMERA = {
 fov: 58,
 far: 215,
 speedFov: 13,
 fullSpeed: 28,
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

export type RendererProfile = 'default' | 'phone';
export interface RendererOptions { profile?: RendererProfile; courseScene?: CourseScene }

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
 private readonly phone: boolean;
 private plinths: THREE.Mesh[] = [];
 private cameraRigs: CameraRig[] = Array.from({ length: MAX_RACERS }, () => ({ ready: false, aim: new THREE.Vector3(), previousPosition: new THREE.Vector3(), recovering: false, recoveries: 0 }));
 private motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
 private reducedMotion = this.motionPreference.matches;
 private onMotionPreference = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };
 private lighting: ReferenceLighting;
 private lightFocus = new THREE.Vector3();
 private positionTarget = new THREE.Vector3();
 private aimTarget = new THREE.Vector3();
 private contactTexture = createContactShadowTexture();
 private authored?: CourseScene;
 private classicTrack: THREE.Group;
 private coastalColor = new THREE.Color(0xbedfdc);
 private classicFog = new THREE.Fog(0xbedfdc,85,205);
 private courseFog = new THREE.Fog(0xb9d9df,180,750);
 private groundNormal = new THREE.Vector3();
 private groundMatrix = new THREE.Matrix4();

 constructor(parent: HTMLElement, options: RendererOptions = {}) {
  this.parent = parent;
  this.phone = options.profile === 'phone';
  this.renderer = new THREE.WebGLRenderer({ antialias: !this.phone, alpha: false, powerPreference: 'high-performance' });
  this.renderer.setPixelRatio(this.phone ? 1 : Math.min(window.devicePixelRatio, 1.5));
  this.lighting = new ReferenceLighting(this.renderer, {
   raceScene: this.scene,
   showroomScene: this.phone ? undefined : this.showroom,
   quality: 'mobile',
  });
  if (this.phone) {this.renderer.shadowMap.enabled = false;this.classicFog.near=52;this.classicFog.far=105;}
  parent.appendChild(this.renderer.domElement);
  this.scene.background = new THREE.Color(0xbedfdc);
  this.scene.fog = new THREE.Fog(0xbedfdc, this.phone ? 52 : 85, this.phone ? 105 : 205);
  if (this.phone) this.cameras.forEach(camera => { camera.far = 110; camera.updateProjectionMatrix(); });
  this.showroom.background = new THREE.Color(0xbedfdc);
  this.classicTrack=batchStaticTrack(createTrackScene({ lowDetail: this.phone }));
  this.scene.add(this.classicTrack);
  this.authored=options.courseScene;
  if(this.authored){this.authored.root.visible=false;this.scene.add(this.authored.root);}
  if (!this.phone) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xbedfdc, roughness: 1 }));
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
   const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.contactTexture, color: 0x102f28, transparent: true, opacity: 0.28, depthWrite: false }));
   shadow.rotation.x = -Math.PI / 2;
   const effects = new RaceEffects(COLORS[i]);
   this.ownMaterials([chassis,...wheels]);
   this.scene.add(chassis, shadow, effects.group, ...wheels);
   this.cars.push({ chassis, wheels, shadow, effects });
   if (this.phone) return;
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
   this.ownMaterials([preview]);
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

  if(snapshot.courseId==='bay-or-bust' && snapshot.pathDistance!==undefined){
   const course=courseForSnapshot(snapshot);
   const roadFrame=course.frame(snapshot.pathDistance,snapshot.pathId);
   const behind=course.lookFrame(snapshot.pathDistance-CHASE_CAMERA.distance,snapshot.pathId);
   const ahead=course.lookFrame(snapshot.pathDistance+(aspect<1?5:CHASE_CAMERA.lookAhead),snapshot.pathId);
   const dx=snapshot.position.x-roadFrame.position.x,dz=snapshot.position.z-roadFrame.position.z;
   const lift=Math.max(0,snapshot.position.y-roadFrame.position.y-1.1);
   const follow=this.reducedMotion?0:Math.min(1.1,lift*.2);
   // Look around the bend, with the horizon level even on banked sections.
   this.positionTarget.set(behind.position.x+dx*.8,Math.max(behind.position.y,roadFrame.position.y)+4.5+follow,behind.position.z+dz*.8);
   if(!snapshot.circuit&&snapshot.pathDistance<CHASE_CAMERA.distance)this.positionTarget.addScaledVector(new THREE.Vector3(roadFrame.tangent.x,0,roadFrame.tangent.z).normalize(),-(CHASE_CAMERA.distance-snapshot.pathDistance));
   this.aimTarget.set(ahead.position.x+dx*.25,ahead.position.y+1.2-(narrow?.5:0),ahead.position.z+dz*.25);
   if(aspect<1){this.aimTarget.x=THREE.MathUtils.lerp(snapshot.position.x,this.aimTarget.x,.5);this.aimTarget.z=THREE.MathUtils.lerp(snapshot.position.z,this.aimTarget.z,.5);}
   camera.far=this.phone?300:1400;
  }else camera.far=this.phone?110:CHASE_CAMERA.far;

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
  const authored=snapshots.some(snapshot=>snapshot.courseId==='bay-or-bust')&&!!this.authored;
  this.authored?.setCircuit(snapshots.some(snapshot=>snapshot.circuit));
  this.classicTrack.visible=!authored;
  if(this.authored){this.authored.root.visible=authored;if(authored){if(!this.reducedMotion)this.authored.mixer.update(frameDt);this.authored.features.update(snapshots.find(snapshot=>snapshot.id===0),frameDt,stage==='racing',this.reducedMotion);}}
  this.scene.background=authored&&this.authored?.sky?this.authored.sky:this.coastalColor;
  this.scene.fog=authored?this.courseFog:this.classicFog;
  if (stage === 'garage') {
   if (this.phone) return;
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
    this.showroomCamera.position.set(x - 6.8 * distance, 5.2 * distance, z + 8.5 * distance);
    if(this.width > 800)this.showroomCamera.setViewOffset(this.width,this.height,-this.width * .205,-this.height * .01,this.width,this.height);
    else this.showroomCamera.clearViewOffset();
    this.showroomCamera.lookAt(x, 0.8, z);
   } else {
    this.showroomCamera.clearViewOffset();
    const distance = this.previewCars.length > 2 ? 1.35 : 1;
    this.showroomCamera.position.set(-13 * distance, 13 * distance, 22 * distance);
    this.showroomCamera.lookAt(0, 0.8, 0);
   }
   this.cameraRigs.forEach(rig => { rig.ready = false; });
   this.lightFocus.set(preview?.position.x ?? 0, 1, preview?.position.z ?? 0);
   this.lighting.prepareShowroom(this.lightFocus);
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
   const body = getBody(snapshot.blueprint.bodyId), wheel = getWheel(snapshot.blueprint.wheelId);
   const gap = Math.max(0, snapshot.position.y - groundHeight(snapshot.position.z) - body.height / 2 - wheel.radius);
   const spread = 1 + Math.min(gap, 3) * .14;
   car.shadow.scale.set((body.width + .8) * spread, (body.length + .6) * spread, 1);
   car.shadow.rotation.x = -Math.PI / 2 + Math.atan2(groundHeight(snapshot.position.z + .25) - groundHeight(snapshot.position.z - .25), .5);
   (car.shadow.material as THREE.MeshBasicMaterial).opacity = .28 * Math.exp(-gap * .85);
   if(snapshot.courseId==='bay-or-bust'&&snapshot.pathDistance!==undefined){
    const course=courseForSnapshot(snapshot);
    const surface=course.project(snapshot.position,{pathId:snapshot.pathId||'main',distance:snapshot.pathDistance});
    const ground=surface.position.vadd(surface.right.scale(surface.lateral));
    car.shadow.position.set(ground.x+surface.up.x*.06,ground.y+surface.up.y*.06,ground.z+surface.up.z*.06);
    this.groundNormal.set(surface.up.x,surface.up.y,surface.up.z);
    this.groundMatrix.makeBasis(new THREE.Vector3(surface.right.x,surface.right.y,surface.right.z),new THREE.Vector3(-surface.tangent.x,-surface.tangent.y,-surface.tangent.z),this.groundNormal);
    car.shadow.quaternion.setFromRotationMatrix(this.groundMatrix);
    const height=Math.max(0,surface.height-body.height/2-wheel.radius);
    car.shadow.scale.set((body.width+.8)*(1+height*.1),(body.length+.6)*(1+height*.1),1);
    (car.shadow.material as THREE.MeshBasicMaterial).opacity=.28*Math.exp(-height*.85);
   }
   car.effects.update(snapshot, frameDt, stage === 'racing', this.reducedMotion);
   const view = this.viewport(0, displayed.length, focused);
   if (!focused || snapshot.id === focusPlayerId) this.updateCamera(snapshot, frameDt, view.width / view.height, focused);
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
   // Each separated racer gets nearby shadow coverage in their own viewport.
   const lightZ = snapshot.position.z + 10;
   if(snapshot.courseId==='bay-or-bust'&&snapshot.pathDistance!==undefined){const frame=courseForSnapshot(snapshot).lookFrame(snapshot.pathDistance+10,snapshot.pathId);this.lightFocus.set(frame.position.x,frame.position.y,frame.position.z);}
   else this.lightFocus.set(snapshot.position.x, cameraRoadHeight(lightZ), lightZ);
   this.lighting.prepareRaceView(this.lightFocus);
   this.renderer.render(this.scene, camera);
  });
 }

 private ownMaterials(objects:THREE.Object3D[]) {
  const copies=new Map<THREE.Material,THREE.Material>();
  for(const object of objects)object.traverse(node=>{
   if(!(node instanceof THREE.Mesh)&&!(node instanceof THREE.LineSegments))return;
   const own=(material:THREE.Material)=>{if(!copies.has(material))copies.set(material,material.clone());return copies.get(material)!;};
   node.material=Array.isArray(node.material)?node.material.map(own):own(node.material);
  });
 }
 disposeObjects(objects: THREE.Object3D[]) {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  for (const object of objects) object.traverse(node => {
   if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
    geometries.add(node.geometry);
    for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);
    if(node.userData.disposeTexture instanceof THREE.Texture)textures.add(node.userData.disposeTexture);
   }
  });
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());
 }

 dispose() {
  this.resizeObserver.disconnect();
  this.motionPreference.removeEventListener('change', this.onMotionPreference);
  this.lighting.dispose();
  this.contactTexture.dispose();
  if(this.authored)disposeCourseScene(this.authored);
  this.disposeObjects([this.scene, this.showroom]);
  this.renderer.dispose();
  this.renderer.domElement.remove();
 }
}
