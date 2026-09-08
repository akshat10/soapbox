import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { HostIdentity, HostReply, PartyIdentity, PlayerReply } from './party-types';
import { handlePartyRequest, type PartyDatabase, type PartyStatement } from '../lib/party-server';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0000_abnormal_black_tarantula.sql', import.meta.url), 'utf8'));
function statement(query: string, values: unknown[] = []): PartyStatement {
  return {
    bind: (...args) => statement(query, args),
    async first<T>() { return (sqlite.prepare(query).get(...values as never[]) ?? null) as T | null; },
    async all<T>() { return { results: sqlite.prepare(query).all(...values as never[]) as T[] }; },
    async run() { return sqlite.prepare(query).run(...values as never[]); },
  };
}
const db: PartyDatabase = {
  prepare: statement,
  async batch(statements) {
    sqlite.exec('BEGIN');
    try { const result = []; for (const stmt of statements) result.push(await stmt.run()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
async function call(body: unknown, expected = 200, headers: Record<string, string> = {}) {
  const response = await handlePartyRequest(new Request('https://derby.example/api/party', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), db);
  const result = await response.json() as HostIdentity & HostReply & PartyIdentity & PlayerReply & { error?: string };
  assert.equal(response.status, expected, JSON.stringify(result));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return result;
}
const build = { bodyId: 'toaster', wheelId: 'standard', wheelbase: 'standard' };
const nextBuild = { bodyId: 'bathtub', wheelId: 'standard', wheelbase: 'long' };
const state = { stage: 'garage', builds: [build, build, build, build], snapshots: [], elapsed: 0, countdown: 3, heat: 1, scores: [0, 0, 0, 0], ready: [false, false, false, false], paused: false, racerIds: [0, 1, 2, 3] };
const packet = (seq: number, extra = {}) => ({ seq, events: [], build, ready: false, readyHeat: 0, offer: null, ...extra });
const host = await call({ action: 'create' });
assert.match(host.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
assert.match(host.token, /^[a-f0-9]{64}$/);
assert.ok(host.expiresAt - Date.now() > 7_190_000);
const first = await call({ action: 'join', code: host.code.toLowerCase() });
const second = await call({ action: 'join', code: host.code });
assert.equal(first.playerId, 0); assert.equal(second.playerId, 1); assert.notEqual(first.token, second.token);
const third = await call({ action: 'join', code: host.code });
const fourth = await call({ action: 'join', code: host.code });
assert.equal(third.playerId, 2); assert.equal(fourth.playerId, 3);
assert.equal(new Set([first.token, second.token, third.token, fourth.token]).size, 4);
await call({ action: 'join', code: host.code }, 409);
const reclaim = await call({ action: 'join', code: host.code, token: first.token });
assert.equal(reclaim.playerId, 0); assert.equal(reclaim.token, first.token);
await call({ action: 'join', code: host.code, token: 'a'.repeat(64) }, 403);
await call({ action: 'host', code: host.code, token: first.token, state, answers: [] }, 403);
await call({ action: 'close', code: host.code, token: first.token }, 403);
let hostReply = await call({ action: 'host', code: host.code, token: host.token, state, answers: [] });
assert.equal(hostReply.players.length, 4); assert.equal(hostReply.players[0].connected, true);
assert.ok(!JSON.stringify(hostReply).includes(first.token)); assert.ok(!JSON.stringify(hostReply).includes('token_hash'));
await call({ action: 'player', code: host.code, token: first.token, playerId: 1, packet: packet(3, { build: nextBuild, ready: true, readyHeat: 1, events: [{ seq: 1, kind: 'hold' }, { seq: 2, kind: 'release' }] }) });
await call({ action: 'player', code: host.code, token: first.token, packet: packet(2) });
hostReply = await call({ action: 'host', code: host.code, token: host.token, state, answers: [] });
assert.equal(hostReply.players[0].seq, 3); assert.equal(hostReply.players[0].ready, true); assert.deepEqual(hostReply.players[0].build, nextBuild);
assert.deepEqual(hostReply.players[0].events.map((event) => event.kind), ['hold', 'release']);
assert.equal(hostReply.players[1].seq, -1); assert.equal(hostReply.players[1].ready, false);
await call({ action: 'player', code: host.code, token: second.token, packet: packet(1, { build: { bodyId: 'fridge', wheelId: 'monster', wheelbase: 'long' } }) }, 400);
await call({ action: 'player', code: host.code, token: second.token, packet: packet(1, { build: { ...build, bodyId: 'madeup' } }) }, 400);
await call({ action: 'player', code: host.code, token: second.token, packet: packet(1, { events: [{ seq: 2, kind: 'hold' }] }) }, 400);
await call({ action: 'player', code: host.code, token: second.token, packet: packet(3, { events: [{ seq: 2, kind: 'hold' }, { seq: 1, kind: 'release' }] }) }, 400);
await call({ action: 'player', code: host.code, token: second.token, packet: packet(1, { readyHeat: 4 }) }, 400);
await call({ action: 'player', code: host.code, token: second.token, packet: packet(1, { ready: true, readyHeat: 0 }) }, 400);
await call({ action: 'host', code: host.code, token: host.token, state: { ...state, snapshots: [{ id: 7 }] }, answers: [] }, 400);
const offerA = { type: 'offer', sdp: 'v=0\r\no=offerA' };
const offerB = { type: 'offer', sdp: 'v=0\r\no=offerB' };
const answerA = { type: 'answer', sdp: 'v=0\r\no=answerA' };
const answerB = { type: 'answer', sdp: 'v=0\r\no=answerB' };
await call({ action: 'player', code: host.code, token: second.token, packet: packet(5, { offer: offerA }) });
await call({ action: 'host', code: host.code, token: host.token, state, answers: [] });
await call({ action: 'host', code: host.code, token: host.token, state, answers: [{ player: 1, description: answerA, offerSdp: offerA.sdp }] });
assert.deepEqual((await call({ action: 'player', code: host.code, token: second.token, packet: packet(6, { offer: offerA }) })).answer, answerA);
assert.equal((await call({ action: 'player', code: host.code, token: second.token, packet: packet(7, { offer: offerB }) })).answer, null);
await call({ action: 'host', code: host.code, token: host.token, state, answers: [{ player: 1, description: answerA, offerSdp: offerA.sdp }] });
assert.equal((await call({ action: 'player', code: host.code, token: second.token, packet: packet(8, { offer: offerB }) })).answer, null);
await call({ action: 'host', code: host.code, token: host.token, state, answers: [{ player: 1, description: answerA, offerSdp: offerA.sdp }] });
assert.equal((await call({ action: 'player', code: host.code, token: second.token, packet: packet(8, { offer: offerB }) })).answer, null);
await call({ action: 'host', code: host.code, token: host.token, state, answers: [{ player: 1, description: answerB, offerSdp: offerB.sdp }] });
assert.deepEqual((await call({ action: 'player', code: host.code, token: second.token, packet: packet(9, { offer: offerB }) })).answer, answerB);
const pose = { position: { x: 0, y: 14.5, z: 12 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
const snapshots = [0, 1, 2, 3].map(id => ({ ...pose, id, wheels: Array.from({ length: 4 }, () => pose),
  blueprint: build, charge: 0.4, grounded: true, recovering: false, finished: false, finishTime: null,
  speed: 6, progress: 0.1, jumps: 1, recoveries: 0, flips: 0, maxRoll: 0.2 }));
const raceState = { ...state, stage: 'racing', snapshots, elapsed: 2, revision: 42, finishCountdown: 11.75 };
await call({ action: 'host', code: host.code, token: host.token, state: raceState, answers: [] });
const fourthView = await call({ action: 'player', code: host.code, token: fourth.token, packet: packet(0) });
assert(fourthView.state);
assert.deepEqual(fourthView.state.snapshots, snapshots, 'Every phone receives all four complete vehicle transforms.');
assert.deepEqual(fourthView.state.racerIds, [0, 1, 2, 3]);
assert.equal(fourthView.state.revision, 42, 'The relay preserves the host frame revision.');
assert.equal(fourthView.state.finishCountdown, 11.75, 'The remaining finish window reaches phones precisely.');
await call({ action: 'host', code: host.code, token: host.token, state: { ...raceState, finishCountdown: null }, answers: [] });
assert.equal((await call({ action: 'player', code: host.code, token: fourth.token, packet: packet(0) })).state?.finishCountdown, null);
await call({ action: 'host', code: host.code, token: host.token, state: { ...raceState, finishCountdown: 12.1 }, answers: [] }, 400);
const oldRoomReply = await call({ action: 'host', code: host.code, token: host.token, state: { ...state, snapshots: [{ id: 0, charge: 0, grounded: true }] }, answers: [] }, 400);
assert.match(oldRoomReply.error ?? '', /Refresh the shared race screen/, 'Old compact-snapshot rooms get a clear update instruction.');
await call({ action: 'player', code: host.code, token: third.token, packet: packet(1, { ready: true, readyHeat: 2 }) });
await call({ action: 'host', code: host.code, token: host.token, state: { ...raceState, revision: -1 }, answers: [] }, 400);
const tieScores = [10 / 3, 10 / 3, 10 / 3, 1];
await call({ action: 'host', code: host.code, token: host.token, state: { ...state, stage: 'results', scores: tieScores }, answers: [] });
assert.deepEqual((await call({ action: 'player', code: host.code, token: fourth.token, packet: packet(1) })).state?.scores,
  tieScores, 'Three-way tie points must retain fractional precision through the relay.');
const nextRound = await call({ action: 'host', code: host.code, token: host.token, state: { ...state, stage: 'results' }, answers: [] });
assert.equal(nextRound.players[2].readyHeat, 2, 'A phone can prepare for the upcoming heat.');
await call({ action: 'host', code: host.code, token: host.token, state: { ...raceState, racerIds: [0, 0] }, answers: [] }, 400);
await call({ action: 'host', code: host.code, token: host.token, state: { ...raceState, racerIds: [0, 4] }, answers: [] }, 400);
await call({ action: 'host', code: host.code, token: host.token, state: { ...raceState, snapshots: [{ ...snapshots[0], quaternion: { ...pose.quaternion, w: 2 } }] }, answers: [] }, 400);
await call({ action: 'host', code: host.code, token: host.token, state: { ...raceState, snapshots: [{ ...snapshots[0], wheels: [pose] }] }, answers: [] }, 400);
await call({ action: 'create' }, 403, { origin: 'https://evil.example' });
await call({ action: 'create', padding: 'x'.repeat(132000) }, 413);
const originalNow = Date.now;
Date.now = () => originalNow() + 6000;
hostReply = await call({ action: 'host', code: host.code, token: host.token, state, answers: [] });
assert.equal(hostReply.players[0].connected, false); assert.equal(hostReply.players[1].connected, false);
Date.now = () => originalNow() + 12000;
assert.equal((await call({ action: 'player', code: host.code, token: first.token, packet: packet(20) })).hostConnected, false);
Date.now = originalNow;
await call({ action: 'close', code: host.code, token: host.token });
await call({ action: 'player', code: host.code, token: first.token, packet: packet(21) }, 410);
await call({ action: 'join', code: host.code, token: first.token }, 410);
const expires = await call({ action: 'create' });
Date.now = () => expires.expiresAt + 1;
await call({ action: 'join', code: expires.code }, 410);
await call({ action: 'create' });
Date.now = originalNow;
assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM party_players').get()?.count, 0);
const rows = sqlite.prepare('SELECT host_token_hash FROM party_rooms').all();
assert.ok(rows.every((row) => row.host_token_hash !== host.token));
sqlite.close();
console.log('Party API checks passed: token isolation, four-player capacity/reclaim, full 3D snapshots, upcoming-heat readiness, ordered events, stale-packet defense, legal builds, SDP replacement, liveness, expiry, close, payload and origin limits.');
