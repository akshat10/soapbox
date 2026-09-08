export type MusicStatus = 'ready' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
export interface MusicState { index: number; volume: number; status: MusicStatus }
export const DEFAULT_MUSIC_VOLUME = 0.25;

/** One streaming element for the whole session; never decode the playlist into memory. */
export class MusicPlayer {
  private audio: HTMLAudioElement;
  private unlocked = false;
  private muted = false;
  private paused = false;
  private hidden = false;
  private disposed = false;
  private pending = false;
  private generation = 0;
  private failed = new Set<number>();
  state: MusicState = { index: 0, volume: DEFAULT_MUSIC_VOLUME, status: 'ready' };

  constructor(private sources: readonly string[], private changed: (state: MusicState) => void, audio?: HTMLAudioElement) {
    this.audio = audio ?? new Audio();
    this.audio.preload = 'none';
    this.audio.volume = this.state.volume;
    this.audio.addEventListener('ended', this.ended);
    this.audio.addEventListener('error', this.failedTrack);
  }

  private emit(status = this.state.status) {
    this.state = { ...this.state, status };
    if (!this.disposed) this.changed(this.state);
  }
  private get allowed() { return this.unlocked && !this.muted && !this.paused && !this.hidden && this.state.volume > 0 && !this.disposed; }

  unlock() { this.unlocked = true; this.sync(); }
  setMuted(muted: boolean) { this.muted = muted; this.sync(); }
  setPaused(paused: boolean) { this.paused = paused; this.sync(); }
  setHidden(hidden: boolean) { this.hidden = hidden; this.sync(); }
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.state = { ...this.state, volume: Math.max(0, Math.min(1, volume)) };
    this.audio.volume = this.state.volume;
    this.emit(); this.sync();
  }
  next = () => {
    if (!this.sources.length || this.disposed) return;
    this.stop();
    let index = (this.state.index + 1) % this.sources.length;
    for (let skipped = 0; skipped < this.sources.length && this.failed.has(index); skipped++) index = (index + 1) % this.sources.length;
    this.state = { ...this.state, index };
    this.audio.removeAttribute('src');
    this.emit('ready'); this.sync();
  };
  retry = () => {
    this.failed.clear(); this.unlocked = true;
    this.stop(); this.audio.removeAttribute('src'); this.sync();
  };
  private ended = () => { this.failed.clear(); this.next(); };
  private failedTrack = () => {
    if (this.disposed || this.failed.has(this.state.index)) return;
    this.failed.add(this.state.index);
    if (this.failed.size >= this.sources.length) { this.stop(); this.emit('error'); }
    else this.next();
  };
  private stop() {
    this.generation++; this.pending = false; this.audio.pause();
  }
  private sync() {
    if (this.disposed) return;
    if (!this.allowed) {
      this.stop(); this.emit(this.unlocked ? 'paused' : 'ready'); return;
    }
    if (!this.sources.length || this.failed.size >= this.sources.length) { this.emit('error'); return; }
    if (this.pending || !this.audio.paused) return;
    if (!this.audio.getAttribute('src')) this.audio.src = this.sources[this.state.index];
    const generation = ++this.generation;
    this.pending = true; this.emit('loading');
    void this.audio.play().then(() => {
      if (this.disposed || generation !== this.generation) return;
      this.pending = false; this.emit('playing');
    }).catch((error: unknown) => {
      if (this.disposed || generation !== this.generation) return;
      this.pending = false;
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotAllowedError') this.emit('blocked');
      else if (name === 'AbortError') this.emit('paused');
      else this.failedTrack();
    });
  }
  dispose() {
    this.disposed = true; this.stop();
    this.audio.removeEventListener('ended', this.ended);
    this.audio.removeEventListener('error', this.failedTrack);
    this.audio.removeAttribute('src'); this.audio.load();
  }
}
