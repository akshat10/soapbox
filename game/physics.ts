import { Body, Box, ContactMaterial, GSSolver, Material, PointToPointConstraint, Quaternion, RaycastVehicle, SAPBroadphase, Vec3, World } from 'cannon-es';
import { getBody, getWheel, isLegalBuild, wheelMounts } from './catalogue';
import { CHECKPOINT_ZS, FINISH_Z, LANE_CENTERS, START_Z, TRACK_PIECES, groundHeight } from './track';
import type { Blueprint, PlayerId, Pose, VehicleSnapshot } from './types';

const STEP = 1 / 120;
const MAX_CHARGE_SECONDS = 0.8;
// Small timing cushions keep one-button play forgiving without midair charging.
export const HOP_GRACE_SECONDS = 0.12;
export const HOP_BUFFER_SECONDS = 0.12;
export const RECOVERY_SECONDS = 0.8;
const STALL_SECONDS = 1.8;
const GROUND_GROUP = 1;
const VEHICLE_GROUP = 2;

export interface DerbyEvent {
  playerId: PlayerId;
  type: 'jump' | 'landing' | 'flip' | 'recovery' | 'collision' | 'finish';
  time: number;
  z: number;
  value?: number;
}

interface Racer {
  id: PlayerId;
  blueprint: Blueprint;
  chassis: Body;
  vehicle: RaycastVehicle;
  laneAnchor: Body;
  laneConstraint: PointToPointConstraint;
  held: boolean;
  charge: number;
  grounded: boolean;
  launchLock: number;
  recoveryLeft: number;
  finished: boolean;
  finishTime: number | null;
  flips: number;
  recoveries: number;
  jumps: number;
  maxRoll: number;
  overturnedSeconds: number;
  stalledSeconds: number;
  checkpointZ: number;
  checkpointVelocity: Vec3;
  recoveryZ: number;
  lastZ: number;
  collisionAt: number;
  airborneAt: number;
  lastGroundedAt: number;
  bufferedRelease: number;
}

/** The only source of race motion: a fixed-step 3D rigid-body world. */
export class DerbyPhysics {
  readonly world: World;
  readonly events: DerbyEvent[] = [];
  private racers = new Map<PlayerId, Racer>();
  private elapsed = 0;
  private accumulator = 0;
  private running = false;
  private groundMaterial: Material;
  private chassisMaterial: Material;

  constructor() {
    this.world = new World({ gravity: new Vec3(0, -9.82, 0), allowSleep: false });
    this.world.broadphase = new SAPBroadphase(this.world);
    (this.world.solver as GSSolver).iterations = 12;
    this.groundMaterial = new Material('road');
    this.chassisMaterial = new Material('chassis');
    this.world.addContactMaterial(new ContactMaterial(this.groundMaterial, this.chassisMaterial, {
      friction: 0.22,
      restitution: 0.08,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 4,
    }));

    for (const piece of TRACK_PIECES) {
      const body = new Body({ mass: 0, material: this.groundMaterial,
        collisionFilterGroup: GROUND_GROUP, collisionFilterMask: VEHICLE_GROUP });
      body.addShape(new Box(new Vec3(piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2)));
      body.position.set(...piece.position);
      body.quaternion.setFromEuler(...piece.rotation, 'XYZ');
      this.world.addBody(body);
    }
  }

  addPlayer(id: PlayerId, blueprint: Blueprint): void {
    if (!isLegalBuild(blueprint)) throw new Error('This vehicle exceeds the garage constraints.');
    const previous = this.racers.get(id);
    if (previous) this.removeRacer(previous);
    const body = getBody(blueprint.bodyId);
    const wheels = getWheel(blueprint.wheelId);
    const chassis = new Body({
      mass: body.mass + 4 * wheels.mass,
      material: this.chassisMaterial,
      linearDamping: 0.014,
      angularDamping: 0.16,
      collisionFilterGroup: VEHICLE_GROUP,
      collisionFilterMask: GROUND_GROUP,
      allowSleep: false,
    });
    chassis.addShape(new Box(new Vec3(body.width / 2, body.height / 2, body.length / 2)), new Vec3(0, -body.comHeight, 0));
    // One-button lanes constrain translation across the road and yaw; pitch and roll remain physical.
    chassis.angularFactor.set(1, 0, 1);
    const vehicle = new RaycastVehicle({ chassisBody: chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    for (const [x, y, z] of wheelMounts(blueprint)) {
        vehicle.addWheel({
          radius: wheels.radius,
          chassisConnectionPointLocal: new Vec3(x, y - body.comHeight, z),
          directionLocal: new Vec3(0, -1, 0),
          axleLocal: new Vec3(-1, 0, 0),
          suspensionRestLength: 0.38,
          suspensionStiffness: 34,
          dampingRelaxation: 3.2,
          dampingCompression: 4.4,
          frictionSlip: wheels.grip * 2.5,
          maxSuspensionForce: 100000,
          maxSuspensionTravel: 0.25,
          rollInfluence: 0.12,
          useCustomSlidingRotationalSpeed: false,
        });
    }
    vehicle.addToWorld(this.world);
    // A physical planar joint keeps each chassis in its lane. Wheel impulses bypass
    // Cannon's linearFactor, so a solver constraint is needed rather than a visual correction.
    const laneAnchor = new Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
    laneAnchor.position.set(LANE_CENTERS[id], 0, 0);
    this.world.addBody(laneAnchor);
    const laneConstraint = new PointToPointConstraint(chassis, new Vec3(), laneAnchor, new Vec3(), 1e6);
    laneConstraint.equationY.enabled = false;
    laneConstraint.equationZ.enabled = false;
    this.world.addConstraint(laneConstraint);
    const racer: Racer = {
      id, blueprint: { ...blueprint }, chassis, vehicle, laneAnchor, laneConstraint,
      held: false, charge: 0, grounded: false, launchLock: 0, recoveryLeft: 0,
      finished: false, finishTime: null, flips: 0, recoveries: 0, jumps: 0, maxRoll: 0,
      overturnedSeconds: 0, stalledSeconds: 0, checkpointZ: START_Z,
      checkpointVelocity: new Vec3(),
      recoveryZ: START_Z,
      lastZ: START_Z, collisionAt: -10, airborneAt: 0,
      lastGroundedAt: -Infinity, bufferedRelease: 0,
    };
    this.racers.set(id, racer);
    this.placeAt(racer, START_Z);
    chassis.addEventListener('collide', (event: { contact: { getImpactVelocityAlongNormal(): number } }) => {
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact > 2.5 && this.elapsed - racer.collisionAt > 0.7 && !racer.recoveryLeft) {
        racer.collisionAt = this.elapsed;
        this.record(racer, 'collision', impact);
      }
    });
  }

  start(): void {
    this.elapsed = 0;
    this.accumulator = 0;
    this.running = true;
    this.clearInputs();
  }

  setInput(id: PlayerId, held: boolean): void {
    const racer = this.racers.get(id);
    if (!racer || racer.held === held) return;
    const wasHeld = racer.held;
    racer.held = held;
    if (held) racer.bufferedRelease = 0;
    if (!this.running || racer.finished || racer.recoveryLeft > 0) {
      racer.charge = 0;
      return;
    }
    if (wasHeld && !held) {
      if (racer.launchLock <= 0 && (racer.grounded || this.elapsed - racer.lastGroundedAt <= HOP_GRACE_SECONDS)) {
        this.hop(racer);
      } else if (racer.launchLock <= 0 && racer.chassis.velocity.y <= 0) {
        // An early landing tap waits briefly for actual contact. It stores no air charge.
        racer.bufferedRelease = HOP_BUFFER_SECONDS;
      }
      racer.charge = 0;
    }
  }

  /** Focus loss and screen changes clear state without treating release as a jump. */
  clearInputs(): void {
    for (const racer of this.racers.values()) {
      racer.held = false;
      racer.charge = 0;
      racer.bufferedRelease = 0;
    }
  }

  cancelInput(id: PlayerId): void {
    const racer = this.racers.get(id);
    if (!racer) return;
    racer.held = false;
    racer.charge = 0;
    racer.bufferedRelease = 0;
  }

  update(dtSeconds: number): void {
    if (!this.running || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    this.accumulator += Math.min(dtSeconds, 0.1);
    while (this.accumulator >= STEP) {
      this.elapsed += STEP;
      for (const racer of this.racers.values()) {
        racer.launchLock = Math.max(0, racer.launchLock - STEP);
        racer.bufferedRelease = Math.max(0, racer.bufferedRelease - STEP);
        if (racer.recoveryLeft > 0) {
          racer.recoveryLeft = Math.max(0, racer.recoveryLeft - STEP);
          racer.chassis.velocity.setZero();
          racer.chassis.angularVelocity.setZero();
          if (racer.recoveryLeft === 0) this.placeAt(racer, racer.recoveryZ, true);
        }
        if (racer.finished || racer.recoveryLeft > 0) {
          racer.charge = 0;
        } else if (racer.held && racer.grounded && racer.launchLock === 0) {
          racer.charge = Math.min(MAX_CHARGE_SECONDS, racer.charge + STEP);
        } else if (!racer.grounded && this.elapsed - racer.lastGroundedAt > HOP_GRACE_SECONDS) {
          racer.charge = 0;
        }
      }
      this.world.step(STEP);
      for (const racer of this.racers.values()) this.updateRacer(racer);
      this.accumulator -= STEP;
    }
  }

  getSnapshots(): VehicleSnapshot[] {
    return [...this.racers.values()].sort((a, b) => a.id - b.id).map((racer) => {
      const { chassis } = racer;
      const body = getBody(racer.blueprint.bodyId);
      const center = chassis.pointToWorldFrame(new Vec3(0, -body.comHeight, 0));
      return {
        id: racer.id,
        position: { x: center.x, y: center.y, z: center.z },
        quaternion: this.quat(chassis.quaternion),
        wheels: racer.vehicle.wheelInfos.map((wheel, i): Pose => {
          const contact = wheel.isInContact;
          racer.vehicle.updateWheelTransform(i);
          wheel.isInContact = contact;
          const p = wheel.worldTransform.position;
          return { position: { x: p.x, y: p.y, z: p.z }, quaternion: this.quat(wheel.worldTransform.quaternion) };
        }),
        speed: chassis.velocity.length(),
        progress: Math.max(0, Math.min(1, ((racer.recoveryLeft > 0 ? racer.recoveryZ : chassis.position.z) - START_Z) / (FINISH_Z - START_Z))),
        charge: racer.charge / MAX_CHARGE_SECONDS,
        grounded: racer.grounded,
        recovering: racer.recoveryLeft > 0,
        finished: racer.finished,
        finishTime: racer.finishTime,
        flips: racer.flips,
        recoveries: racer.recoveries,
        jumps: racer.jumps,
        maxRoll: racer.maxRoll,
        blueprint: { ...racer.blueprint },
      };
    });
  }

  reset(blueprints: Blueprint[], racerIds: PlayerId[] = blueprints.slice(0, 4).map((_, id) => id as PlayerId)): void {
    this.running = false;
    for (const racer of this.racers.values()) this.removeRacer(racer);
    this.racers.clear();
    this.events.length = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    for (const id of racerIds) if (blueprints[id]) this.addPlayer(id, blueprints[id]);
  }

  dispose(): void {
    this.running = false;
    for (const racer of this.racers.values()) this.removeRacer(racer);
    this.racers.clear();
    while (this.world.bodies.length > 0) this.world.removeBody(this.world.bodies[0]);
  }

  private updateRacer(racer: Racer): void {
    if (racer.finished) return;
    const up = racer.chassis.quaternion.vmult(new Vec3(0, 1, 0));
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
    racer.maxRoll = Math.max(racer.maxRoll, tilt);
    const wasGrounded = racer.grounded;
    racer.grounded = racer.launchLock <= 0 && up.y > 0.2 && racer.vehicle.wheelInfos.some((wheel) => wheel.isInContact);
    if (wasGrounded && !racer.grounded) racer.airborneAt = this.elapsed;
    if (!wasGrounded && racer.grounded && this.elapsed - racer.airborneAt > 0.18) this.record(racer, 'landing', tilt);
    if (racer.finished || racer.recoveryLeft > 0) return;
    if (racer.grounded) {
      racer.lastGroundedAt = this.elapsed;
      if (racer.bufferedRelease > 0) this.hop(racer);
    }
    const position = racer.chassis.position;

    if (position.z >= FINISH_Z && position.y > groundHeight(FINISH_Z) - 4) {
      racer.finished = true;
      racer.finishTime = this.elapsed;
      // Preserve the finish pose while rivals continue. Removing the vehicle
      // also stops its suspension callback, keeping all four wheel poses fixed.
      this.removeRacer(racer);
      racer.chassis.velocity.setZero();
      racer.chassis.angularVelocity.setZero();
      racer.chassis.force.setZero();
      racer.chassis.torque.setZero();
      racer.bufferedRelease = 0;
      racer.held = false;
      racer.charge = 0;
      this.record(racer, 'finish');
      return;
    }

    if (racer.grounded && tilt < 0.55 && racer.chassis.velocity.z > 0.5) {
      for (const checkpoint of CHECKPOINT_ZS) {
        if (checkpoint > racer.checkpointZ && checkpoint <= position.z - 1) {
          racer.checkpointZ = checkpoint;
          racer.checkpointVelocity.copy(racer.chassis.velocity);
        }
      }
    }
    if (up.y < 0.05) racer.overturnedSeconds += STEP;
    else racer.overturnedSeconds = Math.max(0, racer.overturnedSeconds - STEP * 2);
    if (Math.abs(racer.chassis.velocity.z) < 0.5 && this.elapsed > 2) racer.stalledSeconds += STEP;
    else racer.stalledSeconds = 0;
    const fellOff = position.y < groundHeight(position.z) - 5 || position.z < START_Z - 5;
    if (racer.overturnedSeconds > 0.7 || racer.stalledSeconds > STALL_SECONDS || fellOff) {
      if (racer.overturnedSeconds > 0.7) {
        racer.flips += 1;
        this.record(racer, 'flip', tilt);
      }
      this.recover(racer);
    }
    racer.lastZ = position.z;
  }

  private hop(racer: Racer): void {
    // Equal stored spring energy still gives heavier builds less launch velocity.
    const charge = racer.charge / MAX_CHARGE_SECONDS;
    const hopSpeed = (2.2 + 6 * charge) * Math.sqrt(128 / racer.chassis.mass);
    racer.chassis.applyImpulse(new Vec3(0, racer.chassis.mass * hopSpeed, 0));
    racer.jumps += 1;
    racer.grounded = false;
    racer.charge = 0;
    racer.bufferedRelease = 0;
    racer.lastGroundedAt = -Infinity;
    racer.launchLock = 0.16;
    racer.airborneAt = this.elapsed;
    this.record(racer, 'jump', charge);
  }

  private recover(racer: Racer): void {
    // Right the car just behind its crash on the catch road. Replaying a distant
    // checkpoint with identical momentum can trap a novice in the same crash forever.
    // Never put a car farther along than it got, even if it rolled backwards.
    const setback = getBody(racer.blueprint.bodyId).length * 0.6 + 0.5;
    racer.recoveryZ = Math.max(START_Z, racer.chassis.position.z - setback);
    racer.recoveries += 1;
    racer.recoveryLeft = RECOVERY_SECONDS;
    racer.charge = 0;
    racer.bufferedRelease = 0;
    racer.lastGroundedAt = -Infinity;
    racer.grounded = false;
    racer.overturnedSeconds = 0;
    racer.stalledSeconds = 0;
    this.record(racer, 'recovery');
    racer.chassis.velocity.setZero();
    racer.chassis.angularVelocity.setZero();
  }

  private placeAt(racer: Racer, z: number, restoreVelocity = false): void {
    const body = getBody(racer.blueprint.bodyId);
    const wheel = getWheel(racer.blueprint.wheelId);
    // A slope-aligned pose avoids a gratuitous landing bounce at the start/checkpoint.
    const slope = (groundHeight(z + 0.2) - groundHeight(z - 0.2)) / 0.4;
    racer.chassis.quaternion.setFromEuler(Math.atan(-slope), 0, 0, 'XYZ');
    racer.chassis.position.set(LANE_CENTERS[racer.id], groundHeight(z) + body.height / 2 + wheel.radius + 0.26 + body.comHeight, z);
    racer.chassis.previousPosition.copy(racer.chassis.position);
    racer.chassis.interpolatedPosition.copy(racer.chassis.position);
    racer.chassis.previousQuaternion.copy(racer.chassis.quaternion);
    racer.chassis.interpolatedQuaternion.copy(racer.chassis.quaternion);
    racer.chassis.velocity.setZero();
    // Recovery restores a previously measured safe momentum, never an invented speed boost.
    if (restoreVelocity) racer.chassis.velocity.copy(racer.checkpointVelocity);
    racer.chassis.angularVelocity.setZero();
    racer.chassis.force.setZero();
    racer.chassis.torque.setZero();
    racer.chassis.aabbNeedsUpdate = true;
    racer.chassis.wakeUp();
    // A thumb held through recovery resumes charging on contact; cancellation still wins.
    if (!restoreVelocity) racer.held = false;
    racer.charge = 0;
    racer.bufferedRelease = 0;
    racer.lastGroundedAt = -Infinity;
    racer.grounded = false;
    racer.launchLock = 0.1;
    for (let i = 0; i < racer.vehicle.wheelInfos.length; i++) {
      const wheelInfo = racer.vehicle.wheelInfos[i];
      wheelInfo.rotation = 0;
      wheelInfo.deltaRotation = 0;
      wheelInfo.isInContact = false;
      wheelInfo.suspensionLength = wheelInfo.suspensionRestLength;
      racer.vehicle.updateWheelTransform(i);
      racer.vehicle.setBrake(0, i);
      racer.vehicle.applyEngineForce(0, i);
    }
  }

  private record(racer: Racer, type: DerbyEvent['type'], value?: number): void {
    this.events.push({ playerId: racer.id, type, time: Number(this.elapsed.toFixed(3)), z: Number(racer.chassis.position.z.toFixed(2)), value });
    if (this.events.length > 300) this.events.shift();
  }

  private removeRacer(racer: Racer): void {
    racer.vehicle.removeFromWorld(this.world);
    this.world.removeConstraint(racer.laneConstraint);
    this.world.removeBody(racer.laneAnchor);
  }

  private quat(value: Quaternion) {
    return { x: value.x, y: value.y, z: value.z, w: value.w };
  }
}
