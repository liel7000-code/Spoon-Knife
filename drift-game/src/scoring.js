// Traffic-weaving score: points flow while you are fast, scaled by a multiplier
// that grows with risky moves (near misses, very close passes, lane splits,
// high-speed overtakes) and bleeds away when you play it safe or slow down.
import { CONFIG } from './config.js';

export const EVENTS = {
  near: { label: 'כמעט', pts: 150, mult: 0.25 },
  close: { label: 'על הקצה', pts: 400, mult: 0.6 },
  split: { label: 'פיצול נתיב', pts: 1200, mult: 1.2 },
  overtake: { label: 'עקיפה', pts: 20, mult: 0.03, quiet: true },
};

export class Scoring {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this.total = 0;
    this.mult = 1;
    this.idle = 0;      // seconds since the last multiplier-building move
    this.slowT = 0;     // seconds spent under the minimum speed
    this.topMult = 1;
    this.topSpeed = 0;
    this.counts = { near: 0, close: 0, split: 0, overtake: 0 };
  }

  get fast() { return this.lastKmh >= CONFIG.score.minSpeed; }
  // 0..1: how long until the multiplier starts to decay
  get hold() { return Math.max(0, 1 - this.idle / CONFIG.score.decayDelay); }

  tick(dt, kmh) {
    const S = CONFIG.score;
    this.lastKmh = kmh;
    this.topSpeed = Math.max(this.topSpeed, kmh);
    if (kmh >= S.minSpeed) {
      this.total += dt * (kmh - S.minSpeed + 30) * S.speedRate * this.mult;
      this.slowT = 0;
    } else {
      this.slowT += dt;
      if (this.slowT > S.slowReset && this.mult > 1) { this.mult = 1; this.onEvent('slow', 0); }
    }
    this.idle += dt;
    if (this.idle > S.decayDelay) this.mult = Math.max(1, this.mult - S.decayRate * dt);
  }

  event(kind) {
    const e = EVENTS[kind];
    const pts = Math.round(e.pts * this.mult);
    this.total += pts;
    this.mult = Math.min(CONFIG.score.maxMult, this.mult + e.mult);
    this.topMult = Math.max(this.topMult, this.mult);
    this.idle = 0;
    this.counts[kind]++;
    this.onEvent(kind, pts);
  }
}

/* ------------------------------------------------------- local leaderboard */
const KEY = 'driftgame.board';
export function loadBoard() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
// returns the 1-based rank of the new run, or 0 if it did not make the top 10
export function submitRun(run) {
  const board = loadBoard();
  board.push(run);
  board.sort((a, b) => b.score - a.score);
  const top = board.slice(0, 10);
  try { localStorage.setItem(KEY, JSON.stringify(top)); } catch (e) { /* storage blocked */ }
  const i = top.indexOf(run);
  return i >= 0 ? i + 1 : 0;
}
