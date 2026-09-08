import type { PartyState } from './party-types';

type Sample = { at: number; value: number };
type Context = { stage: string; heat: number; paused: boolean; visible: boolean; finished: boolean };
const round = (n: number) => Math.round(n * 10) / 10;
const percentile = (values: number[], p: number) => values.length ? round([...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)]) : null;

/** Local, opt-in measurements. Never stores room codes, credentials or packet bodies. */
export class RaceDiagnostics {
  enabled = false;
  private samples = new Map<string, Sample[]>();
  private context: Context = { stage: 'loading', heat: 0, paused: false, visible: true, finished: false };
  private started = 0;
  private lastFresh = 0;
  private revision = -1;
  private elapsed = -1;
  private route = 'unknown';
  private history: unknown[] = [];
  private lastHistory = 0;

  session() {
    this.revision = -1; this.elapsed = -1; this.lastFresh = 0;
    this.samples.clear(); this.started = this.enabled ? performance.now() : 0; this.route = 'unknown';
    this.history = []; this.lastHistory = 0;
    this.context = { stage: 'loading', heat: 0, paused: false, visible: true, finished: false };
  }

  phase(stage: string, heat: number, paused: boolean, visible: boolean, finished = false, now = performance.now()) {
    if (!this.enabled) return;
    const next = { stage, heat, paused, visible, finished };
    if (JSON.stringify(next) !== JSON.stringify(this.context)) {
      if (this.started) this.remember(now);
      this.samples.clear(); this.started = now; this.lastFresh = 0;
      this.context = next;
    }
  }

  mark(name: string, value = 0, now = performance.now()) {
    if (!this.enabled || !Number.isFinite(value) || !Number.isFinite(now)) return;
    if (!this.started) this.started = now;
    const values = this.samples.get(name) ?? [];
    values.push({ at: now, value });
    if (values.length > 1200) values.splice(0, 600);
    this.samples.set(name, values);
  }

  receive(state: PartyState, direct: boolean, now = performance.now()) {
    if (!this.enabled) return;
    const revision = state.revision ?? this.revision + 1;
    this.mark(direct ? 'receivedDirect' : 'receivedRelay', 0, now);
    if (revision <= this.revision) { this.mark(revision === this.revision ? 'duplicate' : 'older', 0, now); return; }
    this.revision = revision;
    this.route = direct ? 'direct' : 'relay';
    this.mark('fresh', 0, now);
    if (state.elapsed > this.elapsed && state.stage === 'racing') {
      this.mark('advancing', state.elapsed, now);
      if (this.lastFresh) this.mark('freshGap', now - this.lastFresh, now);
      this.lastFresh = now;
    }
    this.elapsed = state.elapsed;
  }

  snapshot(now = performance.now()) {
    const duration = Math.max(.001, Math.min(5, (now - this.started) / 1000));
    const metrics: Record<string, { hz: number; p50: number | null; p95: number | null; max: number | null; count: number }> = {};
    for (const [name, samples] of this.samples) {
      const recent = samples.filter(item => item.at >= now - 5000);
      const values = recent.map(item => item.value);
      metrics[name] = { hz: round(recent.length / duration), p50: percentile(values, .5), p95: percentile(values, .95), max: values.length ? round(Math.max(...values)) : null, count: values.length };
    }
    const advancing = (this.samples.get('simulation') ?? this.samples.get('advancing') ?? []).filter(item => item.at >= now - 5000);
    const first = advancing[0], last = advancing.at(-1);
    const simulationRate = first && last && last.at > first.at ? round((last.value - first.value) / ((last.at - first.at) / 1000)) : null;
    return { atMs: round(now), ...this.context, route: this.route, simulationRate, lastFreshAgeMs: this.lastFresh ? round(now - this.lastFresh) : null, metrics };
  }

  remember(now = performance.now()) {
    if (!this.enabled || now - this.lastHistory < 900) return;
    this.history.push(this.snapshot(now)); this.lastHistory = now;
    if (this.history.length > 180) this.history.shift();
  }

  report() {
    return { version: 1, note: 'Frame cadence and CPU submission timings; not GPU-completion timings. Local clocks are not synchronized.', current: this.snapshot(), history: [...this.history] };
  }
}

export const raceDiagnostics = new RaceDiagnostics();
