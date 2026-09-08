import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MusicPlayer, type MusicState } from './music-player';
import { MUSIC_TRACKS } from './music-tracks';

class TestAudio extends EventTarget {
  preload = ''; volume = 1; src = ''; paused = true; currentTime = 0; plays = 0;
  reject: Error | null = null;
  deferred: (() => Promise<void>) | null = null;
  play() {
    this.plays++;
    if (this.reject) return Promise.reject(this.reject);
    this.paused = false;
    return this.deferred?.() ?? Promise.resolve();
  }
  pause() { this.paused = true; }
  getAttribute() { return this.src || null; }
  removeAttribute() { this.src = ''; this.currentTime = 0; }
  load() {}
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(sources = ['/one.mp3', '/two.mp3']) {
  const audio = new TestAudio();
  const updates: MusicState[] = [];
  const player = new MusicPlayer(sources, state => updates.push(state), audio as unknown as HTMLAudioElement);
  return { audio, player, updates };
}

// No fetching before activation; transitions preserve the track and playback position.
{
  const { player, audio } = setup();
  assert.equal(audio.src, ''); assert.equal(audio.plays, 0);
  player.unlock(); await flush();
  assert.equal(player.state.status, 'playing'); assert.equal(audio.src, '/one.mp3');
  audio.currentTime = 37;
  player.setPaused(true); assert.equal(audio.paused, true);
  player.setHidden(true); player.setPaused(false); assert.equal(audio.paused, true);
  player.setHidden(false); await flush();
  assert.equal(audio.currentTime, 37); assert.equal(player.state.status, 'playing');
  player.setMuted(true); player.unlock(); assert.equal(audio.paused, true);
  player.setMuted(false); await flush(); assert.equal(audio.paused, false);
  player.setVolume(0); assert.equal(audio.paused, true);
  player.setHidden(true); player.setVolume(.4); assert.equal(audio.paused, true);
  player.setHidden(false); await flush(); assert.equal(audio.volume, .4);
  player.setVolume(Number.NaN); assert.equal(audio.volume, .4);
  audio.dispatchEvent(new Event('ended')); await flush();
  assert.equal(player.state.index, 1); assert.equal(audio.src, '/two.mp3');
  audio.dispatchEvent(new Event('ended')); await flush(); assert.equal(player.state.index, 0);
  player.dispose(); assert.equal(audio.paused, true); assert.equal(audio.src, '');
  audio.dispatchEvent(new Event('ended')); assert.equal(audio.src, '');
}
// A denied autoplay request is retried only after another interaction.
{
  const { player, audio } = setup();
  audio.reject = new DOMException('Activation required', 'NotAllowedError');
  player.unlock(); await flush(); assert.equal(player.state.status, 'blocked');
  assert.equal(audio.plays, 1); audio.reject = null;
  player.unlock(); await flush(); assert.equal(player.state.status, 'playing');
  player.dispose();
}
// Race pause / rapid skip cannot be undone by an old play promise settling.
{
  const { player, audio } = setup();
  let resolvePlay!: () => void;
  audio.deferred = () => new Promise<void>(resolve => { resolvePlay = resolve; });
  player.unlock(); player.setPaused(true); resolvePlay(); await flush();
  assert.equal(player.state.status, 'paused'); assert.equal(audio.paused, true);
  audio.deferred = null; player.next(); assert.equal(audio.paused, true);
  player.setPaused(false); await flush();
  assert.equal(audio.src, '/two.mp3'); assert.equal(player.state.status, 'playing');
  player.dispose();
}
// A missing asset skips forward; a wholly unavailable playlist stops retrying.
{
  const { player, audio } = setup();
  player.unlock(); await flush();
  audio.dispatchEvent(new Event('error')); await flush();
  assert.equal(player.state.index, 1); assert.equal(audio.src, '/two.mp3');
  audio.dispatchEvent(new Event('error')); await flush();
  assert.equal(player.state.status, 'error'); assert.equal(audio.paused, true);
  const plays = audio.plays; player.unlock(); assert.equal(audio.plays, plays);
  player.retry(); await flush(); assert.equal(player.state.status, 'playing');
  player.dispose();
}
assert.equal(MUSIC_TRACKS.length, 12);
assert.equal(new Set(MUSIC_TRACKS.map(track => track.id)).size, MUSIC_TRACKS.length);
for (const track of MUSIC_TRACKS) {
  assert.ok(existsSync(new URL(`../public${track.src}`, import.meta.url)), `${track.title} missing`);
  assert.ok(track.sourceUrl.startsWith('https://opengameart.org/'));
  assert.ok(track.artist && track.license && track.licenseUrl);
}
console.log('Music checks passed: activation, pause/visibility/mute, volume, playlist, stale promises, errors, cleanup, and 12 credited assets.');
