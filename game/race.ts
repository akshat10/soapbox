import type { PlayerId } from './types';

export const PLAYER_IDS: PlayerId[] = [0, 1, 2, 3];
export const PLAYER_NAMES = ['BLUE CREW', 'RED RIOT', 'GREEN MACHINE', 'PURPLE HAZE'];
export const PLAYER_COLORS = ['#3254ee', '#f45a4e', '#138b65', '#9955dc', '#e2a414', '#da4b92', '#1397a4', '#d57132'];
type Standing = { id: PlayerId; finished: boolean; finishTime: number | null; progress: number };

export function compareRace(a: Standing, b: Standing): number {
  if (a.finished && b.finished) {
    const gap = (a.finishTime ?? 60) - (b.finishTime ?? 60);
    return Math.abs(gap) < .02 ? 0 : gap;
  }
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  return Math.abs(a.progress - b.progress) < .0001 ? 0 : b.progress - a.progress;
}
export function rankRace<T extends Standing>(snapshots: T[]): T[] {
  return [...snapshots].sort((a,b) => {
    if(a.finished !== b.finished) return a.finished ? -1 : 1;
    return (a.finished ? (a.finishTime ?? 60) - (b.finishTime ?? 60) : b.progress - a.progress) || a.id - b.id;
  });
}
export function racePlace(snapshot: Standing, snapshots: Standing[]): number {
  const rank = rankRace(snapshots);
  // Tie groups share their first racer's tolerance; chained near-ties must not
  // produce a displayed place that disagrees with the points awarded below.
  for(let i=0; i<rank.length;) {
    let end=i+1;
    while(end<rank.length && compareRace(rank[i],rank[end])===0) end++;
    if(rank.slice(i,end).some(s=>s.id===snapshot.id)) return i+1;
    i=end;
  }
  return 1;
}
export function heatPoints(snapshots: Standing[]): number[] {
  const rank = rankRace(snapshots), points = Array(Math.max(4, ...snapshots.map(s => s.id + 1))).fill(0), awards = snapshots.length > 4 ? [10, 8, 6, 5, 4, 3, 2, 1] : [5, 3, 2, 1];
  for (let i = 0; i < rank.length;) {
    let end = i + 1;
    while (end < rank.length && compareRace(rank[i], rank[end]) === 0) end++;
    const shared = awards.slice(i, end).reduce((sum,n) => sum + n, 0) / (end-i);
    for (let j = i; j < end; j++) points[rank[j].id] = shared;
    i = end;
  }
  return points;
}
export function raceCue(s: {progress: number; recovering: boolean; finished: boolean; grounded: boolean; charge: number; courseId?: 'bay-or-bust'; pathDistance?: number}): string {
  const z = s.progress * 260;
  if (s.finished) return 'ACROSS THE LINE!';
  if (s.recovering) return 'PIT CREW TO THE RESCUE';
  if (s.courseId === 'bay-or-bust') {
    const distance = s.pathDistance ?? 0;
    if (distance > 156 && distance < 167.7) return s.charge > .85 ? 'BRIDGE AHEAD · READY TO RELEASE' : 'BRIDGE AHEAD · HOLD';
    if (distance >= 167.7 && distance < 175) return s.grounded ? 'RELEASE · OVER THE BAY!' : 'FLYING OVER THE BAY';
    if (distance > 384 && distance < 395.5) return 'PIER LAUNCH · CHARGE UP';
    if (distance >= 395.5 && distance < 402) return s.grounded ? 'RELEASE · SEND IT!' : 'HOME STRETCH!';
    if (distance > 412) return 'THE FINISH IS YOURS';
    if (!s.grounded) return 'AIR TIME!';
    if (s.charge > .98) return 'FULL CHARGE · RELEASE TO HOP';
    return '← → STEER · HOLD SPACE TO CHARGE';
  }
  if (z > 72 && z < 81.5) return s.charge > .85 ? 'GET READY TO RELEASE' : 'GAP AHEAD · HOLD';
  if (z >= 81.5 && z < 89) return s.grounded ? 'RELEASE! CLEAR THE GAP' : 'FLYING OVER THE BAY';
  if (z > 213 && z < 226) return 'FINAL JUMP · CHARGE UP';
  if (z >= 226 && z < 233) return s.grounded ? 'RELEASE · SEND IT!' : 'HOME STRETCH!';
  if (z > 242) return 'THE FINISH IS YOURS';
  if (!s.grounded) return 'AIR TIME!';
  if (s.charge > .98) return 'FULL CHARGE · RELEASE TO HOP';
  if (z > 26 && z < 62) return 'LOMBARD · SMALL HOPS';
  if (z > 138 && z < 168) return 'HOLD ON · WONKY ROAD';
  return 'HOLD TO CHARGE · RELEASE TO HOP';
}
