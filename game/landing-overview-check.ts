import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { BAY_CIRCUIT_COURSE as course } from './course';
import { fitOverviewCamera, overviewTarget } from './landing-overview';

// Independently project the actual collision road and sample-side landmark
// allowance. No helper frustum/extents are reused to decide containment.
const samples = course.paths.find(path => path.id === 'main')!.samples;
const points = course.roadTriangles().flatMap(triangle => triangle.points
  .map(point => new Vector3(point.x, point.y, point.z)));
for (const sample of samples) {
  for (const side of [-1, 1]) {
    for (const height of [0, 11, 22]) {
      points.push(new Vector3(
        sample.position[0] + sample.right[0] * side * (sample.width / 2 + 12),
        sample.position[1] + sample.right[1] * side * (sample.width / 2 + 12) + height,
        sample.position[2] + sample.right[2] * side * (sample.width / 2 + 12),
      ));
    }
  }
}
// Interpolated road frames also remain visible between the stored samples.
for (let i = 0; i < samples.length - 1; i += 3) {
  const frame = course.frame((samples[i].s + samples[i + 1].s) / 2);
  for (const side of [-1, 1]) {
    const point = frame.position.vadd(frame.right.scale(side * (frame.width / 2 + 12)));
    points.push(new Vector3(point.x, point.y + 22, point.z));
  }
}

const target = overviewTarget();
const anotherTarget = overviewTarget(); anotherTarget.set(0, 0, 0);
assert(overviewTarget().equals(target), 'Callers cannot mutate the shared orbit target.');
assert(target.toArray().every(Number.isFinite));
const orbits = [new Vector3(230, 280, 270)];
for (const yaw of [-160, -70, 0, 45, 130]) {
  for (const polar of [25, 50, 80]) {
    const a = yaw * Math.PI / 180, p = polar * Math.PI / 180;
    orbits.push(new Vector3(Math.sin(a) * Math.sin(p), Math.cos(p), Math.cos(a) * Math.sin(p)).multiplyScalar(460));
  }
}
const results: { viewport: string; orbitViews: number; projectedPoints: number; maximumXY: string }[] = [];
for (const [width, height] of [[900, 900], [1200, 800], [430, 500]]) {
  let maximumXY = 0;
  for (const offset of orbits) {
    const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.copy(target).add(offset); camera.lookAt(target); camera.zoom = 2.3;
    const direction = camera.getWorldDirection(new Vector3());
    fitOverviewCamera(camera, width / height);
    assert(direction.distanceTo(camera.getWorldDirection(new Vector3())) < 1e-10, 'Fitting preserves the chosen orbit direction.');
    assert(Math.abs((camera.right - camera.left) / (camera.top - camera.bottom) - width / height) < 1e-10, 'The viewport preserves world proportions.');
    const projection = camera.projectionMatrix.clone(), position = camera.position.clone();
    fitOverviewCamera(camera, width / height);
    assert(camera.projectionMatrix.equals(projection) && camera.position.equals(position), 'Repeated change callbacks do not drift or accumulate padding.');
    for (const worldPoint of points) {
      const ndc = worldPoint.clone().project(camera);
      assert(ndc.toArray().every(Number.isFinite), 'Every projected road/scenery point is finite.');
      assert(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && Math.abs(ndc.z) < 1,
        `${width}x${height}: road/scenery point ${worldPoint.toArray().join(',')} clipped at ${ndc.toArray().join(',')}`);
      maximumXY = Math.max(maximumXY, Math.abs(ndc.x), Math.abs(ndc.y));
    }
  }
  results.push({ viewport: `${width}x${height}`, orbitViews: orbits.length, projectedPoints: points.length * orbits.length, maximumXY: maximumXY.toFixed(4) });
}

// Very close camera positions must also fit depth without flipping direction.
const close = new OrthographicCamera(); close.position.copy(target).add(new Vector3(1, 2, 1)); close.lookAt(target);
const closeDirection = close.getWorldDirection(new Vector3());
fitOverviewCamera(close, 1);
assert(closeDirection.distanceTo(close.getWorldDirection(new Vector3())) < 1e-10);
assert(points.every(point => Math.abs(point.clone().project(close).z) < 1), 'A close orbit backs out enough to preserve near/far visibility.');

console.table(results);
console.log('Landing overview checks passed: full circuit road/scenery containment across 48 views, stable fitting, preserved orbit direction, and safe depth clipping.');
