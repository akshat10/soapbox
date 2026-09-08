import { Vec3, type Body } from 'cannon-es';
import { getBody, getWheel, wheelMounts } from './catalogue';
import type { RoadProjection } from './course';
import type { Blueprint } from './types';

/** Include the whole rotated car and its tires, so the nose cannot hang through
 * a bridge rail just because the chassis centre is still on the road. */
export function lateralFootprint(body: Body, blueprint: Blueprint, right: Vec3): number {
  const shape = getBody(blueprint.bodyId), wheel = getWheel(blueprint.wheelId);
  const localRight = body.quaternion.conjugate().vmult(right);
  const chassis = Math.abs(localRight.x) * shape.width / 2
    + Math.abs(localRight.y) * (shape.height / 2 + Math.abs(shape.comHeight))
    + Math.abs(localRight.z) * shape.length / 2;
  const tires = Math.max(...wheelMounts(blueprint).map(([x, y, z]) =>
    Math.abs(localRight.dot(new Vec3(x, y - shape.comHeight - .38, z)))
    + Math.abs(localRight.x) * .2 + Math.hypot(localRight.y, localRight.z) * wheel.radius));
  return Math.max(chassis, tires);
}

/** Arcade edge contact, also while airborne. Only remove outward momentum;
 * retain forward travel and hop height, without steering the car for the driver. */
export function containOnTrack(body: Body, blueprint: Blueprint, route: RoadProjection): number {
  const limit = Math.max(.5, route.width / 2 - lateralFootprint(body, blueprint, route.right) - .08);
  const excess = Math.abs(route.lateral) - limit;
  if (excess <= 0) return 0;
  const side = Math.sign(route.lateral);
  body.position.vsub(route.right.scale(side * excess), body.position);
  const outward = Math.max(0, body.velocity.dot(route.right) * side);
  body.velocity.vsub(route.right.scale(side * outward * 1.12), body.velocity);
  body.angularVelocity.scale(.9, body.angularVelocity);
  body.aabbNeedsUpdate = true;
  return outward;
}
