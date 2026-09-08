import { Quaternion, Vec3 } from 'cannon-es';
import layout from './course-layout.json';

type Vector = { x: number; y: number; z: number };
export type CourseLocation = { pathId: string; distance: number };
export interface RoadFrame extends CourseLocation {
  position: Vec3; tangent: Vec3; right: Vec3; up: Vec3; width: number; sector: string;
}
export interface RoadProjection extends RoadFrame {
  lateral: number; height: number; separation: number; mainDistance: number;
}
type Path = { id: string; mainEntryS?: number; mainRejoinS?: number; samples: { s: number; position: number[]; tangent: number[]; right: number[]; up: number[]; width: number; sector: string }[] };
const vector = (values: number[]) => new Vec3(values[0], values[1], values[2]);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Shared path geometry for physics, cameras and effects. Distances are metres,
 * never world Z. This first driving course uses the validated main road only. */
export class DerbyCourse {
  readonly id = 'bay-or-bust' as const;
  readonly startDistance = 2.99951;
  readonly finishDistance = 424.53976; // Painted finish, ahead of the 7m runoff.
  readonly enabledPaths = ['main'];
  readonly paths: Path[] = layout.paths;
  readonly sectors = layout.sectors;

  private path(id: string): Path {
    const path = this.paths.find(path => path.id === id);
    if (!path) throw new Error(`Unknown course path: ${id}`);
    return path;
  }

  private segment(path: Path, distance: number): number {
    let lo = 0, hi = path.samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (path.samples[mid].s <= distance) lo = mid; else hi = mid;
    }
    return lo;
  }

  frame(distance: number, pathId = 'main'): RoadFrame {
    const path = this.path(pathId);
    const s = clamp(distance, 0, path.samples.at(-1)!.s);
    const index = this.segment(path, s), a = path.samples[index], b = path.samples[index + 1];
    const t = (s - a.s) / (b.s - a.s);
    const mix = (key: 'position' | 'tangent' | 'up') => vector(a[key].map((v, i) => v + (b[key][i] - v) * t));
    const tangent = mix('tangent'); tangent.normalize();
    const upHint = mix('up'); upHint.normalize();
    const right = upHint.cross(tangent); right.normalize();
    const up = tangent.cross(right); up.normalize();
    return { pathId, distance: s, position: mix('position'), tangent, right, up,
      width: a.width + (b.width - a.width) * t, sector: a.sector };
  }

  /** Continuity-bounded projection prevents a nearby hairpin granting progress. */
  project(position: Vector, previous: CourseLocation, window = 12): RoadProjection {
    const path = this.path(previous.pathId);
    const lo = Math.max(0, previous.distance - window), hi = Math.min(path.samples.at(-1)!.s, previous.distance + window);
    let best = Infinity, distance = clamp(previous.distance, lo, hi);
    for (let i = this.segment(path, lo); i < path.samples.length - 1 && path.samples[i].s <= hi; i++) {
      const a = path.samples[i], b = path.samples[i + 1];
      const dx = b.position[0] - a.position[0], dz = b.position[2] - a.position[2];
      const minT = clamp((lo - a.s) / (b.s - a.s), 0, 1), maxT = clamp((hi - a.s) / (b.s - a.s), 0, 1);
      const t = clamp(((position.x - a.position[0]) * dx + (position.z - a.position[2]) * dz) / (dx * dx + dz * dz), minT, maxT);
      const x = a.position[0] + dx * t, z = a.position[2] + dz * t;
      const score = (position.x - x) ** 2 + (position.z - z) ** 2;
      if (score < best) { best = score; distance = a.s + (b.s - a.s) * t; }
    }
    const frame = this.frame(distance, path.id);
    const delta = new Vec3(position.x - frame.position.x, position.y - frame.position.y, position.z - frame.position.z);
    const lateral = (delta.x * frame.right.x + delta.z * frame.right.z) / (frame.right.x ** 2 + frame.right.z ** 2);
    const surface = frame.position.vadd(frame.right.scale(lateral));
    const height = new Vec3(position.x - surface.x, position.y - surface.y, position.z - surface.z).dot(frame.up);
    return { ...frame, lateral, height, separation: Math.sqrt(best), mainDistance: this.mainDistance({ pathId: path.id, distance }) };
  }

  mainDistance(location: CourseLocation): number {
    const path = this.path(location.pathId);
    if (path.id === 'main') return location.distance;
    return path.mainEntryS! + location.distance / path.samples.at(-1)!.s * (path.mainRejoinS! - path.mainEntryS!);
  }

  progress(distance: number): number {
    return clamp((distance - this.startDistance) / (this.finishDistance - this.startDistance), 0, 1);
  }

  orientation(frame: RoadFrame): Quaternion {
    // Same right/up/forward basis as the authored road, including bank and grade.
    const yaw = Math.atan2(frame.tangent.x, frame.tangent.z);
    const pitch = -Math.atan2(frame.tangent.y, Math.hypot(frame.tangent.x, frame.tangent.z));
    // Construct yaw/pitch first; then rotate around local forward to match bank.
    const base = new Quaternion(); base.setFromEuler(pitch, yaw, 0, 'YXZ');
    const baseRight = base.vmult(new Vec3(1, 0, 0)), baseUp = base.vmult(new Vec3(0, 1, 0));
    const bank = Math.atan2(frame.right.dot(baseUp), frame.right.dot(baseRight));
    const roll = new Quaternion(); roll.setFromAxisAngle(new Vec3(0, 0, 1), bank);
    return base.mult(roll);
  }

  /** Exact top ribbon corners; profiles use authored triangles, not smoothed up vectors. */
  roadTriangles(): { points: [Vec3, Vec3, Vec3]; thickness: number }[] {
    const result: { points: [Vec3, Vec3, Vec3]; thickness: number }[] = [];
    for (const path of this.paths.filter(path => this.enabledPaths.includes(path.id))) {
      const bands = [
        { lo: -7, hi: 7, height: 0, thickness: .35 },
        { lo: -7.7, hi: -7, height: .045, thickness: .52 },
        { lo: 7, hi: 7.7, height: .045, thickness: .52 },
        { lo: -7.75, hi: -7.3, height: .2, thickness: .2 },
        { lo: 7.3, hi: 7.75, height: .2, thickness: .2 },
      ];
      for (let i = 0; i < path.samples.length - 1; i++) {
        const a = path.samples[i], b = path.samples[i + 1];
        const at = (f: typeof a, lateral: number, height: number) => vector(f.position).vadd(vector(f.right).scale(lateral)).vadd(vector(f.up).scale(height));
        for (const band of bands) {
          const al = at(a, band.lo, band.height), ar = at(a, band.hi, band.height);
          const bl = at(b, band.lo, band.height), br = at(b, band.hi, band.height);
          result.push({ points: [al, br, ar], thickness: band.thickness }, { points: [al, bl, br], thickness: band.thickness });
        }
      }
    }
    return result;
  }
}

export const BAY_OR_BUST_COURSE = new DerbyCourse();
