import { Body, Box, Vec3, type Material } from 'cannon-es';
import type { DerbyCourse } from './course';

export const OBSTACLE_GROUP = 4;
// Measured from the authored GLB, using the same projection as conformCourseBridges.
export const BRIDGE_PORTALS = [167.3789734, 196.1661577] as const;
const BRIDGE_OFFSET = -.251012;

/** Deliberately simple solid supports. Keep these out of suspension ray casts:
 * a car can bump a rail or beam, but its tires must never stand on a rival/rail. */
export function bridgeColliders(course: DerbyCourse, material: Material): Body[] {
  const bodies: Body[] = [];
  const box = (distance: number, lateral: number, height: number, size: [number, number, number]) => {
    const frame = course.frame(distance);
    const position = frame.position.vadd(frame.right.scale(lateral));
    position.y += height + BRIDGE_OFFSET;
    const body = new Body({ mass: 0, material, position, collisionFilterGroup: OBSTACLE_GROUP, collisionFilterMask: 2 });
    // Towers are upright in the artwork, rather than banked with the roadway.
    body.quaternion.setFromEuler(0, Math.atan2(frame.tangent.x, frame.tangent.z), 0);
    body.addShape(new Box(new Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    bodies.push(body);
  };
  for (const distance of BRIDGE_PORTALS) {
    for (const side of [-1, 1]) {
      box(distance, side * 9, .325, [3.2, .65, 4.2]);
      box(distance, side * 9, .83, [2.4, .4, 3]);
      box(distance, side * 9, 10.38, [1.65, 18.7, 2.25]);
    }
    for (const height of [12, 17.4]) box(distance, 0, height, [18.3, 1.16, 1.7]);
  }
  const start = BRIDGE_PORTALS[0] - 21, end = BRIDGE_PORTALS[1] + 21;
  const count = Math.ceil(end - start), length = (end - start) / count;
  for (let index = 0; index < count; index++) {
    const distance = start + (index + .5) * length;
    for (const side of [-1, 1]) box(distance, side * 8.05, .885, [.14, 1.37, length + .08]);
  }
  return bodies;
}
