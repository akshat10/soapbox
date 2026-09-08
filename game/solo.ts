import type { DerbyPhysics } from './physics';
import { Quaternion, Vec3 } from 'cannon-es';
import { wheelMounts } from './catalogue';
import { courseForSnapshot } from './course';
import type { Blueprint, PlayerId, VehicleSnapshot } from './types';

export type LocalMode = 'solo' | 'local';
export const SOLO_PLAYER_IDS: PlayerId[] = [0, 1, 2, 3, 4, 5, 6, 7];
export const SOLO_RIVALS: { id: PlayerId; name: string; style: string; build: Blueprint; release: [number, number] }[] = [
  { id: 1, name: 'Mission Control', style: 'Late hops. Extra salsa.', build: { bodyId: 'mission_burrito', wheelId: 'skate', wheelbase: 'standard' }, release: [85.2, 228] },
  { id: 2, name: 'Rent Controlled', style: 'Steady wheels. High rent.', build: { bodyId: 'painted_porch', wheelId: 'transit_disc', wheelbase: 'standard' }, release: [85.2, 228] },
  { id: 3, name: 'Toast Malone', style: 'All crust. No brakes.', build: { bodyId: 'toaster', wheelId: 'scooter', wheelbase: 'standard' }, release: [84.4, 226.8] },
  { id: 4, name: 'Dough Main', style: 'On a roll.', build: { bodyId: 'sourdough', wheelId: 'scooter', wheelbase: 'standard' }, release: [85, 228] },
  { id: 5, name: 'Burrito Bandit', style: 'Extra hot laps.', build: { bodyId: 'mission_burrito', wheelId: 'scooter', wheelbase: 'long' }, release: [84.8, 227.5] },
  { id: 6, name: 'Porch Pirate', style: 'Curb appeal. Corner speed.', build: { bodyId: 'painted_porch', wheelId: 'skate', wheelbase: 'standard' }, release: [85.2, 228] },
  { id: 7, name: 'Burn Rate', style: 'Hot out of the toaster.', build: { bodyId: 'toaster', wheelId: 'skate', wheelbase: 'long' }, release: [84.7, 227.2] },
];

/** Local game AI: reads the same race snapshot and holds/releases the same hop
 * control as the player. No force, speed, progress, or scoring overrides. */
export function aiHopHeld(snapshot: VehicleSnapshot, heat = 1): boolean {
  const rival = SOLO_RIVALS.find(rival => rival.id === snapshot.id);
  if (!rival || snapshot.finished || snapshot.recovering) return false;
  if(snapshot.courseId==='bay-or-bust'&&snapshot.pathDistance!==undefined){
    return courseHopHeld(snapshot);
  }
  const z = snapshot.position.z;
  // Slight, repeatable changes give each heat its own rhythm.
  const variation = Math.sin(heat * 2.1 + snapshot.id * 1.7) * .3;
  return (z > 73 && z < rival.release[0] + variation)
    || (z > 212 && z < rival.release[1] + variation);
}
export function courseHopHeld(snapshot:VehicleSnapshot):boolean {
  if(snapshot.finished||snapshot.recovering||snapshot.pathDistance===undefined)return false;
  const distance=snapshot.pathDistance;
  return (distance>168.88931332-snapshot.speed*.65&&distance<168.88931332)
    ||(distance>396.74173108-snapshot.speed*.55&&distance<396.74173108);
}

/** Pure pursuit through the front tires. Uses observed pose and authored road
 * frames; it never edits the car's position, rotation, velocity, or progress. */
export function courseSteering(snapshot:VehicleSnapshot):number {
  if(snapshot.finished||snapshot.recovering||snapshot.pathDistance===undefined)return 0;
  const course = courseForSnapshot(snapshot);
  const target=course.lookFrame(snapshot.pathDistance+Math.max(4,snapshot.speed*.6),snapshot.pathId);
  const lane=[-3.8,-1.3,1.3,3.8,-3.8,-1.3,1.3,3.8][snapshot.id];
  const point=target.position.vadd(target.right.scale(lane));
  const q=snapshot.quaternion;
  const local=new Quaternion(q.x,q.y,q.z,q.w).conjugate().vmult(new Vec3(point.x-snapshot.position.x,point.y-snapshot.position.y,point.z-snapshot.position.z));
  const mounts=wheelMounts(snapshot.blueprint),length=Math.abs(mounts[0][2]-mounts[2][2]);
  const cap=Math.atan(length/(8+.2*Math.min(snapshot.speed,10)));
  return Math.max(-1,Math.min(1,Math.atan2(2*length*local.x,local.x**2+local.z**2)/cap));
}

export function soloName(id: PlayerId): string {
  return id === 0 ? 'You' : SOLO_RIVALS.find(rival => rival.id === id)?.name || 'Rival';
}

/** Evaluate every rival at physics cadence, independent of rendering speed. */
export class SoloRaceDriver {
  private carry = 0;
  reset() { this.carry = 0; }
  update(physics: DerbyPhysics, dt: number, heat: number): number {
    const step = 1 / 120;
    this.carry += Math.min(Math.max(dt, 0), .1);
    let elapsed = 0;
    while (this.carry + 1e-10 >= step) {
      for (const snapshot of physics.getSnapshots()) {
        if (snapshot.id !== 0) {
          if(snapshot.courseId==='bay-or-bust')physics.setSteering(snapshot.id,courseSteering(snapshot));
          physics.setInput(snapshot.id, aiHopHeld(snapshot, heat));
        }
      }
      physics.update(step);
      this.carry = Math.max(0, this.carry - step);
      elapsed += step;
    }
    return elapsed;
  }
}
