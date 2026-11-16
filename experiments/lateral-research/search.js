// `lateral research`: measured search over real-vector problems.
//
// The decision loop picks lenses that are far (max-min cosine) from every lens already
// tried. This applies the same selection to escape directions in solution space: from the
// best local optimum, the next kick is the candidate farthest from all directions that
// already failed, and the exact opposite of a failed direction is always a candidate.
// Every candidate is polished and scored by an external problem worker, so a direction
// only counts when a measurement says so.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { maxMinSelect } from '../math/ortho.js';
import { l2normalize } from '../math/embed.js';
import { mulberry32 } from '../math/rng.js';

const WORKER = process.env.LATERAL_RESEARCH_WORKER ??
  join(dirname(fileURLToPath(import.meta.url)), 'problems.py');

/** One python worker process answering one request at a time. */
function startWorker(problem, n) {
  const child = spawn('python3', [WORKER], {
    stdio: ['pipe', 'pipe', 'inherit'],
    // One BLAS thread per worker: the workers already fill the cores.
    env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' }
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const call = async (req) => {
    child.stdin.write(JSON.stringify(req) + '\n');
    const { value, done } = await lines.next();
    if (done) throw new Error('research worker exited');
    return JSON.parse(value);
  };
  return { call, ready: call({ op: 'init', problem, n }), stop: () => child.kill() };
}

function gaussian(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Unit kick touching `groups` random coordinate groups (points), or all when dense. */
function randomKick(rng, dim, groupSize) {
  const v = new Float64Array(dim);
  const groups = dim / groupSize;
  const dense = rng() < 0.3;
  const count = dense ? groups : 1 + Math.floor(rng() * Math.min(4, groups));
  for (let c = 0; c < count; c++) {
    const g = dense ? c : Math.floor(rng() * groups);
    for (let k = 0; k < groupSize; k++) v[g * groupSize + k] = gaussian(rng);
  }
  return l2normalize(v);
}

/**
 * strategy "random": plain basin hopping, each kick drawn independently.
 * strategy "lateral": the kick is the farthest of a candidate pool from the last `window`
 * failed directions; the pool holds fresh random kicks plus the negations of the
 * directions in which worse optima were found.
 */
export async function research({
  problem, n, groupSize, strategy = 'lateral', budget = 400, workers = 4, seed = 1,
  window = 48, pool = 24, archive = 12, scale, restartEvery = 0, start = null, onBest = () => {}
}) {
  const rng = mulberry32(seed);
  const procs = Array.from({ length: workers }, () => startWorker(problem, n));
  const { dim } = await procs[0].ready;
  await Promise.all(procs.map((p) => p.ready));
  const step = scale ?? 1 / Math.sqrt(dim / groupSize);

  let best = { score: -Infinity, x: null };
  let elites = []; // distinct local optima, best first; parents for the next kick
  let failed = new Map(); // parent -> unit directions that led nowhere better
  let recentParents = []; // descriptors of the parents kicked most recently
  let used = 0;
  let sinceImprove = 0;
  const trace = [];

  // Permutation-invariant fingerprint of a configuration: each coordinate sorted across points.
  function descriptor(x) {
    const parts = [];
    for (let k = 0; k < groupSize; k++) {
      const col = [];
      for (let i = k; i < dim; i += groupSize) col.push(x[i]);
      const mean = col.reduce((a, b) => a + b) / col.length;
      parts.push(...col.map((v) => v - mean).sort((a, b) => a - b));
    }
    return l2normalize(Float64Array.from(parts));
  }

  function remember(res) {
    if (elites.some((e) => Math.abs(e.score - res.score) < 1e-9)) return;
    elites.push({ ...res, desc: descriptor(res.x) });
    elites.sort((a, b) => b.score - a.score);
    elites = elites.slice(0, archive);
  }

  function nextStart() {
    if (!best.x || (restartEvery && sinceImprove >= restartEvery)) return null;
    let parent = elites[0];
    let dir;
    if (strategy === 'lateral') {
      // Parent: the elite least like the ones kicked recently. Direction: the candidate
      // farthest from everything that already failed from that parent.
      if (rng() < 0.5 && recentParents.length) {
        parent = elites[maxMinSelect(elites.map((e) => e.desc), recentParents.slice(-archive), 1)[0]];
      }
      const tried = (failed.get(parent) ?? []).slice(-window);
      const candidates = Array.from({ length: pool }, () => randomKick(rng, dim, groupSize));
      for (const f of tried.slice(-8)) candidates.push(f.map((v) => -v));
      dir = tried.length ? candidates[maxMinSelect(candidates, tried, 1)[0]] : candidates[0];
    } else {
      if (rng() < 0.5) parent = elites[Math.floor(rng() * elites.length)];
      dir = randomKick(rng, dim, groupSize);
    }
    recentParents.push(parent.desc);
    const alpha = step * 10 ** (-2 * rng());
    return { parent, dir, x: Array.from(parent.x, (v, i) => v + alpha * dir[i]) };
  }

  async function loop(proc, id) {
    if (start && id === 0) {
      best = await proc.call({ op: 'polish', x: start });
      remember(best);
      onBest(best, used);
    }
    while (used < budget) {
      used++;
      const from = nextStart();
      if (!from) {
        sinceImprove = 0;
        elites = [];
        failed = new Map();
        recentParents = [];
      }
      const x = from ? from.x : (await proc.call({ op: 'random', seed: seed * 100003 + used })).x;
      const res = await proc.call({ op: 'polish', x });
      const parentScore = from ? from.parent.score : -Infinity;
      remember(res);
      if (res.score > best.score) {
        best = res;
        onBest(best, used);
      }
      if (res.score > (elites[0] === undefined ? -Infinity : parentScore) + 1e-12 && res.score >= elites[0].score) {
        sinceImprove = 0;
      } else {
        sinceImprove++;
      }
      if (from && res.score <= parentScore + 1e-12) {
        const list = failed.get(from.parent) ?? [];
        list.push(from.dir);
        // Where the worse optimum lies is a failed direction too; its opposite is untried.
        const d = Float64Array.from(res.x, (v, i) => v - from.parent.x[i]);
        if (d.some((v) => Math.abs(v) > 1e-9)) list.push(l2normalize(d));
        failed.set(from.parent, list);
      }
      trace.push(best.score);
    }
  }

  try {
    await Promise.all(procs.map(loop));
  } finally {
    for (const p of procs) p.stop();
  }
  return { best, trace };
}

const GROUP = { circles: 3, ratio2: 2, ratio3: 3 };

/** CLI: lateral research --problem P --n N [--strategy S] [--budget B] [--seed K] [--out FILE] */
export async function runResearchCli(flags) {
  const problem = flags.problem;
  const n = Number(flags.n);
  if (!problem || !n) throw new Error('research needs --problem and --n');
  const out = flags.out;
  const start = out && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')).x : null;
  const result = await research({
    problem, n, groupSize: GROUP[problem] ?? 2,
    strategy: flags.strategy ?? 'lateral',
    budget: Number(flags.budget ?? 400),
    seed: Number(flags.seed ?? 1),
    workers: Number(flags.workers ?? 4),
    restartEvery: Number(flags.restart ?? 0),
    start,
    onBest: (best, used) => {
      console.error(`[research] ${problem} n=${n} polish ${used}: ${best.score}`);
      if (out) {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, JSON.stringify({ problem, n, score: best.score, x: best.x }) + '\n');
      }
    }
  });
  console.log(JSON.stringify({ problem, n, score: result.best.score }));
  return result;
}
