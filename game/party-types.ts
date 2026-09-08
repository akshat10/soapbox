import type { Blueprint, PlayerId, Stage, VehicleSnapshot } from '@/game/types';

export type InputKind = 'hold' | 'release' | 'cancel';
export interface PartyInput { seq: number; kind: InputKind }
export type PhoneSnapshot = Pick<VehicleSnapshot, 'id' | 'charge' | 'grounded' | 'recovering' | 'finished' | 'finishTime' | 'speed' | 'progress' | 'jumps' | 'recoveries'>;
export interface PartyState {
  stage: Stage; builds: Blueprint[]; snapshots: PhoneSnapshot[];
  elapsed: number; countdown: number; heat: number; scores: number[];
  ready: boolean[]; paused: boolean;
}
export interface PartyPlayer {
  id: PlayerId; connected: boolean; build: Blueprint; ready: boolean; readyHeat: number;
  seq: number; events: PartyInput[]; offer: RTCSessionDescriptionInit | null; lastSeen: number;
}
export interface ControllerPacket {
  seq: number; events: PartyInput[]; build: Blueprint; ready: boolean; readyHeat: number;
  offer: RTCSessionDescriptionInit | null;
}
export interface PartyIdentity { code: string; playerId: PlayerId; token: string; expiresAt: number; build: Blueprint; seq: number }
export interface HostIdentity { code: string; token: string; expiresAt: number }
export type PartyRequest =
  | { action: 'create' }
  | { action: 'join'; code: string; token?: string }
  | { action: 'host'; code: string; token: string; state: PartyState; answers: Array<{ player: PlayerId; description: RTCSessionDescriptionInit; offerSdp: string }> }
  | { action: 'player'; code: string; token: string; packet: ControllerPacket }
  | { action: 'close'; code: string; token: string };
export interface HostReply { players: PartyPlayer[]; expiresAt: number }
export interface PlayerReply { state: PartyState | null; answer: RTCSessionDescriptionInit | null; hostConnected: boolean; expiresAt: number }
export type PartyConnection = 'connecting' | 'direct' | 'relay' | 'disconnected';
export interface HostCallbacks {
  onPlayers: (players: PartyPlayer[]) => void;
  onInput: (id: PlayerId, kind: InputKind) => void;
  onError: (message: string) => void;
}
export interface ControllerCallbacks {
  onState: (state: PartyState) => void;
  onConnection: (connection: PartyConnection) => void;
  onError: (message: string) => void;
}
// party-client.ts exports createHostParty(callbacks, initialState): Promise<PartyHost>
// PartyHost: code, expiresAt, publish(state), close(): Promise<void>, dispose(): void
// and connectController(code, callbacks, token?): Promise<PartyController>
// PartyController: code, playerId, token, build, setBuild(build), setReady(ready), input(kind), dispose()
