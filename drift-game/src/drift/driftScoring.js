// Drift scoring. While sliding, a "chain" collects angle x speed x time points.
// Flicking from one direction into the other without straightening up links drifts and
// raises the multiplier. The chain is banked (added to the total) when you straighten
// up or slow down for too long; it is LOST on a wall hit or a spin-out.
// Bonuses: clipping zones/points, proximity to the wall, long drifts and 360s.
import { DRIFT } from '../config.js';

const S = DRIFT.score;
const deg = (r) => (r * 180) / Math.PI;

export const GRADES = ['C', 'B', 'A', 'S'];

export class DriftScoring {
  constructor(emit) { this.emit = emit; this.reset(); }

  reset() {
    this.total = 0;
    this.chain = 0; this.mult = 1; this.active = false;
    this.dir = 0; this.calm = 0; this.slow = 0; this.chainTime = 0; this.longAwarded = 0;
    this.spinAcc = 0; this.overT = 0; this.prox = 0; this.proxPts = 0;
    this.angle = 0;
    this.stats = { best: 0, longest: 0, topAngle: 0, clips: 0, links: 0, wallHits: 0, spins: 0, n360: 0, proximity: 0 };
  }

  get live() { return Math.round(this.chain * this.mult); }

  // beta: drift angle (rad, signed), kmh, dt; prox: metres from a rear corner to the wall (or Infinity)
  tick(dt, beta, kmh, prox) {
    const a = Math.abs(deg(beta));
    this.angle = a;
    const drifting = a >= S.minAngle && kmh >= S.minKmh;
    this.stats.topAngle = Math.max(this.stats.topAngle, drifting ? Math.min(a, 120) : 0);
    // 360: count rotation relative to the direction of travel while the car keeps moving
    if (this.active && kmh > 15) {
      const d = beta - (this.prevBeta ?? beta);
      const wrapped = Math.atan2(Math.sin(d), Math.cos(d));
      this.spinAcc += wrapped;
      if (Math.abs(this.spinAcc) >= Math.PI * 2) {
        this.spinAcc = 0; this.overT = 0; this.stats.n360++;
        this.total += S.spin360; this.mult = Math.min(S.maxMult, this.mult + 1);
        this.emit('360', S.spin360);
      }
    }
    this.prevBeta = beta;
    // spin out: way past sideways for too long without completing a 360, or stopped while backwards
    if (this.active && (a > 105 || (a > 75 && kmh < 18))) {
      this.overT += dt;
      if (this.overT > (kmh < 18 ? 0.5 : 1.3)) { this.lose('spin'); return; }
    } else this.overT = Math.max(0, this.overT - dt);

    if (drifting) {
      const dir = Math.sign(beta);
      if (!this.active) { this.active = true; this.dir = dir; this.chainTime = 0; this.longAwarded = 0; this.spinAcc = 0; this.mult = 1; }
      else if (dir !== this.dir) { // linked into the other direction
        this.dir = dir; this.mult = Math.min(S.maxMult, this.mult + S.linkMult); this.stats.links++;
        this.emit('link', this.mult);
      }
      this.calm = 0; this.slow = 0;
      this.chain += Math.min(a, 75) * kmh * S.rate * dt;
      this.chainTime += dt;
      if (this.chainTime - this.longAwarded >= S.longEvery) {
        this.longAwarded += S.longEvery; this.total += S.long; this.emit('long', S.long);
      }
      // proximity: a rear corner close to the wall while sliding
      if (prox < S.proximity) { this.prox += dt; this.proxPts += S.proximityRate * dt * (1 - prox / S.proximity); }
      else if (this.prox > 0.4) this.payProx();
      else { this.prox = 0; this.proxPts = 0; }
    } else if (this.active) {
      if (kmh < S.minKmh) this.slow += dt; else this.calm += dt;
      if (this.prox > 0.4) this.payProx(); else { this.prox = 0; this.proxPts = 0; }
      if (this.slow > S.slowGrace) this.bank('slow');
      else if (this.calm > S.straightGrace) this.bank('end');
    }
  }

  payProx() {
    const p = Math.round(this.proxPts * this.mult);
    if (p > 0) { this.total += p; this.stats.proximity += p; this.emit('proximity', p); }
    this.prox = 0; this.proxPts = 0;
  }

  bank(reason) {
    const pts = this.live;
    this.total += pts;
    this.stats.best = Math.max(this.stats.best, pts);
    this.stats.longest = Math.max(this.stats.longest, this.chainTime);
    this.emit('bank', pts, reason);
    this.active = false; this.chain = 0; this.mult = 1; this.calm = 0; this.slow = 0; this.spinAcc = 0;
  }

  lose(reason) {
    const lost = this.live;
    if (reason === 'wall') this.stats.wallHits++;
    if (reason === 'spin') this.stats.spins++;
    this.emit('lose', lost, reason);
    this.active = false; this.chain = 0; this.mult = 1; this.calm = 0; this.slow = 0; this.overT = 0; this.spinAcc = 0; this.prox = 0; this.proxPts = 0;
  }

  // wall contact: hard hits end the chain, light brushes only scrape
  wall(speedIn) {
    if (speedIn > S.wallHit) { if (this.active || this.chain > 0) this.lose('wall'); else { this.stats.wallHits++; this.emit('lose', 0, 'wall'); } return true; }
    return false;
  }

  clip(kind) {
    const pts = kind === 'zone' ? S.zone : S.point;
    this.total += pts; this.stats.clips++;
    if (this.active) this.mult = Math.min(S.maxMult, this.mult + 0.25);
    this.emit('clip', pts, kind);
  }

  // end of session: bank whatever is still running
  finish() { if (this.active) this.bank('end'); this.payProx(); return Math.round(this.total); }
}

// grade for a run: score sessions use the track thresholds (scaled to the run length),
// time trial uses the best lap against the track par time
export function gradeFor(track, session, { score, seconds, bestLap }) {
  if (session === 'trial') {
    if (!bestLap) return 'C';
    const r = bestLap / track.par;
    return r <= 1 ? 'S' : r <= 1.1 ? 'A' : r <= 1.25 ? 'B' : 'C';
  }
  const scale = session === 'attack' ? 1 : Math.max(0.2, seconds / 180);
  const g = track.grades;
  return score >= g.S * scale ? 'S' : score >= g.A * scale ? 'A' : score >= g.B * scale ? 'B' : 'C';
}

const KEY = 'driftgame.drift.best';
export function loadBests() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
export function bestKey(track, car, session) { return `${track}.${car}.${session}`; }
export function saveBest(k, rec) {
  const all = loadBests();
  const old = all[k];
  const better = !old || (rec.lap ? (old.lap == null || rec.lap < old.lap) : rec.score > (old.score || 0));
  if (better) { all[k] = { ...old, ...rec, date: Date.now() }; try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage blocked */ } }
  return better;
}
