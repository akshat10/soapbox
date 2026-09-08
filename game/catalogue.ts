import type { Blueprint, BodyDef, WheelDef } from './types';

/** Every body is built from these bounded physical properties. No speed bonuses. */
export const BODIES: BodyDef[] = [
  { id: 'bathtub', name: 'Bubble Trouble', family: 'broad', description: 'Wide, low, and ready to make a splash.', cost: 3, mass: 130, width: 2.15, height: 0.95, length: 2.9, color: 0x8be6e2, comHeight: -0.16 },
  { id: 'sofa', name: 'Couch Potato', family: 'broad', description: 'A wide stance with a little extra baggage.', cost: 3, mass: 155, width: 2.2, height: 1.3, length: 2.8, color: 0xe989aa, comHeight: -0.12 },
  { id: 'dumpster', name: 'Trash Lightning', family: 'broad', description: 'Heavy, broad, and surprisingly composed.', cost: 5, mass: 180, width: 2.1, height: 1.45, length: 2.7, color: 0x5dbe8f, comHeight: -0.12 },
  { id: 'toaster', name: 'Toast Malone', family: 'compact', description: 'A compact all-rounder. Breakfast is airborne.', cost: 2, mass: 100, width: 1.65, height: 1.15, length: 2.3, color: 0xf4bd60, comHeight: -0.12 },
  { id: 'suitcase', name: 'Excess Baggage', family: 'compact', description: 'Small, balanced, and packed for impact.', cost: 2, mass: 95, width: 1.6, height: 0.85, length: 2.4, color: 0xa7a0e8, comHeight: -0.1 },
  { id: 'lunchbox', name: 'Lunch Launch', family: 'compact', description: 'Light and tidy. Contents may have shifted.', cost: 2, mass: 90, width: 1.7, height: 1.05, length: 2.25, color: 0xf08064, comHeight: -0.1 },
  { id: 'canoe', name: 'Paddle Panic', family: 'long', description: 'Long and low. Watch the crests.', cost: 3, mass: 105, width: 1.55, height: 0.8, length: 3.8, color: 0xef7956, comHeight: -0.15 },
  { id: 'banana', name: 'Peel Out', family: 'long', description: 'A long wheelbase with questionable dignity.', cost: 3, mass: 100, width: 1.5, height: 0.9, length: 3.6, color: 0xf6d85c, comHeight: -0.1 },
  { id: 'ironingboard', name: 'Pressing Matters', family: 'long', description: 'A slender cruiser with a very low profile.', cost: 2, mass: 90, width: 1.4, height: 0.7, length: 3.5, color: 0x90c8ee, comHeight: -0.15 },
  { id: 'shoppingcart', name: 'Aisle Be Back', family: 'tall', description: 'Tall basket, short footprint. Corner gently.', cost: 3, mass: 115, width: 1.75, height: 1.85, length: 2.45, color: 0xb1d5da, comHeight: 0.2 },
  { id: 'fridge', name: 'Chill Seeker', family: 'tall', description: 'Heavy and top-heavy. Give it a wide landing.', cost: 5, mass: 175, width: 1.65, height: 2.4, length: 2.3, color: 0xe3eee7, comHeight: 0.28 },
  { id: 'arcade', name: 'Game Overdrive', family: 'tall', description: 'A tall cabinet with a taste for high scores.', cost: 5, mass: 145, width: 1.6, height: 2.25, length: 2.3, color: 0x8b7ad8, comHeight: 0.24 },
];

export const WHEELS: WheelDef[] = [
  { id: 'casters', name: 'Tiny Casters', radius: 0.33, mass: 4, cost: 2, grip: 0.65 },
  { id: 'standard', name: 'Street Wheels', radius: 0.5, mass: 7, cost: 3, grip: 0.9 },
  { id: 'monster', name: 'Monster Tires', radius: 0.72, mass: 12, cost: 5, grip: 1.15 },
];

export const DEFAULT_BUILDS: Blueprint[] = [
  { bodyId: 'toaster', wheelId: 'standard', wheelbase: 'standard' },
  { bodyId: 'bathtub', wheelId: 'standard', wheelbase: 'standard' },
];

export const WHEELBASE_COST = { short: 0, standard: 1, long: 2 } as const;
export const BUILD_BUDGET = 10;

export function getBody(id: string): BodyDef {
  return BODIES.find((body) => body.id === id) ?? BODIES[3];
}

export function getWheel(id: string): WheelDef {
  return WHEELS.find((wheel) => wheel.id === id) ?? WHEELS[1];
}

export function buildCost(blueprint: Blueprint): number {
  return getBody(blueprint.bodyId).cost + getWheel(blueprint.wheelId).cost + WHEELBASE_COST[blueprint.wheelbase];
}

export function isLegalBuild(blueprint: Blueprint): boolean {
  return BODIES.some((body) => body.id === blueprint.bodyId)
    && WHEELS.some((wheel) => wheel.id === blueprint.wheelId)
    && Object.hasOwn(WHEELBASE_COST, blueprint.wheelbase)
    && buildCost(blueprint) <= BUILD_BUDGET;
}
