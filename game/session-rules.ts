import type { PhysicsOptions } from './physics';
import type { LocalMode } from './solo';
import type { PlayerId } from './types';

/** Both keyboard modes share the authored road; phone controllers still use hop-only lanes. */
export function sessionCourse(phoneParty: boolean): PhysicsOptions {
  return { course: phoneParty ? 'classic' : 'bay-or-bust', steeringEnabled: !phoneParty };
}

export function heatDeadline(mode: LocalMode, phoneParty: boolean, firstFinishAt: number | null): number {
  const limit = phoneParty ? 60 : 90;
  // A fast bot must not end the human's solo run early.
  if ((!phoneParty && mode === 'solo') || firstFinishAt === null) return limit;
  return Math.min(limit, firstFinishAt + 12);
}

export function finishWindow(mode: LocalMode, phoneParty: boolean, firstFinishAt: number | null, elapsed: number): number | null {
  if ((!phoneParty && mode === 'solo') || firstFinishAt === null) return null;
  return Math.max(0, heatDeadline(mode, phoneParty, firstFinishAt) - elapsed);
}

export function hopPlayer(mode: LocalMode, code: string): PlayerId | null {
  if (code === 'KeyF' || (mode === 'solo' && code === 'Space')) return 0;
  return mode === 'local' && code === 'KeyJ' ? 1 : null;
}

export function steeringPlayer(mode: LocalMode, code: string): PlayerId | null {
  if (code === 'ArrowLeft' || code === 'ArrowRight') return mode === 'solo' ? 0 : 1;
  return mode === 'local' && (code === 'KeyA' || code === 'KeyD') ? 0 : null;
}

export function keyboardSteering(mode: LocalMode, player: PlayerId, keys: ReadonlySet<string>): number {
  if (player > (mode === 'solo' ? 0 : 1)) return 0;
  const [left, right] = mode === 'local' && player === 0 ? ['KeyA', 'KeyD'] : ['ArrowLeft', 'ArrowRight'];
  return manualSteering(Number(keys.has(right)) - Number(keys.has(left)));
}

/** The chase camera looks along +Z: screen-right is local -X. Cannon's
 * positive wheel angle turns toward +X, so convert human directions once. */
export function manualSteering(direction: number): number {
  return Number.isFinite(direction) && direction !== 0 ? -Math.max(-1, Math.min(1, direction)) : 0;
}
