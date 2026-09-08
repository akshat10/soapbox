import { Vec3 } from 'cannon-es';
import type { CoursePath } from './course';

export const RETURN_START = 431.53867;
export const CIRCUIT_LAPS = 3;

/** A real uphill return around the outside of the city. The road and its
 * collider consume these same metre-spaced samples, including both joins. */
export function closeCourse(main: CoursePath): CoursePath {
  const samples = main.samples.map(sample => ({ ...sample }));
  const first = samples[0], last = samples.at(-1)!;
  const points = [last.position, [-77, 4, 128], [-116, 12, 91], [-123, 26, -40], [-110, 31, -85], first.position].map(p => new Vec3(...p as [number, number, number]));
  const directions = points.map((point, i) => {
    if (i === 0) return new Vec3(...last.tangent as [number, number, number]);
    if (i === points.length - 1) return new Vec3(...first.tangent as [number, number, number]);
    const direction = points[i + 1].vsub(points[i - 1]); direction.normalize(); return direction;
  });
  let distance = last.s, previous = points[0];
  for (let section = 0; section < points.length - 1; section++) {
    const a = points[section], b = points[section + 1], span = a.distanceTo(b);
    const ma = directions[section].scale(span), mb = directions[section + 1].scale(span);
    const count = Math.ceil(span * 1.5);
    for (let step = 1; step <= count; step++) {
      const t = step / count, t2 = t * t, t3 = t2 * t;
      const position = a.scale(2*t3-3*t2+1).vadd(ma.scale(t3-2*t2+t)).vadd(b.scale(-2*t3+3*t2)).vadd(mb.scale(t3-t2));
      const tangent = a.scale(6*t2-6*t).vadd(ma.scale(3*t2-4*t+1)).vadd(b.scale(-6*t2+6*t)).vadd(mb.scale(3*t2-2*t)); tangent.normalize();
      const right = new Vec3(0,1,0).cross(tangent); right.normalize();
      const up = tangent.cross(right); up.normalize();
      distance += previous.distanceTo(position);
      samples.push({ s: distance, position: position.toArray(), tangent: tangent.toArray(), right: right.toArray(), up: up.toArray(), width: 14, sector: 'Skyline Run' });
      previous = position;
    }
  }
  // Preserve the authored tangent and bank exactly across the start seam.
  samples[samples.length - 1] = { ...first, s: distance, sector: 'Skyline Run' };
  return { ...main, samples };
}
