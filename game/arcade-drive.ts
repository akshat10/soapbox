import { Vec3, type Body } from 'cannon-es';
import type { DerbyCourse, RoadProjection } from './course';

export const ARCADE_DRIVE = { cruiseSpeed: 15, boostSpeed: 20, acceleration: 10, braking: 14, cornerAcceleration: 11, minimumSpeed: 11 } as const;

/** Look ahead far enough to brake before a tight bend. The same envelope is
 * applied to every racer; it controls throttle, never the driver's direction. */
export function roadSpeedLimit(course: DerbyCourse, distance: number, speed: number, boosting: boolean): number {
  let target: number = boosting ? ARCADE_DRIVE.boostSpeed : ARCADE_DRIVE.cruiseSpeed;
  for (let ahead = 0; ahead <= Math.max(14, speed * 1.3); ahead += 4) {
    const a = course.lookFrame(distance + ahead - 2), b = course.lookFrame(distance + ahead + 2);
    const dot = (a.tangent.x*b.tangent.x+a.tangent.z*b.tangent.z) / (Math.hypot(a.tangent.x,a.tangent.z)*Math.hypot(b.tangent.x,b.tangent.z));
    const angle = Math.acos(Math.max(-1,Math.min(1,dot)));
    const radius = 4 / Math.max(.0001,angle);
    const crest = Math.max(0,(a.tangent.y-b.tangent.y)/4);
    const sampleDistance = a.distance;
    const signatureJump = (sampleDistance>156&&sampleDistance<185)||(sampleDistance>384&&sampleDistance<413);
    const crestSpeed = signatureJump ? (boosting ? 15 : 13) : Math.sqrt(12 / Math.max(.001,crest));
    const cornerSpeed = Math.max(ARCADE_DRIVE.minimumSpeed,Math.min(crestSpeed,Math.sqrt(radius*ARCADE_DRIVE.cornerAcceleration))) * (boosting ? 1.12 : 1);
    target = Math.min(target, Math.sqrt(cornerSpeed*cornerSpeed+2*ARCADE_DRIVE.braking*ahead));
  }
  return target;
}

/** Powered soapbox handling: acceleration and lateral tire grip in the road
 * plane. A driver still has to turn, choose a line and time their hops. */
export function applyArcadeDrive(body: Body, route: RoadProjection, course: DerbyCourse, grounded: boolean, boosting: boolean, dt: number, steeringAngle = 0, wheelbase = 2): void {
  // Suspension assist damps pitch and roll around the road normal. Yaw remains
  // driver-controlled and hops retain their vertical impulse and airtime.
  const inverse = body.quaternion.conjugate();
  const error = inverse.vmult(body.quaternion.vmult(new Vec3(0,1,0)).cross(route.up));
  const spin = inverse.vmult(body.angularVelocity);
  const spring = grounded ? 38 : 16, damping = grounded ? 11 : 6;
  const clamp = (value: number) => Math.max(-35, Math.min(35, value));
  const torque = new Vec3(body.inertia.x*clamp(error.x*spring-spin.x*damping), 0, body.inertia.z*clamp(error.z*spring-spin.z*damping));
  body.torque.vadd(body.quaternion.vmult(torque), body.torque);
  if (!grounded) {
    // A little air steering lets players correct a landing line after a hop.
    // It produces yaw torque only: no lateral teleport or automatic road following.
    const desiredYaw = Math.min(20,body.velocity.length()) * Math.tan(steeringAngle) / wheelbase * .65;
    body.torque.y += body.inertia.y * (desiredYaw-body.angularVelocity.y)*3;
    return;
  }
  const forward = body.quaternion.vmult(new Vec3(0,0,1));
  const normal = route.up;
  forward.vsub(normal.scale(forward.dot(normal)),forward); forward.normalize();
  const speed = body.velocity.dot(forward);
  const target = roadSpeedLimit(course,route.distance,Math.max(0,speed),boosting);
  const acceleration = Math.max(-ARCADE_DRIVE.braking, Math.min(ARCADE_DRIVE.acceleration,(target-speed)*4+9.82*forward.y));
  body.applyImpulse(forward.scale(body.mass*acceleration*dt));
  // Grip follows the car's tires, not the road centreline. Damping sideslip
  // lets the front-wheel steering remain useful at the higher cruise speed.
  const right = normal.cross(forward); right.normalize();
  const slip = body.velocity.dot(right);
  body.applyImpulse(right.scale(-slip*body.mass*(1-Math.exp(-4*dt))));
  body.applyForce(normal.scale(-body.mass*Math.min(9,speed*speed*.016)));
}
