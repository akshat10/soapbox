import { Body, Box, ContactMaterial, ConvexPolyhedron, GSSolver, Material, PointToPointConstraint, Quaternion, RaycastResult, RaycastVehicle, SAPBroadphase, Vec3, World } from 'cannon-es';
import { getBody, getWheel, isLegalBuild, wheelMounts } from './catalogue';
import { BAY_OR_BUST_COURSE, BAY_CIRCUIT_COURSE, type DerbyCourse, type RoadProjection } from './course';
import { applyArcadeDrive, ARCADE_DRIVE, roadSpeedLimit } from './arcade-drive';
import { containOnTrack } from './track-boundary';
import { MANUAL_BOOST, boostRechargeRate } from './manual-boost';
import { bridgeColliders, OBSTACLE_GROUP } from './course-obstacles';
import { AERIAL_RINGS, BOOST_PADS, ROUGH_PATCHES, BOOST_SPEED_GAIN, BOOST_SPEED_CAP, BOOST_FEEDBACK_SECONDS, RESET_BOOST_SECONDS, RESET_SPEED_GAIN, ROUGH_RESISTANCE, insideStrip } from './course-features';
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

/** Cannon wheel rays use rayTest without a mask. Scope them to road support so
 * passing racers cannot become each other's suspension contact or receive tire impulses. */
class RaceWorld extends World {
  override rayTest(from:Vec3,to:Vec3,result:Parameters<World['rayTest']>[2]):void {
    const options={skipBackfaces:true,collisionFilterGroup:VEHICLE_GROUP,collisionFilterMask:GROUND_GROUP};
    if(result instanceof RaycastResult)this.raycastClosest(from,to,options,result);
    else this.raycastAll(from,to,options,result);
  }
}

export interface PhysicsOptions { steeringEnabled?: boolean; course?: 'classic' | 'bay-or-bust'; circuit?: boolean; arcade?: boolean; laps?: number }

export interface DerbyEvent {
  playerId: PlayerId;
  type: 'jump' | 'landing' | 'flip' | 'recovery' | 'collision' | 'finish' | 'boost' | 'ring' | 'rough' | 'lap';
  time: number;
  z: number;
  value?: number;
  pathDistance?: number;
  pathId?: string;
}

interface Racer {
  id: PlayerId;
  blueprint: Blueprint;
  chassis: Body;
  vehicle: RaycastVehicle;
  laneAnchor: Body | null;
  laneConstraint: PointToPointConstraint | null;
  boosts: Set<string>;
  collectedRings: Set<string>;
  boostRemaining: number;
  boostCharge: number;
  manualBoosts: number;
  onRough: boolean;
  lap: number;
  lapStartedAt: number;
  bestLap: number | null;
  lastLap: number | null;
  lapCheckpoint: number;
  totalBoosts: number;
  totalRings: number;
  steering: number;
  steeringAngle: number;
  wheelbaseLength: number;
  route: RoadProjection | null;
  lastCoursePosition: Vec3;
  validCourseDistance: number;
  offRoadSeconds: number;
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
  stepSpeed: number;
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
  private trackBodies: Body[] = [];
  private course: DerbyCourse | null = null;
  private steeringEnabled = false;
  private arcadeEnabled = false;
  private lapCount = 1;

  constructor() {
    this.world = new RaceWorld({ gravity: new Vec3(0, -9.82, 0), allowSleep: false });
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
    this.world.addContactMaterial(new ContactMaterial(this.chassisMaterial, this.chassisMaterial, {
      friction: 0.08, restitution: 0.15,
      contactEquationStiffness: 1e7, contactEquationRelaxation: 4,
    }));

    this.buildTrack();
  }

  private buildTrack(): void {
    for (const body of this.trackBodies) this.world.removeBody(body);
    this.trackBodies = [];
    if (this.course) {
      const triangles = this.course.roadTriangles();
      // Ten small convex prisms per authored road segment. Box/convex chassis
      // collisions work here; Cannon's Trimesh does not handle a box chassis.
      for (let index = 0; index < triangles.length; index += 10) {
        const origin = triangles[index].points[0];
        const body = new Body({ mass: 0, material: this.groundMaterial, position: origin,
          collisionFilterGroup: GROUND_GROUP, collisionFilterMask: VEHICLE_GROUP });
        for (const triangle of triangles.slice(index, index + 10)) {
          const [a, b, c] = triangle.points;
          const normal = b.vsub(a).cross(c.vsub(a)); normal.normalize();
          const worldVertices = [...triangle.points, ...triangle.points.map(point => point.vsub(normal.scale(triangle.thickness)))];
          const center = worldVertices.reduce((sum, point) => sum.vadd(point), new Vec3()).scale(1 / 6);
          const vertices = worldVertices.map(point => point.vsub(center));
          body.addShape(new ConvexPolyhedron({ vertices, faces: [[0, 1, 2], [3, 5, 4], [0, 3, 4, 1], [1, 4, 5, 2], [2, 5, 3, 0]] }), center.vsub(origin));
        }
        this.trackBodies.push(body); this.world.addBody(body);
      }
      for (const body of bridgeColliders(this.course, this.groundMaterial)) {
        this.trackBodies.push(body); this.world.addBody(body);
      }
      return;
    }
    for (const piece of TRACK_PIECES) {
      const body = new Body({ mass: 0, material: this.groundMaterial,
        collisionFilterGroup: GROUND_GROUP, collisionFilterMask: VEHICLE_GROUP });
      body.addShape(new Box(new Vec3(piece.size[0] / 2, piece.size[1] / 2, piece.size[2] / 2)));
      body.position.set(...piece.position);
      body.quaternion.setFromEuler(...piece.rotation, 'XYZ');
      this.world.addBody(body);
      this.trackBodies.push(body);
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
      angularDamping: this.arcadeEnabled ? 0.32 : 0.16,
      collisionFilterGroup: VEHICLE_GROUP,
      collisionFilterMask: GROUND_GROUP | VEHICLE_GROUP | OBSTACLE_GROUP,
      allowSleep: false,
    });
    chassis.addShape(new Box(new Vec3(body.width / 2, body.height / 2, body.length / 2)), new Vec3(0, -body.comHeight, 0));
    // One-button lanes constrain translation across the road and yaw; pitch and roll remain physical.
    chassis.angularFactor.set(1, this.steeringEnabled ? 1 : 0, 1);
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
          rollInfluence: this.arcadeEnabled ? 0.04 : 0.12,
          useCustomSlidingRotationalSpeed: false,
        });
    }
    vehicle.addToWorld(this.world);
    // A physical planar joint keeps each chassis in its lane. Wheel impulses bypass
    // Cannon's linearFactor, so a solver constraint is needed rather than a visual correction.
    let laneAnchor: Body | null = null, laneConstraint: PointToPointConstraint | null = null;
    if (!this.steeringEnabled) {
      laneAnchor = new Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
      laneAnchor.position.set(LANE_CENTERS[id], 0, 0);
      this.world.addBody(laneAnchor);
      laneConstraint = new PointToPointConstraint(chassis, new Vec3(), laneAnchor, new Vec3(), 1e6);
      laneConstraint.equationY.enabled = false;
      laneConstraint.equationZ.enabled = false;
      this.world.addConstraint(laneConstraint);
    }
    const racer: Racer = {
      id, blueprint: { ...blueprint }, chassis, vehicle, laneAnchor, laneConstraint,
      boosts: new Set(), collectedRings: new Set(), boostRemaining: 0, boostCharge: 1, manualBoosts: 0, onRough: false,
      lap: 1, lapStartedAt: 0, bestLap: null, lastLap: null, lapCheckpoint: 1, totalBoosts: 0, totalRings: 0,
      steering: 0, steeringAngle: 0, wheelbaseLength: Math.abs(wheelMounts(blueprint)[0][2] - wheelMounts(blueprint)[2][2]),
      route: null, lastCoursePosition: new Vec3(), validCourseDistance: this.course?.startDistance ?? START_Z, offRoadSeconds: 0,
      held: false, charge: 0, grounded: false, launchLock: 0, recoveryLeft: 0,
      finished: false, finishTime: null, flips: 0, recoveries: 0, jumps: 0, maxRoll: 0,
      overturnedSeconds: 0, stalledSeconds: 0, checkpointZ: START_Z,
      checkpointVelocity: new Vec3(),
      recoveryZ: START_Z,
      lastZ: START_Z, collisionAt: -10, stepSpeed: 0, airborneAt: 0,
      lastGroundedAt: -Infinity, bufferedRelease: 0,
    };
    this.racers.set(id, racer);
    this.placeAt(racer, this.course ? this.course.startDistance + Math.floor(id / 4) * 5.5 : START_Z);
    chassis.addEventListener('collide', (event: { contact: { getImpactVelocityAlongNormal(): number } }) => {
      const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
      if (impact > 2.5 && this.elapsed - racer.collisionAt > 0.7 && !racer.recoveryLeft && !racer.finished) {
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

  setSteering(id: PlayerId, value: number): void {
    const racer = this.racers.get(id);
    if (!racer || !this.steeringEnabled || !this.running || racer.finished) return;
    racer.steering = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  }

  cancelSteering(id: PlayerId): void {
    const racer = this.racers.get(id);
    if (racer) racer.steering = 0;
  }

  /** A tap starts one timed burst. Held/repeated keys cannot stack boosts. */
  activateBoost(id: PlayerId): boolean {
    const racer = this.racers.get(id);
    if (!this.running || !this.arcadeEnabled || !racer || racer.finished || racer.recoveryLeft > 0 || racer.boostCharge < 1 || racer.boostRemaining > 0) return false;
    racer.boostCharge = 0;
    racer.boostRemaining = MANUAL_BOOST.duration;
    racer.manualBoosts++;
    this.record(racer, 'boost', MANUAL_BOOST.duration);
    return true;
  }

  /** Focus loss and screen changes clear state without treating release as a jump. */
  clearInputs(): void {
    for (const racer of this.racers.values()) {
      racer.held = false;
      racer.charge = 0;
      racer.bufferedRelease = 0;
      racer.steering = 0;
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
      const progress = (racer: Racer) => this.course ? (racer.lap - 1 + this.course.progress(racer.validCourseDistance)) / this.lapCount : 0;
      const leaderProgress = Math.max(0, ...[...this.racers.values()].map(progress));
      for (const racer of this.racers.values()) {
        if (racer.finished) continue;
        if (this.steeringEnabled) {
          const speed = Math.hypot(racer.chassis.velocity.x, racer.chassis.velocity.z);
          const radius = 8 + 0.2 * Math.min(speed, 10);
          const target = (racer.finished || racer.recoveryLeft > 0 ? 0 : racer.steering) * Math.atan(racer.wheelbaseLength / radius);
          const maxChange = (racer.steering === 0 ? 2 : 1.5) * STEP;
          racer.steeringAngle += Math.max(-maxChange, Math.min(maxChange, target - racer.steeringAngle));
          racer.vehicle.setSteeringValue(racer.steeringAngle, 0);
          racer.vehicle.setSteeringValue(racer.steeringAngle, 1);
        }
        racer.boostRemaining = Math.max(0, racer.boostRemaining - STEP);
        if (this.arcadeEnabled && racer.boostRemaining === 0) racer.boostCharge = Math.min(1, racer.boostCharge + STEP * boostRechargeRate(progress(racer), leaderProgress));
        if (this.arcadeEnabled && this.course && racer.route && !racer.finished && racer.recoveryLeft <= 0) {
          applyArcadeDrive(racer.chassis, racer.route, this.course, racer.grounded, racer.boostRemaining > 0, STEP, racer.steeringAngle, racer.wheelbaseLength);
        }
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
      for (const racer of this.racers.values()) racer.stepSpeed = racer.chassis.velocity.length();
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
        progress: this.course ? (racer.lap - 1 + this.course.progress(racer.validCourseDistance)) / this.lapCount : Math.max(0, Math.min(1, ((racer.recoveryLeft > 0 ? racer.recoveryZ : chassis.position.z) - START_Z) / (FINISH_Z - START_Z))),
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
        ...(this.arcadeEnabled ? { boostCharge: racer.boostCharge, manualBoosts: racer.manualBoosts } : {}),
        ...(this.course && racer.route ? { courseId: this.course.id, pathId: racer.route.pathId, pathDistance: racer.route.distance, boosts: racer.totalBoosts, rings: racer.totalRings, collectedRings: [...racer.collectedRings], boostRemaining: racer.boostRemaining, onRough: racer.onRough } : {}),
        ...(this.course?.circuit ? { circuit: true, lap: racer.lap, laps: this.lapCount, lapTime: racer.finished ? racer.lastLap! : this.elapsed - racer.lapStartedAt, bestLap: racer.bestLap, lastLap: racer.lastLap } : {}),
      };
    });
  }

  reset(blueprints: Blueprint[], racerIds: PlayerId[] = blueprints.slice(0, 4).map((_, id) => id as PlayerId), options?: PhysicsOptions): void {
    this.running = false;
    for (const racer of this.racers.values()) this.removeRacer(racer);
    this.racers.clear();
    if (options) {
      const course = options.course === undefined ? this.course : options.course === 'bay-or-bust' ? (options.circuit ? BAY_CIRCUIT_COURSE : BAY_OR_BUST_COURSE) : null;
      const steering = options.steeringEnabled ?? this.steeringEnabled;
      if (course && !steering) throw new Error('The curved course requires physical steering.');
      this.steeringEnabled = steering;
      this.arcadeEnabled = options.arcade ?? (options.course === undefined ? this.arcadeEnabled : false);
      this.lapCount = course?.circuit ? Math.max(1, Math.min(9, Math.floor(options.laps ?? 3) || 3)) : 1;
      if (course !== this.course) { this.course = course; this.buildTrack(); }
    }
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
    if (racer.finished || racer.recoveryLeft > 0) { racer.onRough = false; return; }
    if (racer.grounded) {
      racer.lastGroundedAt = this.elapsed;
      if (racer.bufferedRelease > 0) this.hop(racer);
    }
    const position = racer.chassis.position;
    let forwardSpeed = racer.chassis.velocity.z;
    let fellOff = position.y < groundHeight(position.z) - 5 || position.z < START_Z - 5;
    if (this.course) {
      const previous = racer.route ?? { pathId: 'main', distance: this.course.startDistance };
      let projection = this.course.project(position, previous);
      const plausibleTravel = Math.max(0.15, Math.max(racer.stepSpeed, racer.chassis.velocity.length()) * STEP * 2 + 0.1);
      // On an inside bend, nearest-segment projection can jump across a road
      // sample even though the car moves only centimetres. Allow that seam in
      // course distance, but independently verify actual chassis travel so a
      // relocation cannot earn progress. Keep the last accepted position on
      // rejection; a stationary teleported car must still recover.
      const continuous = position.distanceTo(racer.lastCoursePosition) <= plausibleTravel
        && Math.abs(projection.distance - previous.distance) <= plausibleTravel + this.course.maxSampleSpacing;
      // Validate the uncorrected motion first: containment cannot turn a
      // teleport across a hairpin into accepted race progress.
      if (continuous) {
        const impact = containOnTrack(racer.chassis, racer.blueprint, projection);
        projection = this.course.project(position, projection);
        if (impact > 2.5 && this.elapsed - racer.collisionAt > .7) {
          racer.collisionAt = this.elapsed;
          this.record(racer, 'collision', impact);
        }
      }
      const onRoad = projection.separation <= projection.width / 2 + 0.7 && projection.height > -2.5;
      if (continuous) {
        racer.route = projection;
        racer.lastCoursePosition.copy(position);
      }
      if (continuous && onRoad) {
        racer.validCourseDistance = projection.mainDistance;
        if (this.course.circuit && racer.lapCheckpoint <= 3 && projection.mainDistance >= this.course.finishDistance * racer.lapCheckpoint / 4) racer.lapCheckpoint++;
      }
      racer.offRoadSeconds = continuous && onRoad ? 0 : racer.offRoadSeconds + STEP;
      forwardSpeed = racer.chassis.velocity.dot(projection.tangent);
      fellOff = projection.height < -4 || racer.offRoadSeconds > 0.45;
      if (continuous && onRoad) this.updateCourseFeatures(racer, projection);
      else racer.onRough = false;
      if (racer.grounded && tilt < 0.55 && forwardSpeed > 0.5 && onRoad && continuous) {
        racer.checkpointVelocity.copy(racer.chassis.velocity);
      }
    }

    const finished = this.course
      ? racer.validCourseDistance >= this.course.finishDistance && racer.offRoadSeconds === 0 && (!this.course.circuit || (racer.lapCheckpoint === 4 && forwardSpeed > 0))
      : position.z >= FINISH_Z && position.y > groundHeight(FINISH_Z) - 4;
    if (finished) {
      if (this.course?.circuit) {
        racer.lastLap = this.elapsed - racer.lapStartedAt;
        racer.bestLap = Math.min(racer.bestLap ?? Infinity, racer.lastLap);
        this.record(racer, 'lap', racer.lastLap);
        if (racer.lap < this.lapCount) {
          racer.lap++;
          racer.lapStartedAt = this.elapsed;
          racer.lapCheckpoint = 1;
          racer.boosts.clear();
          racer.collectedRings.clear();
          racer.route = this.course.project(position, { pathId: 'main', distance: 0 });
          racer.validCourseDistance = racer.route.distance;
          racer.recoveryZ = 0;
          return;
        }
      }
      racer.finished = true;
      racer.finishTime = this.elapsed;
      // Keep the winning pose on screen while rivals finish. The short runoff
      // must never turn an already-finished racer into an endless free fall.
      racer.chassis.type = Body.KINEMATIC;
      racer.chassis.velocity.setZero();
      racer.chassis.angularVelocity.setZero();
      racer.chassis.force.setZero();
      racer.chassis.torque.setZero();
      // Stop suspension/wheel integration too, preserving the complete winning
      // pose while remaining racers finish. The renderer retains these poses.
      racer.vehicle.removeFromWorld(this.world);
      racer.held = false;
      racer.charge = 0;
      racer.steering = 0;
      racer.boostRemaining = 0;
      racer.onRough = false;
      this.record(racer, 'finish');
      return;
    }

    if (!this.course && racer.grounded && tilt < 0.55 && racer.chassis.velocity.z > 0.5) {
      for (const checkpoint of CHECKPOINT_ZS) {
        if (checkpoint > racer.checkpointZ && checkpoint <= position.z - 1) {
          racer.checkpointZ = checkpoint;
          racer.checkpointVelocity.copy(racer.chassis.velocity);
        }
      }
    }
    if (up.y < 0.05) racer.overturnedSeconds += STEP;
    else racer.overturnedSeconds = Math.max(0, racer.overturnedSeconds - STEP * 2);
    if (Math.abs(forwardSpeed) < 0.5 && this.elapsed > 2) racer.stalledSeconds += STEP;
    else racer.stalledSeconds = 0;
    if (racer.overturnedSeconds > 0.7 || racer.stalledSeconds > STALL_SECONDS || fellOff) {
      if (racer.overturnedSeconds > 0.7) {
        racer.flips += 1;
        this.record(racer, 'flip', tilt);
      }
      this.recover(racer);
    }
    racer.lastZ = position.z;
  }

  private updateCourseFeatures(racer: Racer, route: RoadProjection): void {
    const forwardSpeed = racer.chassis.velocity.dot(route.tangent);
    const facing = racer.chassis.quaternion.vmult(new Vec3(0, 0, 1)).dot(route.tangent);
    const driving = facing > .5 && forwardSpeed > .5;
    const rough = racer.grounded && driving && ROUGH_PATCHES.some(strip => insideStrip(strip, route.distance, route.lateral));
    if (rough) {
      // Rolling resistance changes forward momentum only. Steering/grip stay
      // predictable, and the strip cannot stop a novice's car at low speed.
      const loss = Math.max(0, forwardSpeed - 3) * (1 - Math.exp(-ROUGH_RESISTANCE * STEP));
      racer.chassis.applyImpulse(route.tangent.scale(-racer.chassis.mass * loss));
      if (!racer.onRough) this.record(racer, 'rough');
    }
    racer.onRough = rough;
    if (racer.grounded && driving) {
      for (const pad of BOOST_PADS) {
        if (racer.boosts.has(pad.id) || !insideStrip(pad, route.distance, route.lateral)) continue;
        const cap = this.arcadeEnabled ? Math.min(ARCADE_DRIVE.boostSpeed,roadSpeedLimit(this.course!,route.distance,forwardSpeed,true)) : BOOST_SPEED_CAP;
        const gain = Math.min(this.arcadeEnabled ? 6 : BOOST_SPEED_GAIN, Math.max(0, cap - forwardSpeed));
        if (gain <= 0) continue;
        // A physical, mass-scaled impulse; it cannot teleport or grant progress.
        racer.chassis.applyImpulse(route.tangent.scale(racer.chassis.mass * gain));
        racer.boosts.add(pad.id);
        racer.totalBoosts++;
        racer.boostRemaining = Math.max(racer.boostRemaining, BOOST_FEEDBACK_SECONDS);
        this.record(racer, 'boost', gain);
      }
    }
    if (!racer.grounded && driving) {
      const body = getBody(racer.blueprint.bodyId);
      const center = racer.chassis.pointToWorldFrame(new Vec3(0, -body.comHeight, 0));
      for (const ring of AERIAL_RINGS) {
        const radius = this.course?.circuit ? ring.circuitRadius ?? ring.radius : ring.radius;
        if (racer.collectedRings.has(ring.id) || Math.abs(route.distance - ring.distance) > radius + ring.height + 2) continue;
        const frame = this.course!.frame(ring.distance);
        const target = frame.position.vadd(frame.right.scale(ring.lateral)).vadd(frame.up.scale(ring.height));
        const previousCenter = racer.chassis.previousPosition.vadd(racer.chassis.previousQuaternion.vmult(new Vec3(0, -body.comHeight, 0)));
        const before = previousCenter.vsub(target).dot(frame.tangent);
        const after = center.vsub(target).dot(frame.tangent);
        // Crossing the opening, not touching an invisible sphere beside it.
        if (before > 0 || after < 0 || after - before < 1e-8) continue;
        const crossing = previousCenter.vadd(center.vsub(previousCenter).scale(-before / (after - before))).vsub(target);
        if (crossing.dot(frame.right) ** 2 + crossing.dot(frame.up) ** 2 > radius ** 2) continue;
        racer.collectedRings.add(ring.id);
        racer.totalRings++;
        // A reset grants real forward momentum plus a temporary powered window.
        // Preserve vertical jump velocity, lap eligibility and manual boost charge.
        const cap = this.arcadeEnabled ? ARCADE_DRIVE.boostSpeed : BOOST_SPEED_CAP;
        const gain = Math.min(RESET_SPEED_GAIN, Math.max(0, cap - racer.chassis.velocity.dot(frame.tangent)));
        racer.chassis.applyImpulse(frame.tangent.scale(racer.chassis.mass * gain));
        racer.boostRemaining = Math.max(racer.boostRemaining, RESET_BOOST_SECONDS);
        this.record(racer, 'ring', racer.totalRings);
      }
    }
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
    racer.recoveryZ = this.course
      ? Math.max(this.course.circuit && racer.lap > 1 ? 0 : this.course.startDistance, racer.validCourseDistance - setback)
      : Math.max(START_Z, racer.chassis.position.z - setback);
    if (this.course) racer.validCourseDistance = racer.recoveryZ;
    racer.recoveries += 1;
    racer.recoveryLeft = RECOVERY_SECONDS;
    // A car being righted must not pin another racer in place.
    racer.chassis.collisionFilterMask = GROUND_GROUP | OBSTACLE_GROUP;
    racer.boostRemaining = 0;
    racer.onRough = false;
    racer.charge = 0;
    racer.bufferedRelease = 0;
    racer.lastGroundedAt = -Infinity;
    racer.grounded = false;
    racer.overturnedSeconds = 0;
    racer.stalledSeconds = 0;
    racer.offRoadSeconds = 0;
    this.record(racer, 'recovery');
    racer.chassis.velocity.setZero();
    racer.chassis.angularVelocity.setZero();
  }

  private placeAt(racer: Racer, z: number, restoreVelocity = false): void {
    racer.chassis.collisionFilterMask = GROUND_GROUP | VEHICLE_GROUP | OBSTACLE_GROUP;
    const body = getBody(racer.blueprint.bodyId);
    const wheel = getWheel(racer.blueprint.wheelId);
    // A slope-aligned pose avoids a gratuitous landing bounce at the start/checkpoint.
    const height = body.height / 2 + wheel.radius + 0.26 + body.comHeight;
    if (this.course) {
      const frame = this.course.frame(z, racer.route?.pathId ?? 'main');
      // Recover close to the driver's former line, safely inside the road edge.
      const offset = restoreVelocity ? Math.max(-5, Math.min(5, racer.route?.lateral ?? LANE_CENTERS[racer.id % 4])) : LANE_CENTERS[racer.id % 4];
      racer.chassis.quaternion.copy(this.course.orientation(frame));
      racer.chassis.position.copy(frame.position.vadd(frame.right.scale(offset)).vadd(frame.up.scale(height)));
      racer.route = this.course.project(racer.chassis.position, frame);
      racer.validCourseDistance = this.course.mainDistance(frame);
    } else {
      const slope = (groundHeight(z + 0.2) - groundHeight(z - 0.2)) / 0.4;
      racer.chassis.quaternion.setFromEuler(Math.atan(-slope), 0, 0, 'XYZ');
      racer.chassis.position.set(LANE_CENTERS[racer.id], groundHeight(z) + height, z);
    }
    racer.chassis.previousPosition.copy(racer.chassis.position);
    racer.lastCoursePosition.copy(racer.chassis.position);
    racer.chassis.interpolatedPosition.copy(racer.chassis.position);
    racer.chassis.previousQuaternion.copy(racer.chassis.quaternion);
    racer.chassis.interpolatedQuaternion.copy(racer.chassis.quaternion);
    racer.chassis.velocity.setZero();
    // Recovery restores a previously measured safe momentum, never an invented speed boost.
    if (restoreVelocity) {
      if (this.course && racer.route) {
        const safeSpeed = Math.max(0, racer.checkpointVelocity.dot(racer.route.tangent));
        racer.chassis.velocity.copy(racer.route.tangent.scale(safeSpeed));
      } else racer.chassis.velocity.copy(racer.checkpointVelocity);
    }
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
    racer.steeringAngle = 0;
    for (let i = 0; i < racer.vehicle.wheelInfos.length; i++) {
      const wheelInfo = racer.vehicle.wheelInfos[i];
      wheelInfo.rotation = 0;
      wheelInfo.deltaRotation = 0;
      wheelInfo.isInContact = false;
      wheelInfo.suspensionLength = wheelInfo.suspensionRestLength;
      racer.vehicle.updateWheelTransform(i);
      racer.vehicle.setBrake(0, i);
      racer.vehicle.setSteeringValue(0, i);
      racer.vehicle.applyEngineForce(0, i);
    }
  }

  private record(racer: Racer, type: DerbyEvent['type'], value?: number): void {
    this.events.push({ playerId: racer.id, type, time: Number(this.elapsed.toFixed(3)), z: Number(racer.chassis.position.z.toFixed(2)), value,
      ...(racer.route ? { pathDistance: racer.route.distance, pathId: racer.route.pathId } : {}) });
    if (this.events.length > 300) this.events.shift();
  }

  private removeRacer(racer: Racer): void {
    racer.vehicle.removeFromWorld(this.world);
    if (racer.laneConstraint) this.world.removeConstraint(racer.laneConstraint);
    if (racer.laneAnchor) this.world.removeBody(racer.laneAnchor);
  }

  private quat(value: Quaternion) {
    return { x: value.x, y: value.y, z: value.z, w: value.w };
  }
}
