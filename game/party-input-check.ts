import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { handlePartyRequest, type PartyDatabase, type PartyStatement } from '../lib/party-server';
import { DEFAULT_BUILDS } from './catalogue';
import { connectController, createHostParty, type PartyController, type PartyHost } from './party-client';
import type { PartyConnection, PartyInput, PartyPlayer, PartyRequest, PartyState } from './party-types';

/** Run with node --import tsx game/party-input-check.ts. No network or browser required. */
class TestChannel {
  readonly label = 'doodle-controller';
  readyState = 'connecting';
  bufferedAmount = 0;
  drop = false;
  partner?: TestChannel;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send(data: string) { if (!this.drop) this.partner?.onmessage?.({ data }); }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
    this.partner?.close();
  }
}

class TestPeer {
  static all: TestPeer[] = [];
  readonly id = TestPeer.all.length;
  readonly iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  channel?: TestChannel;
  ondatachannel: ((event: { channel: TestChannel }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor() { TestPeer.all.push(this); }
  createDataChannel() { this.channel = new TestChannel(); return this.channel; }
  async createOffer(): Promise<RTCSessionDescriptionInit> { return { type: 'offer', sdp: `offer:${this.id}` }; }
  async createAnswer(): Promise<RTCSessionDescriptionInit> { return { type: 'answer', sdp: `answer:${this.id}` }; }
  async setLocalDescription(value: RTCSessionDescriptionInit) { this.localDescription = value; }
  async setRemoteDescription(value: RTCSessionDescriptionInit) {
    this.remoteDescription = value;
    if (value.type !== 'answer') return;
    const host = TestPeer.all[Number(value.sdp?.split(':')[1])];
    const phoneChannel = this.channel!;
    const hostChannel = new TestChannel();
    host.channel = hostChannel;
    phoneChannel.partner = hostChannel;
    hostChannel.partner = phoneChannel;
    host.ondatachannel?.({ channel: hostChannel });
    this.connectionState = host.connectionState = 'connected';
    phoneChannel.readyState = hostChannel.readyState = 'open';
    hostChannel.onopen?.();
    phoneChannel.onopen?.();
  }
  close() { this.connectionState = 'closed'; this.channel?.close(); }
}

const documentStub = new EventTarget() as EventTarget & { visibilityState: string };
documentStub.visibilityState = 'visible';
const windowStub = new EventTarget();
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
function replaceGlobal(name: string, value: unknown) {
  originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

const initialState: PartyState = {
  stage: 'racing', builds: Array.from({ length: 4 }, (_, id) => ({ ...DEFAULT_BUILDS[id % DEFAULT_BUILDS.length] })), snapshots: [],
  elapsed: 2, countdown: 0, heat: 1, scores: [0, 0, 0, 0], ready: [true, true, true, true], paused: false, racerIds: [0, 1, 2, 3],
};
initialState.snapshots = initialState.builds.map((blueprint, id) => {
  const pose = { position: { x: id * 3, y: 14, z: 10 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  return { ...pose, id: id as 0 | 1 | 2 | 3, wheels: Array.from({ length: 4 }, () => pose), blueprint,
    charge: 0, grounded: true, recovering: false, finished: false, finishTime: null,
    speed: 5, progress: 0.05, jumps: 0, recoveries: 0, flips: 0, maxRoll: 0 };
});
let publishedState = initialState;
let closeRequests = 0;
const blockedPhones = new Set<string>();
const requests: PartyRequest[] = [];
let replayReply: { token: string; state: PartyState } | null = null;
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
let batchTail = Promise.resolve<unknown[]>([]);
const database: PartyDatabase = {
  prepare: statement,
  batch(statements) {
    const next = batchTail.then(async () => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    batchTail = next.catch(() => []);
    return next;
  },
};
const fetchStub = async (_url: unknown, options: RequestInit) => {
  assert(typeof options.body === 'string');
  const request = JSON.parse(options.body) as PartyRequest;
  requests.push(request);
  if (request.action === 'player' && blockedPhones.has(request.token)) throw new TypeError('Network unavailable');
  if (request.action === 'close') closeRequests++;
  const response = await handlePartyRequest(new Request('https://derby.example/api/party', options), database);
  if (request.action === 'player' && replayReply?.token === request.token && response.ok) {
    const body = await response.json() as Record<string, unknown>;
    return new Response(JSON.stringify({ ...body, state: replayReply.state }), { headers: { 'Content-Type': 'application/json' } });
  }
  return response;
};

replaceGlobal('document', documentStub);
replaceGlobal('window', windowStub);
replaceGlobal('fetch', fetchStub);
replaceGlobal('RTCPeerConnection', TestPeer);
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 100_000 });

let host: PartyHost | undefined;
const controllers: PartyController[] = [];
const inputs: Array<{ id: number; kind: PartyInput['kind'] }> = [];
const connections: PartyConnection[] = ['connecting', 'connecting', 'connecting', 'connecting'];
let connectedPlayers: PartyPlayer[] = [];
const errors: string[] = [];
const phoneViews: PartyState[] = [];
async function settle() {
  for (let count = 0; count < 8; count++) { await setImmediate(); await Promise.resolve(); }
}
async function advance(milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 20) {
    mock.timers.tick(20);
    host?.publish(publishedState);
    await settle();
  }
}

try {
  host = await createHostParty({ onPlayers: value => { connectedPlayers = value; },
    onInput: (id, kind) => inputs.push({ id, kind }), onError: error => errors.push(error) }, initialState);
  for (const id of [0, 1, 2, 3]) controllers.push(await connectController(host.code, {
    onState: value => { phoneViews[id] = value; }, onConnection: value => { connections[id] = value; }, onError: error => errors.push(error),
  }));
  await advance(600);
  assert.deepEqual(connections, ['direct', 'direct', 'direct', 'direct'], 'All four phones should establish a direct route.');
  assert(connectedPlayers.every(player => player.connected));
  assert.deepEqual(phoneViews[3].snapshots, initialState.snapshots, 'The fourth phone receives every full chassis and wheel transform.');
  assert.deepEqual(phoneViews[3].racerIds, [0, 1, 2, 3]);

  const phonePeers = TestPeer.all.filter(peer => peer.localDescription?.type === 'offer');
  const firstChannel = phonePeers[0].channel!;
  const start = inputs.length;
  controllers[0].input('hold');
  await advance(20);
  firstChannel.drop = true;
  const requestsBeforeRelease = requests.length;
  controllers[0].input('release');
  await settle();
  assert(requests.slice(requestsBeforeRelease).some(request => request.action === 'player'
    && request.token === controllers[0].token && request.packet.events.at(-1)?.kind === 'release'),
  'A gesture must immediately use HTTP backup even when a stalled RTC channel reports open.');
  await advance(100);
  assert.deepEqual(inputs.slice(start), [{ id: 0, kind: 'hold' }, { id: 0, kind: 'release' }],
    'RTC hold plus HTTP release must reach the host once each.');

  firstChannel.drop = false;
  const handoverStart = inputs.length;
  controllers[0].input('hold');
  await advance(20);
  firstChannel.close();
  await advance(20);
  assert.equal(connections[0], 'relay');
  assert.deepEqual(inputs.slice(handoverStart), [{ id: 0, kind: 'hold' }],
    'Losing RTC must not cancel an active hold while HTTP remains healthy.');
  controllers[0].input('release');
  await advance(120);
  assert.deepEqual(inputs.slice(handoverStart), [{ id: 0, kind: 'hold' }, { id: 0, kind: 'release' }]);

  const tapsStart = inputs.length;
  controllers[0].input('hold'); controllers[0].input('release');
  for (const controller of controllers.slice(1)) { controller.input('hold'); controller.input('release'); }
  await advance(300);
  for (const id of [0, 1, 2, 3]) assert.deepEqual(inputs.slice(tapsStart).filter(input => input.id === id),
    [{ id, kind: 'hold' }, { id, kind: 'release' }], 'Rapid input edges must retain order and remain independent.');

  controllers[0].input('hold');
  await advance(100);
  const blurStart = inputs.length;
  windowStub.dispatchEvent(new Event('blur'));
  await advance(120);
  assert(inputs.slice(blurStart).some(input => input.id === 0 && input.kind === 'cancel'));
  assert(!inputs.slice(blurStart).some(input => input.kind === 'release'), 'Blur must cancel without launching.');

  const oldRaceView = phoneViews[0];
  publishedState = { ...initialState, stage: 'results' };
  host.publish(publishedState);
  await advance(120);
  assert.equal(phoneViews[0].stage, 'results');
  replayReply = { token: controllers[0].token, state: oldRaceView };
  await advance(200);
  assert.equal(phoneViews[0].stage, 'results', 'A delayed HTTP snapshot must not rewind the phone after RTC closes.');
  phonePeers[1].channel?.onmessage?.({ data: JSON.stringify({ type: 'state', state: oldRaceView }) });
  assert.equal(phoneViews[1].stage, 'results', 'A delayed RTC snapshot must not overwrite a newer frame from either route.');
  replayReply = null;
  const nextBuild = { bodyId: 'banana', wheelId: 'standard', wheelbase: 'long' } as const;
  controllers[2].setBuild(nextBuild);
  controllers[2].setReady(true);
  await advance(120);
  assert.equal(connectedPlayers[2].readyHeat, 2, 'Results readiness should prepare the upcoming heat.');
  assert.deepEqual(connectedPlayers[2].build, nextBuild);
  publishedState = { ...initialState, stage: 'garage', heat: 2,
    builds: initialState.builds.map((build, id) => id === 2 ? nextBuild : build) };
  host.publish(publishedState);
  await advance(120);
  assert.equal(connectedPlayers[2].ready, true, 'Entering the prepared heat must retain its readiness.');
  assert.equal(connectedPlayers[2].readyHeat, 2);
  controllers[2].setBuild(initialState.builds[2]);
  await advance(120);
  assert.equal(connectedPlayers[2].ready, false, 'A new build invalidates readiness.');
  publishedState = { ...initialState, heat: 2 };
  host.publish(publishedState);
  await advance(100);

  blockedPhones.add(controllers[0].token);
  await advance(2_700);
  assert.equal(connectedPlayers[0].connected, false, 'Losing both paths must expire the controller lease.');
  assert.equal(connectedPlayers[1].connected, true, 'One disconnected phone must not disconnect the other.');
  const reconnectStart = inputs.length;
  controllers[0].input('hold'); controllers[0].input('release');
  blockedPhones.delete(controllers[0].token);
  await advance(300);
  assert.equal(connectedPlayers[0].connected, true);
  assert(!inputs.slice(reconnectStart).some(input => input.id === 0 && input.kind === 'release'),
    'Buffered release from before reconnection must not launch a vehicle.');
  assert.equal(errors.length, 0);

  host.dispose();
  await Promise.all([host.close(), host.close()]);
  assert.equal(closeRequests, 1, 'Closing an already disposed host should close the server once.');
  console.log('Four-phone client + SQLite server checks passed: full snapshots and roster, monotonic state revisions, upcoming-heat readiness, immediate relay backup, seamless RTC handover, ordered independent taps, duplicate suppression, blur cancellation, disconnect leases, stale reconnect fencing, and close cleanup.');
} finally {
  controllers.forEach(controller => controller.dispose());
  host?.dispose();
  await settle();
  mock.timers.reset();
  sqlite.close();
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}
