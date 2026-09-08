import { Vector3 } from 'three';
import { courseForSnapshot } from './course';
import { groundHeight } from './track';
import type { VehicleSnapshot } from './types';

export type RaceCameraMode = 'chase' | 'scenic';
export const SCENIC_CAMERA = { fov: 48, distance: 18, height: 11, side: 8, lookAhead: 7, lookHeight: 2.5 } as const;

/** The close, elevated home-screen perspective, following the road heading. */
export function scenicCameraTargets(snapshot: VehicleSnapshot, aspect: number): { eye: Vector3; aim: Vector3 } {
  const course = snapshot.courseId === 'bay-or-bust' && snapshot.pathDistance !== undefined ? courseForSnapshot(snapshot) : null;
  const frame = course?.lookFrame(snapshot.pathDistance! + 3, snapshot.pathId);
  const forward = frame ? new Vector3(frame.tangent.x, 0, frame.tangent.z).normalize() : new Vector3(0, 0, 1);
  const right = new Vector3(forward.z, 0, -forward.x);
  const surfaceHeight = course ? course.frame(snapshot.pathDistance!, snapshot.pathId).position.y : groundHeight(snapshot.position.z);
  const base = new Vector3(snapshot.position.x, Math.max(surfaceHeight, snapshot.position.y - 1.1), snapshot.position.z);
  const eye = base.clone().addScaledVector(forward, -SCENIC_CAMERA.distance).addScaledVector(right, SCENIC_CAMERA.side);
  eye.y += SCENIC_CAMERA.height;
  const aim = base.clone().addScaledVector(forward, SCENIC_CAMERA.lookAhead);
  aim.y += SCENIC_CAMERA.lookHeight;
  if (aspect < 1) {
    aim.lerp(base.clone().add(new Vector3(0, 1, 0)), .5);
    eye.sub(aim).multiplyScalar(1.15).add(aim);
  }
  return { eye, aim };
}
