import type { DerbyEvent } from './physics';
import type { VehicleSnapshot } from './types';

/** Small synthesized tire/engine bed and impact sounds, unlocked by a gesture. */
export class RaceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private lastEvent: DerbyEvent | undefined;

  unlock() {
    try {
      if (!this.context) {
        const context = this.context = new AudioContext();
        const master = this.master = context.createGain();
        master.gain.value = this.muted ? 0 : .45;
        master.connect(context.destination);
        const engine = this.engine = context.createOscillator();
        const gain = this.engineGain = context.createGain();
        const filter = context.createBiquadFilter();
        engine.type = 'sawtooth'; engine.frequency.value = 60;
        filter.type = 'lowpass'; filter.frequency.value = 240;
        gain.gain.value = 0;
        engine.connect(filter); filter.connect(gain); gain.connect(master); engine.start();
        this.noise = context.createBuffer(1, context.sampleRate * .6, context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Sound is optional if the device has no audio output. */ }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : .45, this.context.currentTime, .015);
  }

  reset() { this.lastEvent = undefined; }

  update(player: VehicleSnapshot | undefined, active: boolean, events: readonly DerbyEvent[]) {
    const context = this.context;
    if (context && this.engine && this.engineGain) {
      const rolling = active && player && !player.finished && !player.recovering;
      const speed = player?.speed ?? 0;
      this.engine.frequency.setTargetAtTime(52 + speed * 5 + ((player?.boostRemaining ?? 0) > 0 ? 35 : 0), context.currentTime, .12);
      this.engineGain.gain.setTargetAtTime(rolling ? Math.min(.06, speed * .003) * (player.grounded ? 1 : .3) : 0, context.currentTime, .05);
    }
    const index = this.lastEvent ? events.indexOf(this.lastEvent) + 1 : 0;
    if (active) for (const event of events.slice(index)) {
      if (event.playerId !== 0) continue;
      if (event.type === 'collision') this.hit(.18, 420, Math.min(.3, (event.value ?? 3) * .025));
      if (event.type === 'landing') this.hit(.12, 240, .2);
      if (event.type === 'rough') this.hit(.4, 1200, .1);
    }
    this.lastEvent = events.at(-1);
  }

  private hit(duration: number, frequency: number, volume: number) {
    if (this.muted || !this.context || !this.master || !this.noise || this.context.state !== 'running') return;
    const context = this.context, source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(); source.stop(context.currentTime + duration);
  }

  dispose() {
    this.engine?.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.master = null; this.engine = null; this.engineGain = null; this.noise = null;
  }
}
