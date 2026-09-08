/** Gameplay and scenery share these positions on the authored main road.
 * Lateral coordinates use the road frame, not screen-left / screen-right. */
export interface CourseStrip { id: string; start: number; end: number; lateral: number; width: number }
export interface AerialRing { id: string; distance: number; lateral: number; height: number; radius: number; circuitRadius?: number }

export const BOOST_PADS: readonly CourseStrip[] = [
  { id: 'mission-sprint', start: 252, end: 258, lateral: 3.5, width: 3 },
  { id: 'wharf-sprint', start: 372, end: 378, lateral: -3.5, width: 3 },
];
export const ROUGH_PATCHES: readonly CourseStrip[] = [
  { id: 'garden-cobbles', start: 64, end: 72, lateral: 3.5, width: 3 },
  { id: 'soma-rumble', start: 303, end: 311, lateral: -3.5, width: 3 },
];
export const AERIAL_RINGS: readonly AerialRing[] = [
  { id: 'golden-gate-air', distance: 177, lateral: 0, height: 6.5, radius: 2.25, circuitRadius: 3.2 },
  { id: 'pier-air', distance: 403, lateral: 0, height: 5.3, radius: 2 },
];
export const SIGNATURE_JUMPS = [
  { id: 'golden-gate', charge: 157, release: 168.89, end: 184 },
  { id: 'pier', charge: 385, release: 396.74, end: 412 },
] as const;
export const BOOST_SPEED_GAIN = 2.25;
export const BOOST_SPEED_CAP = 18;
export const BOOST_FEEDBACK_SECONDS = .85;
export const ROUGH_RESISTANCE = .8;

export function insideStrip(strip: CourseStrip, distance: number, lateral: number): boolean {
  return distance >= strip.start && distance <= strip.end && Math.abs(lateral - strip.lateral) <= strip.width / 2;
}
