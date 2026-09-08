import * as THREE from 'three';
import { groundHeight } from './track';
import { courseForSnapshot } from './course';
import { BOOST_FEEDBACK_SECONDS } from './course-features';
import type { VehicleSnapshot } from './types';

const CHARGE_SEGMENTS = 64;
const DUST_COUNT = 10;
const DUST_LIFETIME = 0.45;

/** Small, pooled cues for actual input and landing events. No physics is simulated here. */
export class RaceEffects {
 readonly group = new THREE.Group();
 private charge: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
 private dust: { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; age: number; direction: THREE.Vector3 }[];
 private airborneTime = 0;
 private hadSnapshot = false;
 private wasGrounded = false;
 private lastRings = 0;
 private boostStreaks: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];

 constructor(color: number) {
  this.charge = new THREE.Mesh(
   new THREE.RingGeometry(1.48, 1.62, CHARGE_SEGMENTS),
   new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  this.charge.rotation.x = -Math.PI / 2;
  this.charge.visible = false;
  this.group.add(this.charge);
  const streakGeometry = new THREE.BoxGeometry(.055, .045, 2.2);
  const streakMaterial = new THREE.MeshBasicMaterial({color:0xffdc75,transparent:true,opacity:0,depthWrite:false});
  this.boostStreaks = [-.7, 0, .7].map(() => {
   const mesh = new THREE.Mesh(streakGeometry, streakMaterial); mesh.visible = false; this.group.add(mesh); return mesh;
  });
  this.dust = Array.from({ length: DUST_COUNT }, (_, index) => {
   const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 5, 4),
    new THREE.MeshBasicMaterial({ color: 0xffefcf, transparent: true, opacity: 0, depthWrite: false }),
   );
   mesh.visible = false;
   this.group.add(mesh);
   const angle = index / DUST_COUNT * Math.PI * 2;
   return { mesh, age: DUST_LIFETIME, direction: new THREE.Vector3(Math.cos(angle), 0.3, Math.sin(angle)) };
  });
 }

 update(snapshot: VehicleSnapshot, dt: number, active: boolean, reducedMotion: boolean) {
  const course=courseForSnapshot(snapshot);
  const surface=snapshot.courseId==='bay-or-bust'&&snapshot.pathDistance!==undefined?course.project(snapshot.position,{distance:snapshot.pathDistance,pathId:snapshot.pathId||'main'}):null;
  const point=surface?.position.vadd(surface.right.scale(surface.lateral));
  const ground = point?.y ?? groundHeight(snapshot.position.z);
  this.charge.visible = active && snapshot.grounded && snapshot.charge > 0.025 && !snapshot.recovering && !snapshot.finished;
  this.charge.position.set(snapshot.position.x, ground + 0.09, snapshot.position.z);
  this.charge.rotation.x = -Math.PI / 2 + Math.atan2(groundHeight(snapshot.position.z + .25) - groundHeight(snapshot.position.z - .25), .5);
  if(surface)this.charge.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(surface.up.x,surface.up.y,surface.up.z));
  this.charge.geometry.setDrawRange(0, Math.ceil(snapshot.charge * CHARGE_SEGMENTS) * 6);
  this.charge.material.color.setHex(snapshot.charge > 0.92 ? 0xffde49 : 0xfff6d5);

  const boost = Math.min(1, (snapshot.boostRemaining || 0) / BOOST_FEEDBACK_SECONDS);
  this.boostStreaks.forEach((streak,index) => {
   streak.visible = active && !reducedMotion && boost > 0 && !snapshot.recovering && !snapshot.finished;
   if (!streak.visible) return;
   streak.quaternion.copy(snapshot.quaternion);
   const offset = new THREE.Vector3((index - 1) * .7, -.15, -2.6).applyQuaternion(streak.quaternion);
   streak.position.copy(snapshot.position).add(offset);
   streak.scale.z = .6 + boost;
   streak.material.opacity = boost * .65;
  });
  const ringCollected = (snapshot.rings || 0) > this.lastRings;
  this.lastRings = snapshot.rings || 0;
  if (active && !reducedMotion && ringCollected) {
   this.dust.forEach(puff => {
    puff.age = 0; puff.mesh.position.copy(snapshot.position); puff.mesh.material.color.setHex(0xffd15c); puff.mesh.visible = true;
   });
  }
  if (!snapshot.grounded && !snapshot.recovering) this.airborneTime += dt;
  if (snapshot.grounded) {
   if (active && !reducedMotion && this.hadSnapshot && !this.wasGrounded && this.airborneTime > 0.18 && !snapshot.recovering) {
    this.dust.forEach((puff) => {
     puff.age = 0;
     puff.mesh.material.color.setHex(0xffefcf);
     puff.mesh.position.set(snapshot.position.x + puff.direction.x * 0.75, ground + 0.18, snapshot.position.z + puff.direction.z * 0.65);
     puff.mesh.visible = true;
    });
   }
   this.airborneTime = 0;
  }
  if (snapshot.recovering || !active) this.airborneTime = 0;
  this.hadSnapshot = true;
  this.wasGrounded = snapshot.grounded;

  for (const puff of this.dust) {
   puff.age += dt;
   const life = Math.max(0, 1 - puff.age / DUST_LIFETIME);
   puff.mesh.visible = active && !reducedMotion && life > 0;
   if (!puff.mesh.visible) continue;
   puff.mesh.position.addScaledVector(puff.direction, dt * 2.8);
   puff.mesh.scale.setScalar(1 + (1 - life) * 1.8);
   puff.mesh.material.opacity = life * 0.48;
  }
 }
}
