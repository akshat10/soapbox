import assert from 'node:assert/strict';
import { heatPoints, raceCue, racePlace, rankRace } from './race';
import type { PlayerId } from './types';

type Standing = Parameters<typeof heatPoints>[0][number];
const finisher = (id: PlayerId, finishTime: number): Standing => ({ id, finished: true, finishTime, progress: 1 });
const unfinished = (id: PlayerId, progress: number): Standing => ({ id, finished: false, finishTime: null, progress });

function checkStanding(racers: Standing[], points: number[], places: number[]) {
 assert.deepEqual(heatPoints(racers), points, 'Heat points should belong to stable player slots.');
 assert.deepEqual(racers.map(racer => racePlace(racer, racers)), places, 'Displayed positions should agree with the awarded finishing positions.');
 const before = racers.map(racer => ({ ...racer }));
 rankRace(racers);
 assert.deepEqual(racers, before, 'Ranking must not reorder or alter authoritative snapshots.');
}

checkStanding([finisher(0, 33), finisher(1, 31), finisher(2, 35), finisher(3, 34)], [3, 5, 1, 2], [2, 1, 4, 3]);
checkStanding([finisher(0, 32), finisher(3, 33)], [5, 0, 0, 3], [1, 2]);
checkStanding([finisher(0, 30), finisher(1, 31), finisher(2, 32), finisher(3, 30)], [4, 2, 1, 4], [1, 3, 4, 1]);
checkStanding([0, 1, 2, 3].map(id => finisher(id as PlayerId, 30)), [2.75, 2.75, 2.75, 2.75], [1, 1, 1, 1]);
checkStanding([unfinished(0, .25), unfinished(1, .5), unfinished(2, .5), unfinished(3, .1)], [2, 4, 4, 1], [3, 1, 1, 4]);
checkStanding([finisher(0, 33), unfinished(1, 1), finisher(2, 32), unfinished(3, .95)], [3, 2, 5, 1], [2, 3, 1, 4]);
assert.deepEqual(heatPoints([]), [0, 0, 0, 0], 'An empty lobby must not award points.');

function permutations<T>(values: T[]): T[][] {
 if (values.length < 2) return [values];
 return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]));
}

// Pairwise photo-finish tolerances can accidentally make A tie B, B tie C,
// and A beat C. The ranking, place label, and points must use one coherent result.
for (const racers of [
 [finisher(0, 30), finisher(1, 30.015), finisher(2, 30.03), finisher(3, 31)],
 [unfinished(0, .50015), unfinished(1, .500075), unfinished(2, .5), unfinished(3, .2)],
]) {
 const expectedPoints = heatPoints(racers);
 const expectedPlaces = racers.map(racer => racePlace(racer, racers));
 for (const ordering of permutations(racers)) {
  const points = heatPoints(ordering);
  assert.deepEqual(points, expectedPoints, 'Close finishes must not change point awards when network snapshot order changes.');
  for (const racer of ordering) {
   const place = racePlace(racer, ordering);
   assert.equal(place, expectedPlaces[racer.id], 'Close finishes must keep the same displayed place across snapshot orderings.');
   for (const other of ordering) {
    const otherPlace = racePlace(other, ordering);
    if (points[racer.id] === points[other.id]) assert.equal(place, otherPlace, 'Shared point awards must display the same place.');
    if (points[racer.id] > points[other.id]) assert(place < otherPlace, 'A higher point award must display a better place.');
   }
  }
  const expectedTotal = [5, 3, 2, 1].slice(0, ordering.length).reduce((sum, award) => sum + award, 0);
  assert.equal(points.reduce((sum, award) => sum + award, 0), expectedTotal, 'Ties must split available points without inventing or losing points.');
 }
}

const cue = (z: number, changes: Partial<Parameters<typeof raceCue>[0]> = {}) => raceCue({ progress: z / 260, grounded: true, charge: 0, recovering: false, finished: false, ...changes });
assert.equal(cue(0), 'HOLD TO CHARGE · RELEASE TO HOP');
assert.equal(cue(40), 'LOMBARD · SMALL HOPS');
assert.equal(cue(78), 'GAP AHEAD · HOLD');
assert.equal(cue(78, { charge: .95 }), 'GET READY TO RELEASE');
assert.equal(cue(81.6), 'RELEASE! CLEAR THE GAP', 'The release cue must allow phone reaction time before the lip.');
assert.equal(cue(84), 'RELEASE! CLEAR THE GAP');
assert.equal(cue(84, { grounded: false }), 'FLYING OVER THE BAY');
assert.equal(cue(150), 'HOLD ON · WONKY ROAD');
assert.equal(cue(218), 'FINAL JUMP · CHARGE UP');
assert.equal(cue(229), 'RELEASE · SEND IT!');
assert.equal(cue(229, { grounded: false }), 'HOME STRETCH!');
assert.equal(cue(245), 'THE FINISH IS YOURS');
assert.equal(cue(10, { grounded: false }), 'AIR TIME!');
assert.equal(cue(10, { charge: 1 }), 'FULL CHARGE · RELEASE TO HOP');
assert.equal(cue(84, { recovering: true, charge: 1 }), 'PIT CREW TO THE RESCUE', 'Recovery must replace release instructions.');
assert.equal(cue(260, { finished: true, recovering: true }), 'ACROSS THE LINE!', 'A confirmed finish must take precedence over incidental state.');

console.log('Race checks passed: four-player scoring, sparse slots, finishers before timeouts, exact ties, photo-finish ordering consistency, points conservation, and course/state cues.');
