'use client';

import { DEFAULT_BUILDS, isLegalBuild } from '@/game/catalogue';
import type { Blueprint, PlayerId } from '@/game/types';
import type {
  ControllerCallbacks, ControllerPacket, HostCallbacks, HostIdentity, HostReply,
  InputKind, PartyConnection, PartyIdentity, PartyInput, PartyPlayer, PartyState, PlayerReply,
} from '@/game/party-types';

const API_PATH = '/api/party';
const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RTC_BUFFER = 16_384;
const CONTROLLER_LEASE_MS = 2_200;
const HOST_LEASE_MS = 4_500;

export class PartyApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'PartyApiError';
  }
}

/** In-flight requests are cancelled when their owner is disposed. */
class PartyApi {
  private pending = new Set<AbortController>();
  private disposed = false;

  async post<T>(body: unknown, keepalive = false): Promise<T> {
    if (this.disposed && !keepalive) throw new DOMException('Connection closed', 'AbortError');
    const controller = new AbortController();
    this.pending.add(controller);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(API_PATH, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal, cache: 'no-store', keepalive,
      });
      const payload = await response.json() as T & { error?: string };
      if (!response.ok) throw new PartyApiError(payload.error || 'Could not connect to this race. Please try again.', response.status);
      return payload;
    } finally {
      clearTimeout(timeout);
      this.pending.delete(controller);
    }
  }

  close() {
    this.disposed = true;
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }
}

/** Self-scheduling polling never overlaps its preceding request. */
class PollLoop {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private running = false;
  private urgent = false;
  private tick: (() => Promise<void>) | undefined;

  start(task: () => Promise<void>, delay: () => number) {
    this.stop();
    this.stopped = false;
    this.tick = async () => {
      if (this.stopped || this.running) return;
      this.running = true;
      this.urgent = false;
      try { await task(); } catch { /* The owner reports connection failures. */ } finally {
        this.running = false;
        if (!this.stopped) this.timer = setTimeout(() => void this.tick?.(), this.urgent ? 0 : delay());
      }
    };
    void this.tick();
  }

  wake() {
    if (this.stopped) return;
    if (this.running) { this.urgent = true; return; }
    if (this.timer) clearTimeout(this.timer);
    void this.tick?.();
  }

  stop() {
    this.stopped = true;
    this.urgent = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

function safeSend(channel: RTCDataChannel | undefined, value: unknown): boolean {
  if (!channel || channel.readyState !== 'open' || channel.bufferedAmount > MAX_RTC_BUFFER) return false;
  try { channel.send(JSON.stringify(value)); return true; } catch { return false; }
}

function readPacket(data: unknown): unknown {
  if (typeof data !== 'string' || data.length > 32_768) return null;
  try { return JSON.parse(data); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function legalBlueprint(value: unknown): value is Blueprint {
  return isRecord(value) && typeof value.bodyId === 'string'
    && typeof value.wheelId === 'string' && typeof value.wheelbase === 'string'
    && isLegalBuild(value as unknown as Blueprint);
}

function validSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isControllerPacket(value: unknown): value is ControllerPacket {
  if (!isRecord(value) || !validSequence(value.seq) || !legalBlueprint(value.build)
    || typeof value.ready !== 'boolean' || !validSequence(value.readyHeat)
    || !Array.isArray(value.events) || value.events.length > 16) return false;
  return value.events.every(event => isRecord(event) && validSequence(event.seq)
    && event.seq <= (value.seq as number)
    && (event.kind === 'hold' || event.kind === 'release' || event.kind === 'cancel'));
}

function isPartyState(value: unknown): value is PartyState {
  return isRecord(value) && ['garage', 'countdown', 'racing', 'results', 'final'].includes(String(value.stage))
    && Array.isArray(value.builds) && value.builds.length === 2 && value.builds.every(legalBlueprint)
    && Array.isArray(value.snapshots) && Array.isArray(value.scores) && Array.isArray(value.ready)
    && typeof value.heat === 'number' && typeof value.paused === 'boolean';
}

async function gatherDescription(peer: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  if (peer.iceGatheringState !== 'complete') {
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', check); resolve(); };
      const check = () => { if (peer.iceGatheringState === 'complete') done(); };
      const timer = setTimeout(done, 3_000);
      peer.addEventListener('icegatheringstatechange', check);
      check();
    });
  }
  if (!peer.localDescription) throw new Error('Could not prepare the controller connection.');
  return { type: peer.localDescription.type, sdp: peer.localDescription.sdp };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Connection interrupted. Reconnecting…';
}

function isTerminalError(error: unknown) {
  return error instanceof PartyApiError && [400, 401, 403, 404, 410].includes(error.status);
}

interface HostPeer {
  player: PartyPlayer;
  lastPacketAt: number;
  lastInputSeq: number;
  peer?: RTCPeerConnection;
  channel?: RTCDataChannel;
  offerKey: string;
  answer?: RTCSessionDescriptionInit;
}

export class PartyHost {
  readonly code: string;
  readonly expiresAt: number;
  private readonly token: string;
  private api: PartyApi;
  private callbacks: HostCallbacks;
  private poll = new PollLoop();
  private leaseTimer: ReturnType<typeof setInterval>;
  private peers: [HostPeer, HostPeer];
  private state: PartyState;
  private disposed = false;
  private lastBroadcast = 0;
  private lastPlayersKey = '';
  private lastError = '';
  private closeRequest: Promise<void> | null = null;

  constructor(identity: HostIdentity, callbacks: HostCallbacks, initialState: PartyState, api: PartyApi) {
    this.code = identity.code;
    this.token = identity.token;
    this.expiresAt = identity.expiresAt;
    this.callbacks = callbacks;
    this.state = initialState;
    this.api = api;
    const makePeer = (id: PlayerId): HostPeer => ({
      player: { id, connected: false, build: { ...(initialState.builds[id] ?? DEFAULT_BUILDS[id]) }, ready: false,
        readyHeat: 0, seq: -1, events: [], offer: null, lastSeen: 0 },
      lastPacketAt: 0, lastInputSeq: -1, offerKey: '',
    });
    this.peers = [makePeer(0), makePeer(1)];
    this.leaseTimer = setInterval(() => this.checkLeases(), 200);
    this.poll.start(() => this.sync(), () => this.peers.every(peer => peer.channel?.readyState === 'open') ? 700 : 100);
    this.notifyPlayers();
  }

  publish(state: PartyState) {
    if (this.disposed) return;
    const stageChanged = this.state.stage !== state.stage || this.state.heat !== state.heat || this.state.paused !== state.paused;
    this.state = state;
    const now = performance.now();
    if (stageChanged || now - this.lastBroadcast >= 80) {
      this.lastBroadcast = now;
      for (const peer of this.peers) safeSend(peer.channel, { type: 'state', state });
    }
    if (stageChanged) this.poll.wake();
  }

  private notifyPlayers() {
    const players = this.peers.map(peer => ({ ...peer.player, build: { ...peer.player.build }, events: [...peer.player.events] }));
    const key = JSON.stringify(players.map(player => [player.id, player.connected, player.build, player.ready, player.readyHeat]));
    if (key !== this.lastPlayersKey) {
      this.lastPlayersKey = key;
      this.callbacks.onPlayers(players);
    }
  }

  private acceptPacket(id: PlayerId, packet: ControllerPacket, receivedAt: number) {
    if (this.disposed || !isControllerPacket(packet)) return;
    const peer = this.peers[id];
    if (packet.seq < peer.player.seq) return;
    const fresh = packet.seq > peer.player.seq;
    const reconnecting = !peer.player.connected && peer.lastPacketAt > 0;
    if (fresh && reconnecting) {
      // The first packet after a lease expires may contain buffered old gestures.
      // Reconnect the slot, but require a fresh gesture before charging again.
      peer.lastInputSeq = Math.max(peer.lastInputSeq, packet.seq);
      this.callbacks.onInput(id, 'cancel');
    }
    if (fresh) {
      peer.lastPacketAt = receivedAt;
      peer.player = { ...peer.player, seq: packet.seq, build: { ...packet.build }, ready: packet.ready,
        readyHeat: packet.readyHeat, connected: true, lastSeen: receivedAt, events: [...packet.events] };
    }
    if (!peer.player.connected) return;
    for (const event of [...packet.events].sort((a, b) => a.seq - b.seq)) {
      if (event.seq <= peer.lastInputSeq) continue;
      peer.lastInputSeq = event.seq;
      this.callbacks.onInput(id, event.kind);
    }
    this.notifyPlayers();
  }

  private checkLeases() {
    if (this.disposed) return;
    const now = Date.now();
    for (const peer of this.peers) {
      if (peer.player.connected && now - peer.lastPacketAt > CONTROLLER_LEASE_MS) {
        // Fence pre-disconnect events; a reconnect must start a new hold.
        peer.lastInputSeq = Math.max(peer.lastInputSeq, peer.player.seq);
        peer.player.connected = false;
        peer.player.ready = false;
        this.callbacks.onInput(peer.player.id, 'cancel');
      }
    }
    this.notifyPlayers();
  }

  private async sync() {
    if (this.disposed) return;
    try {
      const reply = await this.api.post<HostReply>({ action: 'host', code: this.code, token: this.token,
        state: this.state, answers: this.peers.flatMap(peer => peer.answer ? [{ player: peer.player.id, description: peer.answer, offerSdp: peer.offerKey }] : []) });
      if (this.disposed) return;
      this.lastError = '';
      for (const player of reply.players ?? []) {
        if (player.id !== 0 && player.id !== 1) continue;
        if (player.connected && Date.now() - player.lastSeen < CONTROLLER_LEASE_MS) {
          this.acceptPacket(player.id, player, player.lastSeen);
        }
        if (player.offer?.type === 'offer' && typeof player.offer.sdp === 'string' && player.offer.sdp.length < 24_576) {
          void this.answerOffer(player.id, player.offer);
        }
      }
      this.checkLeases();
    } catch (error) {
      if (this.disposed) return;
      const message = errorMessage(error);
      if (isTerminalError(error)) { this.callbacks.onError(message); this.dispose(); return; }
      if (message !== this.lastError) { this.lastError = message; this.callbacks.onError('Race connection interrupted. Reconnecting…'); }
      this.checkLeases();
    }
  }

  private async answerOffer(id: PlayerId, offer: RTCSessionDescriptionInit) {
    const slot = this.peers[id];
    const key = offer.sdp ?? '';
    if (this.disposed || typeof RTCPeerConnection === 'undefined' || slot.offerKey === key) return;
    slot.offerKey = key;
    slot.answer = undefined;
    slot.channel?.close();
    slot.peer?.close();
    let peer: RTCPeerConnection;
    try { peer = new RTCPeerConnection(RTC_CONFIGURATION); } catch { return; }
    slot.peer = peer;
    peer.ondatachannel = event => {
      if (this.disposed || slot.peer !== peer || event.channel.label !== 'doodle-controller') { event.channel.close(); return; }
      slot.channel = event.channel;
      event.channel.onmessage = message => {
        if (slot.peer !== peer || this.disposed) return;
        const parsed = readPacket(message.data);
        if (isRecord(parsed) && parsed.type === 'controller' && isControllerPacket(parsed.packet)) {
          this.acceptPacket(id, parsed.packet, Date.now());
        }
      };
      event.channel.onopen = () => safeSend(event.channel, { type: 'state', state: this.state });
      event.channel.onclose = () => {
        if (slot.peer === peer && !this.disposed) {
          this.callbacks.onInput(id, 'cancel');
          slot.lastInputSeq = Math.max(slot.lastInputSeq, slot.player.seq);
          this.poll.wake();
        }
      };
    };
    try {
      await peer.setRemoteDescription(offer);
      await peer.setLocalDescription(await peer.createAnswer());
      const answer = await gatherDescription(peer);
      if (this.disposed || slot.peer !== peer) return;
      slot.answer = answer;
      this.poll.wake();
    } catch {
      if (slot.peer === peer) { peer.close(); slot.peer = undefined; }
      // HTTP controls remain available when a direct connection cannot be made.
    }
  }

  close(): Promise<void> {
    if (this.closeRequest) return this.closeRequest;
    this.dispose();
    this.closeRequest = this.api.post({ action: 'close', code: this.code, token: this.token }, true).then(() => {});
    return this.closeRequest;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.poll.stop();
    clearInterval(this.leaseTimer);
    this.api.close();
    for (const peer of this.peers) {
      this.callbacks.onInput(peer.player.id, 'cancel');
      peer.channel?.close();
      peer.peer?.close();
    }
  }
}

export async function createHostParty(callbacks: HostCallbacks, initialState: PartyState): Promise<PartyHost> {
  const api = new PartyApi();
  try {
    const identity = await api.post<HostIdentity>({ action: 'create' });
    return new PartyHost(identity, callbacks, initialState, api);
  } catch (error) { api.close(); throw error; }
}

export class PartyController {
  readonly code: string;
  readonly playerId: PlayerId;
  readonly token: string;
  readonly expiresAt: number;
  build: Blueprint;
  private api: PartyApi;
  private callbacks: ControllerCallbacks;
  private poll = new PollLoop();
  private heartbeat: ReturnType<typeof setInterval>;
  private connection: PartyConnection = 'connecting';
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private offer: RTCSessionDescriptionInit | null = null;
  private nextRtcAttempt = 0;
  private negotiating = false;
  private seq: number;
  private events: PartyInput[] = [];
  private ready = false;
  private readyHeat = 0;
  private held = false;
  private lastHostSeen = 0;
  private lastDirectStateAt = 0;
  private latestState: PartyState | null = null;
  private disposed = false;
  private terminal = false;
  private visibility = () => { if (document.visibilityState !== 'visible') this.cancelForLifecycle(); };
  private blur = () => this.cancelForLifecycle();

  constructor(identity: PartyIdentity, callbacks: ControllerCallbacks, api: PartyApi) {
    this.code = identity.code;
    this.playerId = identity.playerId;
    this.token = identity.token;
    this.expiresAt = identity.expiresAt;
    this.build = { ...identity.build };
    this.seq = identity.seq;
    this.callbacks = callbacks;
    this.api = api;
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    window.addEventListener('pagehide', this.blur);
    this.callbacks.onConnection('connecting');
    this.heartbeat = setInterval(() => {
      if (this.disposed || this.terminal) return;
      if (this.channel?.readyState === 'open') this.sendDirect();
      if (this.lastHostSeen && Date.now() - this.lastHostSeen > HOST_LEASE_MS) this.setConnection('disconnected');
      if ((!this.peer || this.peer.connectionState === 'failed') && Date.now() > this.nextRtcAttempt) void this.prepareOffer();
    }, 350);
    this.poll.start(() => this.sync(), () => this.connection === 'direct' ? 800 : 200);
    void this.prepareOffer();
  }

  private packet(): ControllerPacket {
    return { seq: ++this.seq, events: [...this.events], build: { ...this.build }, ready: this.ready,
      readyHeat: this.readyHeat, offer: this.offer };
  }

  private setConnection(value: PartyConnection) {
    if (this.connection === value || this.disposed) return;
    if (value === 'disconnected') this.input('cancel');
    this.connection = value;
    this.callbacks.onConnection(value);
  }

  setBuild(build: Blueprint) {
    if (this.disposed || this.terminal || !legalBlueprint(build) || this.latestState?.stage !== 'garage') return;
    this.build = { ...build };
    this.ready = false;
    this.readyHeat = 0;
    this.changed();
  }

  setReady(ready: boolean) {
    if (this.disposed || this.terminal || !this.latestState || this.latestState.stage !== 'garage') return;
    this.ready = ready;
    this.readyHeat = ready ? this.latestState.heat : 0;
    this.changed();
  }

  input(kind: InputKind) {
    if (this.disposed || this.terminal) return;
    if (kind === 'hold') {
      if (this.held || !['direct', 'relay'].includes(this.connection) || this.latestState?.paused) return;
      this.held = true;
    } else if (kind === 'release') {
      if (!this.held) return;
      this.held = false;
    } else {
      this.held = false;
    }
    this.events.push({ seq: ++this.seq, kind });
    this.events = this.events.slice(-16);
    this.changed();
  }

  private changed() {
    if (this.channel?.readyState === 'open') this.sendDirect();
    else this.poll.wake();
  }

  private sendDirect() {
    const sent = safeSend(this.channel, { type: 'controller', packet: this.packet() });
    if (!sent) this.poll.wake();
  }

  private receiveState(state: PartyState, direct: boolean) {
    if (this.disposed || !isPartyState(state)) return;
    const now = Date.now();
    if (!direct && now - this.lastDirectStateAt < 1_300) return;
    if (direct) this.lastDirectStateAt = now;
    this.lastHostSeen = now;
    const oldState = this.latestState;
    this.latestState = state;
    if (state.paused && !oldState?.paused) this.input('cancel');
    if (state.stage === 'garage' && (oldState?.heat !== state.heat || oldState?.stage !== 'garage')) {
      this.ready = false;
      this.readyHeat = 0;
      this.build = { ...state.builds[this.playerId] };
      this.changed();
    }
    this.callbacks.onState(state);
    this.setConnection(direct || this.channel?.readyState === 'open' ? 'direct' : 'relay');
  }

  private async sync() {
    if (this.disposed || this.terminal) return;
    try {
      const packet = this.packet();
      const reply = await this.api.post<PlayerReply>({ action: 'player', code: this.code, token: this.token, packet });
      if (this.disposed) return;
      if (reply.hostConnected) {
        this.lastHostSeen = Date.now();
        if (reply.state) this.receiveState(reply.state, false);
      } else if (Date.now() - this.lastDirectStateAt > HOST_LEASE_MS) this.setConnection('disconnected');
      if (reply.answer?.type === 'answer' && packet.offer && this.peer && !this.peer.remoteDescription
        && packet.offer.sdp === this.offer?.sdp) {
        const peer = this.peer;
        try { await peer.setRemoteDescription(reply.answer); } catch {
          if (this.peer === peer) { peer.close(); this.peer = undefined; this.nextRtcAttempt = Date.now() + 5_000; }
        }
      }
    } catch (error) {
      if (this.disposed) return;
      if (isTerminalError(error)) {
        this.setConnection('disconnected');
        this.terminal = true;
        this.poll.stop();
        this.callbacks.onError(errorMessage(error));
        return;
      }
      if (Date.now() - this.lastHostSeen > HOST_LEASE_MS) this.setConnection('disconnected');
    }
  }

  private async prepareOffer() {
    if (this.disposed || this.terminal || this.negotiating || typeof RTCPeerConnection === 'undefined') return;
    this.negotiating = true;
    this.nextRtcAttempt = Date.now() + 12_000;
    this.channel?.close();
    this.peer?.close();
    let peer: RTCPeerConnection;
    try { peer = new RTCPeerConnection(RTC_CONFIGURATION); } catch { this.negotiating = false; return; }
    this.peer = peer;
    const channel = peer.createDataChannel('doodle-controller', { ordered: true });
    this.channel = channel;
    channel.onopen = () => {
      if (this.disposed || this.peer !== peer) return;
      this.sendDirect();
    };
    channel.onmessage = event => {
      if (this.disposed || this.peer !== peer) return;
      const parsed = readPacket(event.data);
      if (isRecord(parsed) && parsed.type === 'state' && isPartyState(parsed.state)) this.receiveState(parsed.state, true);
    };
    channel.onclose = () => {
      if (this.disposed || this.peer !== peer) return;
      this.input('cancel');
      this.setConnection(Date.now() - this.lastHostSeen < HOST_LEASE_MS ? 'relay' : 'disconnected');
      this.poll.wake();
    };
    peer.onconnectionstatechange = () => {
      if (this.disposed || this.peer !== peer) return;
      if (peer.connectionState === 'failed') {
        this.input('cancel');
        channel.close();
        this.peer = undefined;
        peer.close();
        this.poll.wake();
      }
    };
    try {
      await peer.setLocalDescription(await peer.createOffer());
      const offer = await gatherDescription(peer);
      if (this.disposed || this.peer !== peer) return;
      this.offer = offer;
      this.poll.wake();
    } catch {
      if (this.peer === peer) { peer.close(); this.peer = undefined; }
    } finally { this.negotiating = false; }
  }

  private cancelForLifecycle() {
    if (this.disposed || this.terminal) return;
    this.input('cancel');
    // keepalive covers pagehide; subsequent repeated packets cover temporary blur.
    const packet = this.packet();
    void this.api.post({ action: 'player', code: this.code, token: this.token, packet }, true).catch(() => {});
  }

  dispose() {
    if (this.disposed) return;
    this.input('cancel');
    this.ready = false;
    this.readyHeat = 0;
    const packet = this.packet();
    safeSend(this.channel, { type: 'controller', packet });
    this.disposed = true;
    this.poll.stop();
    clearInterval(this.heartbeat);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('pagehide', this.blur);
    this.channel?.close();
    this.peer?.close();
    this.api.close();
    void this.api.post({ action: 'player', code: this.code, token: this.token, packet }, true).catch(() => {});
  }
}

export async function connectController(code: string, callbacks: ControllerCallbacks, token?: string): Promise<PartyController> {
  const api = new PartyApi();
  const cleanCode = code.trim().toUpperCase();
  try {
    const identity = await api.post<PartyIdentity>({ action: 'join', code: cleanCode, ...(token ? { token } : {}) });
    return new PartyController(identity, callbacks, api);
  } catch (error) { api.close(); throw error; }
}
