import { DEFAULT_BUILDS, isLegalBuild } from '@/game/catalogue';
import type { Blueprint, PlayerId, Pose, Vec3, Quat } from '@/game/types';
import { MAX_PARTY_PLAYERS } from '@/game/party-types';
import type { ControllerPacket, PartyInput, PartyPlayer, PartyState, PhoneSnapshot } from '@/game/party-types';

/** A narrow D1 interface keeps the relay testable without a Workers runtime. */
export interface PartyStatement {
  bind(...values: unknown[]): PartyStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface PartyDatabase {
  prepare(query: string): PartyStatement;
  batch(statements: PartyStatement[]): Promise<unknown[]>;
}
interface RoomRow {
  code: string; host_token_hash: string; created_at: number; expires_at: number;
  closed_at: number | null; updated_at: number; state_json: string | null;
}
interface PlayerRow {
  room_code: string; player_id: PlayerId; token_hash: string; blueprint_json: string;
  ready: number; ready_heat: number; packet_seq: number; events_json: string;
  offer_json: string | null; answer_json: string | null; host_seen_offer_json: string | null;
  last_seen_at: number;
}

const MAX_BODY_BYTES = 128 * 1024;
const MAX_SDP_CHARS = 12 * 1024;
const ROOM_LIFETIME_MS = 2 * 60 * 60 * 1000;
const PLAYER_CONNECTED_MS = 3500;
const HOST_CONNECTED_MS = 5000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

class PartyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function fail(message: string, status = 400): never { throw new PartyError(message, status); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object.');
  return value as Record<string, unknown>;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('Expected true or false.');
  return value;
}
function finite(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('A number is outside the allowed range.');
  return value;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = finite(value, min, max);
  if (!Number.isSafeInteger(number)) fail('Expected a whole number.');
  return number;
}
function playerValues<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_PARTY_PLAYERS) fail('Two to four player values are required.');
  return value.map(parse);
}
function playerId(value: unknown): PlayerId { return integer(value, 0, MAX_PARTY_PLAYERS - 1) as PlayerId; }
function code(value: unknown): string {
  if (typeof value !== 'string') fail('Enter the six-character room code.');
  const normalized = value.trim().toUpperCase();
  if (!CODE_PATTERN.test(normalized)) fail('Enter the six-character room code.');
  return normalized;
}
function token(value: unknown): string {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) fail('This controller link is not valid. Rejoin the room.', 401);
  return value;
}
function blueprint(value: unknown): Blueprint {
  const item = object(value);
  if (typeof item.bodyId !== 'string' || typeof item.wheelId !== 'string' || typeof item.wheelbase !== 'string') fail('Choose a valid ride.');
  const build = { bodyId: item.bodyId, wheelId: item.wheelId, wheelbase: item.wheelbase } as Blueprint;
  if (!isLegalBuild(build)) fail('That ride exceeds the build budget or uses unavailable parts.');
  return build;
}
function description(value: unknown, kind: 'offer' | 'answer'): RTCSessionDescriptionInit {
  const item = object(value);
  if (item.type !== kind || typeof item.sdp !== 'string' || !item.sdp.length || item.sdp.length > MAX_SDP_CHARS) fail('The controller connection description is not valid.');
  return { type: kind, sdp: item.sdp };
}
function vec3(value: unknown): Vec3 {
  const item = object(value);
  return { x: finite(item.x, -100000, 100000), y: finite(item.y, -100000, 100000), z: finite(item.z, -100000, 100000) };
}
function quaternion(value: unknown): Quat {
  const item = object(value);
  return { x: finite(item.x, -1.01, 1.01), y: finite(item.y, -1.01, 1.01), z: finite(item.z, -1.01, 1.01), w: finite(item.w, -1.01, 1.01) };
}
function pose(value: unknown): Pose {
  const item = object(value);
  return { position: vec3(item.position), quaternion: quaternion(item.quaternion) };
}
function snapshot(value: unknown): PhoneSnapshot {
  const item = object(value);
  if (item.position === undefined && item.quaternion === undefined && item.wheels === undefined)
    fail('This room uses an older game version. Refresh the shared race screen and start a new room.');
  if (!Array.isArray(item.wheels) || item.wheels.length !== 4) fail('A racer must have four wheel transforms.');
  return {
    ...pose(item), wheels: item.wheels.map(pose), blueprint: blueprint(item.blueprint),
    flips: integer(item.flips, 0, 10000), maxRoll: finite(item.maxRoll, 0, 100000),
    id: playerId(item.id), charge: finite(item.charge, 0, 1),
    grounded: bool(item.grounded), recovering: bool(item.recovering), finished: bool(item.finished),
    finishTime: item.finishTime === null ? null : finite(item.finishTime, 0, 3600),
    speed: finite(item.speed, 0, 10000), progress: finite(item.progress, 0, 1),
    jumps: integer(item.jumps, 0, 10000), recoveries: integer(item.recoveries, 0, 10000),
  };
}
function partyState(value: unknown): PartyState {
  const item = object(value);
  if (!['garage', 'countdown', 'racing', 'results', 'final'].includes(String(item.stage))) fail('The race stage is not valid.');
  if (!Array.isArray(item.snapshots) || item.snapshots.length > MAX_PARTY_PLAYERS) fail('At most four racer snapshots are allowed.');
  const snapshots = item.snapshots.map(snapshot);
  if (new Set(snapshots.map((racer) => racer.id)).size !== snapshots.length) fail('Racer snapshots must have unique player IDs.');
  const builds = playerValues(item.builds, blueprint);
  const scores = playerValues(item.scores, (score) => finite(score, 0, 100));
  const ready = playerValues(item.ready, bool);
  if (scores.length !== builds.length || ready.length !== builds.length) fail('Player arrays must have matching lengths.');
  const roster = item.racerIds ?? snapshots.map(racer => racer.id);
  if (!Array.isArray(roster) || roster.length > MAX_PARTY_PLAYERS) fail('At most four racers may participate.');
  const racerIds = roster.map(playerId);
  if (new Set(racerIds).size !== racerIds.length || racerIds.some(id => id >= builds.length)) fail('Choose unique available racer IDs.');
  return {
    ...(item.revision === undefined ? {} : { revision: integer(item.revision) }),
    ...(item.finishCountdown === undefined ? {} : { finishCountdown: item.finishCountdown === null ? null : finite(item.finishCountdown, 0, 12) }),
    stage: item.stage as PartyState['stage'], builds, snapshots, racerIds,
    elapsed: finite(item.elapsed, 0, 3600), countdown: finite(item.countdown, -10, 10),
    heat: integer(item.heat, 1, 3), scores, ready, paused: bool(item.paused),
  };
}
function packet(value: unknown): ControllerPacket {
  const item = object(value);
  const seq = integer(item.seq);
  if (!Array.isArray(item.events) || item.events.length > 16) fail('At most sixteen controller events are allowed.');
  let previous = -1;
  const events: PartyInput[] = item.events.map((value: unknown) => {
    const event = object(value);
    const eventSeq = integer(event.seq, 0, seq);
    if (eventSeq <= previous) fail('Controller events must be in increasing sequence order.');
    previous = eventSeq;
    if (event.kind !== 'hold' && event.kind !== 'release' && event.kind !== 'cancel') fail('That controller action is not available.');
    return { seq: eventSeq, kind: event.kind };
  });
  const ready = bool(item.ready);
  const readyHeat = integer(item.readyHeat, 0, 3);
  if (ready && readyHeat === 0) fail('Choose the heat before marking this controller ready.');
  return {
    seq, events, build: blueprint(item.build), ready, readyHeat,
    offer: item.offer === null ? null : description(item.offer, 'offer'),
  };
}
async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function randomCode(): string {
  // Rejection sampling avoids favoring characters in the 31-character alphabet.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let result = '';
  while (result.length < 6) for (const byte of crypto.getRandomValues(new Uint8Array(12))) {
    if (byte < limit) result += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    if (result.length === 6) break;
  }
  return result;
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(type)) fail('Send this request as JSON.', 415);
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) fail('The controller request is too large.', 413);
  if (!request.body) fail('The controller request is empty.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); fail('The controller request is too large.', 413); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return object(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (error) { if (error instanceof PartyError) throw error; return fail('The controller request is not valid JSON.'); }
}
async function getRoom(db: PartyDatabase, roomCode: string, now: number): Promise<RoomRow> {
  const room = await db.prepare('SELECT * FROM party_rooms WHERE code = ?').bind(roomCode).first<RoomRow>();
  if (!room) fail('That room was not found. Check the code on the race screen.', 404);
  if (room.closed_at !== null || room.expires_at <= now) fail('This room has ended. Create a new room on the race screen.', 410);
  return room;
}
async function authenticateHost(room: RoomRow, value: unknown): Promise<void> {
  if (await digest(token(value)) !== room.host_token_hash) fail('Only the race screen can do that.', 403);
}
async function getPlayer(db: PartyDatabase, roomCode: string, value: unknown): Promise<PlayerRow> {
  const player = await db.prepare('SELECT * FROM party_players WHERE room_code = ? AND token_hash = ?')
    .bind(roomCode, await digest(token(value))).first<PlayerRow>();
  if (!player) fail('This controller is not part of the room. Rejoin using the room code.', 403);
  return player;
}
function publicPlayer(row: PlayerRow, now: number): PartyPlayer {
  return {
    id: row.player_id, connected: now - row.last_seen_at < PLAYER_CONNECTED_MS,
    build: JSON.parse(row.blueprint_json) as Blueprint, ready: Boolean(row.ready), readyHeat: row.ready_heat,
    seq: row.packet_seq, events: JSON.parse(row.events_json) as PartyInput[],
    offer: row.offer_json ? JSON.parse(row.offer_json) as RTCSessionDescriptionInit : null,
    lastSeen: row.last_seen_at,
  };
}

export async function handlePartyRequest(request: Request, db: PartyDatabase): Promise<Response> {
  try {
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Use POST for controller requests.' }), { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) fail('Use the controller link from this race screen.', 403);
    if (request.headers.get('sec-fetch-site') === 'cross-site') fail('Use the controller link from this race screen.', 403);
    const body = await readBody(request);
    const now = Date.now();
    if (body.action === 'create') {
      // Bounded cleanup keeps expired rooms from accumulating without background jobs.
      await db.prepare('DELETE FROM party_rooms WHERE code IN (SELECT code FROM party_rooms WHERE expires_at <= ? OR closed_at IS NOT NULL LIMIT 50)').bind(now).run();
      const hostToken = randomToken();
      const hostHash = await digest(hostToken);
      const expiresAt = now + ROOM_LIFETIME_MS;
      for (let attempt = 0; attempt < 8; attempt++) {
        const roomCode = randomCode();
        const created = await db.prepare('INSERT OR IGNORE INTO party_rooms (code, host_token_hash, created_at, expires_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING code')
          .bind(roomCode, hostHash, now, expiresAt, now).first<{ code: string }>();
        if (created) return json({ code: roomCode, token: hostToken, expiresAt });
      }
      fail('Could not create a room just now. Please try again.', 503);
    }
    if (!['join', 'host', 'player', 'close'].includes(String(body.action))) fail('That room action is not available.');
    const roomCode = code(body.code);
    const room = await getRoom(db, roomCode, now);
    if (body.action === 'join') {
      if (body.token !== undefined) {
        const player = await getPlayer(db, roomCode, body.token);
        await db.prepare('UPDATE party_players SET last_seen_at = ? WHERE room_code = ? AND player_id = ?').bind(now, roomCode, player.player_id).run();
        return json({ code: roomCode, playerId: player.player_id, token: token(body.token), expiresAt: room.expires_at, build: JSON.parse(player.blueprint_json), seq: player.packet_seq });
      }
      const playerToken = randomToken();
      // Selecting and claiming a free slot happen in one SQLite write, so simultaneous joins cannot steal a slot.
      const player = await db.prepare(`INSERT INTO party_players (room_code, player_id, token_hash, blueprint_json, last_seen_at)
        SELECT ?, slots.player_id, ?, CASE (slots.player_id % 2) WHEN 0 THEN ? ELSE ? END, ?
        FROM (SELECT 0 AS player_id UNION ALL SELECT 1 AS player_id UNION ALL SELECT 2 AS player_id UNION ALL SELECT 3 AS player_id) AS slots
        WHERE NOT EXISTS (SELECT 1 FROM party_players occupied WHERE occupied.room_code = ? AND occupied.player_id = slots.player_id)
          AND EXISTS (SELECT 1 FROM party_rooms WHERE code = ? AND closed_at IS NULL AND expires_at > ?)
        ORDER BY slots.player_id LIMIT 1
        RETURNING *`).bind(roomCode, await digest(playerToken), JSON.stringify(DEFAULT_BUILDS[0]), JSON.stringify(DEFAULT_BUILDS[1]), now, roomCode, roomCode, now).first<PlayerRow>();
      if (!player) fail('All four racer spots are taken. Reopen your controller on the phone that joined, or start a new room.', 409);
      return json({ code: roomCode, playerId: player.player_id, token: playerToken, expiresAt: room.expires_at, build: JSON.parse(player.blueprint_json), seq: player.packet_seq });
    }
    if (body.action === 'close') {
      await authenticateHost(room, body.token);
      await db.prepare('UPDATE party_rooms SET closed_at = ?, state_json = NULL WHERE code = ?').bind(now, roomCode).run();
      return json({ closed: true });
    }
    if (body.action === 'host') {
      await authenticateHost(room, body.token);
      const state = partyState(body.state);
      if (!Array.isArray(body.answers) || body.answers.length > MAX_PARTY_PLAYERS) fail('At most four controller answers are allowed.');
      const answers = body.answers.map((value: unknown) => {
        const answer = object(value);
        const offer = description({ type: 'offer', sdp: answer.offerSdp }, 'offer');
        return { player: playerId(answer.player), description: description(answer.description, 'answer'), offerJson: JSON.stringify(offer) };
      });
      if (new Set(answers.map((answer) => answer.player)).size !== answers.length) fail('Send one answer per controller.');
      const players = (await db.prepare('SELECT * FROM party_players WHERE room_code = ? ORDER BY player_id').bind(roomCode).all<PlayerRow>()).results;
      const writes: PartyStatement[] = [db.prepare('UPDATE party_rooms SET updated_at = ?, state_json = ? WHERE code = ? AND closed_at IS NULL AND expires_at > ?').bind(now, JSON.stringify(state), roomCode, now)];
      for (const answer of answers) writes.push(db.prepare('UPDATE party_players SET answer_json = ? WHERE room_code = ? AND player_id = ? AND offer_json = ?')
        .bind(JSON.stringify(answer.description), roomCode, answer.player, answer.offerJson));
      // Retain the last offer shown to the host; answer writes above require the exact supplied offer SDP.
      for (const player of players) writes.push(db.prepare('UPDATE party_players SET host_seen_offer_json = ? WHERE room_code = ? AND player_id = ?')
        .bind(player.offer_json, roomCode, player.player_id));
      await db.batch(writes);
      return json({ players: players.map((player) => publicPlayer(player, now)), expiresAt: room.expires_at });
    }
    const player = await getPlayer(db, roomCode, body.token);
    const update = packet(body.packet);
    const offerJson = update.offer ? JSON.stringify(update.offer) : null;
    await db.batch([
      db.prepare(`UPDATE party_players SET blueprint_json = ?, ready = ?, ready_heat = ?, packet_seq = ?, events_json = ?,
        answer_json = CASE WHEN offer_json IS NOT ? THEN NULL ELSE answer_json END, offer_json = ?
        WHERE room_code = ? AND player_id = ? AND packet_seq < ?
          AND EXISTS (SELECT 1 FROM party_rooms WHERE code = ? AND closed_at IS NULL AND expires_at > ?)`)
        .bind(JSON.stringify(update.build), Number(update.ready), update.readyHeat, update.seq, JSON.stringify(update.events), offerJson, offerJson, roomCode, player.player_id, update.seq, roomCode, now),
      // A repeated or late packet still proves the phone is present, but cannot revert its controls or loadout.
      db.prepare('UPDATE party_players SET last_seen_at = ? WHERE room_code = ? AND player_id = ?').bind(now, roomCode, player.player_id),
    ]);
    const current = await db.prepare('SELECT answer_json FROM party_players WHERE room_code = ? AND player_id = ?').bind(roomCode, player.player_id).first<{ answer_json: string | null }>();
    return json({ state: room.state_json ? JSON.parse(room.state_json) as PartyState : null, answer: current?.answer_json ? JSON.parse(current.answer_json) as RTCSessionDescriptionInit : null, hostConnected: now - room.updated_at < HOST_CONNECTED_MS, expiresAt: room.expires_at });
  } catch (error) {
    if (error instanceof PartyError) return json({ error: error.message }, error.status);
    console.error('Party relay storage request failed.', error instanceof Error ? error.message : 'Unknown storage error');
    return json({ error: 'The room connection is unavailable. Please try again in a moment.' }, 503);
  }
}
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: HEADERS }); }
