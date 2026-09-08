import { Box3, OrthographicCamera, Vector3 } from 'three';
import { BAY_CIRCUIT_COURSE } from './course';

// Upright neighborhood scenery occupies a volume above both sides of the road.
// Keep this envelope independent of whichever models have finished loading.
const envelope = BAY_CIRCUIT_COURSE.paths.find(path => path.id === 'main')!.samples.flatMap(sample => {
  const points: Vector3[] = [];
  for (const side of [-1, 1]) {
    for (const height of [0, 22]) {
      points.push(new Vector3(...sample.position as [number, number, number])
        .addScaledVector(new Vector3(...sample.right as [number, number, number]), side * (sample.width / 2 + 12))
        .add(new Vector3(0, height, 0)));
    }
  }
  return points;
});
const center = new Box3().setFromPoints(envelope).getCenter(new Vector3());

/** A fresh vector, suitable for both camera.lookAt and OrbitControls.target. */
export function overviewTarget(): Vector3 {
  return center.clone();
}

/** Frame the complete circuit and roadside allowance at the current orbit angle.
 * Owns zoom and clipping planes, preserves camera orientation, and emits no
 * control/change events. Call after resize or an OrbitControls change; no call
 * to controls.update is needed here. The frustum may be off-center so the view
 * stays fitted without moving the orbit target.
 */
export function fitOverviewCamera(camera: OrthographicCamera, aspect: number): void {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError('Overview aspect must be positive and finite.');
  camera.updateWorldMatrix(true, false);
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  let nearest = Infinity, farthest = -Infinity;
  const point = new Vector3();
  for (const corner of envelope) {
    point.copy(corner).applyMatrix4(camera.matrixWorldInverse);
    left = Math.min(left, point.x); right = Math.max(right, point.x);
    bottom = Math.min(bottom, point.y); top = Math.max(top, point.y);
    nearest = Math.min(nearest, -point.z); farthest = Math.max(farthest, -point.z);
  }

  // Orthographic near planes cannot be behind the camera. A close orbit can
  // move straight backward without changing either its direction or framing.
  if (nearest < 1) {
    const setback = 1 - nearest;
    const worldPosition = camera.getWorldPosition(new Vector3())
      .addScaledVector(camera.getWorldDirection(new Vector3()), -setback);
    camera.position.copy(camera.parent ? camera.parent.worldToLocal(worldPosition) : worldPosition);
    nearest += setback; farthest += setback;
    camera.updateWorldMatrix(true, false);
  }

  const x = (left + right) / 2, y = (bottom + top) / 2;
  // Five percent on each edge; expand only the deficient viewport dimension.
  const halfHeight = Math.max((top - bottom) / 2, (right - left) / (2 * aspect), .5) * 1.1;
  const halfWidth = halfHeight * aspect;
  camera.left = x - halfWidth; camera.right = x + halfWidth;
  camera.bottom = y - halfHeight; camera.top = y + halfHeight;
  camera.zoom = 1;
  // Keep the course framing while allowing the deeper city behind it to render.
  camera.near = Math.max(.01, nearest - 180);
  camera.far = Math.max(camera.near + 1, farthest + 250);
  camera.updateProjectionMatrix();
}
