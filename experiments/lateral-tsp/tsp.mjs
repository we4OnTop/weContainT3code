// Euclidean TSP: neighbour-list Or-2opt with local double-bridge kicks,
// benchmarked against full 2-opt (quality + time scaling) and Held-Karp (optimality).
// Run: node experiments/lateral-tsp/tsp.mjs [--quick]

const lcg = (s) => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;

export function instance(n, seed) {
  const r = lcg(seed);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) ((x[i] = r()), (y[i] = r()));
  return { n, x, y };
}

const dist = (P, i, j) => Math.hypot(P.x[i] - P.x[j], P.y[i] - P.y[j]);

export function tourLength(P, t) {
  let s = 0;
  for (let i = 0; i < P.n; i++) s += dist(P, t[i], t[(i + 1) % P.n]);
  return s;
}

function assertTour(P, t) {
  if (t.length !== P.n || new Set(t).size !== P.n) throw new Error("not a Hamiltonian cycle");
}

/** Exact optimum, O(n^2 2^n). Only for n <= ~15. */
export function heldKarp(P) {
  const n = P.n;
  const m = n - 1; // city n-1 is the fixed start
  const dp = new Float64Array((1 << m) * m).fill(Infinity);
  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = dist(P, m, j);
  for (let S = 1; S < 1 << m; S++)
    for (let j = 0; j < m; j++) {
      const cur = dp[S * m + j];
      if (!(S & (1 << j)) || cur === Infinity) continue;
      for (let k = 0; k < m; k++) {
        if (S & (1 << k)) continue;
        const idx = (S | (1 << k)) * m + k;
        const v = cur + dist(P, j, k);
        if (v < dp[idx]) dp[idx] = v;
      }
    }
  let best = Infinity;
  for (let j = 0; j < m; j++) best = Math.min(best, dp[((1 << m) - 1) * m + j] + dist(P, j, m));
  return best;
}

/** Baseline: nearest-neighbour start + full 2-opt to a local optimum. O(n^2) per pass. */
export function baseline(P) {
  const n = P.n;
  const t = new Int32Array(n);
  const used = new Uint8Array(n);
  used[0] = 1;
  for (let i = 1; i < n; i++) {
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const d = dist(P, t[i - 1], j);
      if (d < bd) ((bd = d), (best = j));
    }
    t[i] = best;
    used[best] = 1;
  }
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < n - 2; i++)
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const a = t[i];
        const b = t[i + 1];
        const c = t[j];
        const d = t[(j + 1) % n];
        if (dist(P, a, c) + dist(P, b, d) - dist(P, a, b) - dist(P, c, d) < -1e-10) {
          for (let lo = i + 1, hi = j; lo < hi; lo++, hi--) [t[lo], t[hi]] = [t[hi], t[lo]];
          improved = true;
        }
      }
  }
  return t;
}

/** K approximate nearest neighbours per city via a uniform grid, sorted by distance. */
function neighbours(P, K) {
  const n = P.n;
  const G = Math.max(1, Math.floor(Math.sqrt(n / 2)));
  const cell = (v) => Math.min(G - 1, Math.floor(v * G));
  const buckets = Array.from({ length: G * G }, () => []);
  for (let i = 0; i < n; i++) buckets[cell(P.x[i]) * G + cell(P.y[i])].push(i);
  const out = new Int32Array(n * K);
  for (let i = 0; i < n; i++) {
    const cx = cell(P.x[i]);
    const cy = cell(P.y[i]);
    let found = [];
    for (let r = 1; ; r++) {
      found = [];
      for (let gx = Math.max(0, cx - r); gx <= Math.min(G - 1, cx + r); gx++)
        for (let gy = Math.max(0, cy - r); gy <= Math.min(G - 1, cy + r); gy++)
          for (const j of buckets[gx * G + gy]) if (j !== i) found.push(j);
      if (found.length >= K || r >= G) break;
    }
    found.sort((a, b) => dist(P, i, a) - dist(P, i, b));
    for (let k = 0; k < K; k++) out[i * K + k] = found[k];
  }
  return out;
}

/**
 * Candidate: strip start, then 2-opt + Or-opt restricted to K nearest neighbours with a
 * work queue, then `kicksPerCity * n` local double-bridge kicks, each repaired by the same
 * local search and undone if the tour got longer.
 */
export function candidate(P, { orOpt = true, kicksPerCity = 0, seed = 1 } = {}) {
  const n = P.n;
  const K = Math.min(8, n - 1);
  const nb = neighbours(P, K);

  // Boustrophedon strips: O(n log n) start, roughly 25% above optimal before local search.
  const strips = Math.max(1, Math.round(Math.sqrt(n / 3)));
  const strip = (i) => Math.min(strips - 1, Math.floor(P.x[i] * strips));
  const t = Int32Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const sa = strip(a);
    return sa - strip(b) || (sa % 2 ? P.y[b] - P.y[a] : P.y[a] - P.y[b]);
  });
  const pos = new Int32Array(n);
  for (let i = 0; i < n; i++) pos[t[i]] = i;

  const next = (c) => t[pos[c] + 1 === n ? 0 : pos[c] + 1];
  const prev = (c) => t[pos[c] === 0 ? n - 1 : pos[c] - 1];

  // Reverses positions i..j (cyclic), flipping whichever side is shorter.
  function reverse(i, j) {
    let len = j - i;
    if (len < 0) len += n;
    len++;
    if (2 * len > n) {
      const oi = i;
      i = j + 1 === n ? 0 : j + 1;
      j = oi === 0 ? n - 1 : oi - 1;
      len = n - len;
    }
    for (let s = len >> 1; s > 0; s--) {
      const a = t[i];
      const b = t[j];
      t[i] = b;
      pos[b] = i;
      t[j] = a;
      pos[a] = j;
      if (++i === n) i = 0;
      if (--j < 0) j = n - 1;
    }
  }

  let length = tourLength(P, t);
  let log = null; // when set, records moves so a kick can be undone

  // 2-opt move: drop edges {a,b} and {c,d}, add {a,c} and {b,d}. b follows a and d follows
  // c in the same direction of travel.
  function move(a, b, c, d) {
    length += dist(P, a, c) + dist(P, b, d) - dist(P, a, b) - dist(P, c, d);
    if (next(a) === b) reverse(pos[b], pos[c]);
    else reverse(pos[a], pos[d]);
    if (log) log.push(a, b, c, d);
  }

  // Moves the path s1..s2 (p before it, nx after it) between x and y, where x->y lies
  // further along the same direction. Ends as x-s1..s2-y if `forward`, else x-s2..s1-y.
  function insertSegment(p, s1, s2, nx, x, y, forward) {
    move(p, s1, x, y);
    if (x !== nx) move(p, x, nx, s2);
    if (forward && s1 !== s2) move(x, s2, s1, y);
  }

  const queue = new Int32Array(n);
  const queued = new Uint8Array(n);
  let head = 0;
  let size = 0;
  function wake(c) {
    if (queued[c]) return;
    queued[c] = 1;
    queue[(head + size++) % n] = c;
  }

  function improve(a) {
    for (let dir = 0; dir < 2; dir++) {
      const fwd = dir ? prev : next;
      const back = dir ? next : prev;
      const b = fwd(a);
      const dab = dist(P, a, b);
      for (let k = 0; k < K; k++) {
        const c = nb[a * K + k];
        const g = dab - dist(P, a, c);
        if (g <= 0) break;
        const d = fwd(c);
        if (d === a) continue;
        if (g + dist(P, c, d) - dist(P, b, d) > 1e-10) {
          move(a, b, c, d);
          wake(a), wake(b), wake(c), wake(d);
          return true;
        }
      }
      if (!orOpt) continue;
      // Or-opt: relocate the 1..3 city path starting at a.
      const p = back(a);
      let s2 = a;
      for (let L = 1; L <= 3 && L < n - 3; L++, s2 = fwd(s2)) {
        const mid = L === 3 ? back(s2) : a;
        const nx = fwd(s2);
        const removed = dist(P, p, a) + dist(P, s2, nx) - dist(P, p, nx);
        for (let k = 0; k < K; k++) {
          const c = nb[a * K + k];
          const dac = dist(P, a, c);
          if (dac >= removed) break;
          if (c === s2 || c === mid) continue;
          for (let side = 0; side < 2; side++) {
            const y = side ? back(c) : fwd(c);
            // y inside the path means {c,y} is an edge being removed; c === nx with side 1
            // would need the wrap-around case, which the mirrored scan from s2 covers.
            if (y === a || y === s2 || y === mid || (side === 0 && c === p)) continue;
            if (removed - dac - dist(P, s2, y) + dist(P, c, y) > 1e-10) {
              if (side) insertSegment(p, a, s2, nx, y, c, false);
              else insertSegment(p, a, s2, nx, c, y, true);
              wake(p), wake(a), wake(s2), wake(nx), wake(c), wake(y);
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  function localSearch() {
    while (size) {
      const a = queue[head];
      head = (head + 1) % n;
      size--;
      queued[a] = 0;
      while (improve(a));
    }
  }

  for (let i = 0; i < n; i++) wake(t[i]);
  localSearch();

  const maxSeg = Math.min(50, Math.floor((n - 3) / 2));
  if (maxSeg >= 1) {
    const rand = lcg(seed);
    log = [];
    for (let kick = Math.round(kicksPerCity * n); kick > 0; kick--) {
      const before = length;
      log.length = 0;
      // Swap two adjacent short paths: a double bridge whose three cuts sit close together.
      const p = t[Math.floor(rand() * n)];
      const s1 = next(p);
      let s2 = s1;
      for (let i = Math.floor(rand() * maxSeg); i > 0; i--) s2 = next(s2);
      const nx = next(s2);
      let x = nx;
      for (let i = Math.floor(rand() * maxSeg); i > 0; i--) x = next(x);
      const y = next(x);
      insertSegment(p, s1, s2, nx, x, y, true);
      wake(p), wake(s1), wake(s2), wake(nx), wake(x), wake(y);
      localSearch();
      if (length > before - 1e-10) {
        const undo = log;
        log = null;
        for (let i = undo.length - 4; i >= 0; i -= 4) move(undo[i], undo[i + 2], undo[i + 1], undo[i + 3]);
        log = undo;
      }
    }
  }
  return t;
}

// ---- benchmark -------------------------------------------------------------------------

function timed(P, solve) {
  const start = performance.now();
  const t = solve(P);
  const ms = performance.now() - start;
  assertTour(P, t);
  return { ms, len: tourLength(P, t) };
}

/** Least-squares slope of log(time) against log(n): the empirical scaling exponent. */
function exponent(rows) {
  const xs = rows.map((r) => Math.log(r.n));
  const ys = rows.map((r) => Math.log(r.ms));
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const quick = process.argv.includes("--quick");
  const variants = {
    "v1 nbr 2-opt": (P) => candidate(P, { orOpt: false }),
    "v2 + Or-opt": (P) => candidate(P),
    "v3 + kicks x5": (P) => candidate(P, { kicksPerCity: 5 }),
  };

  let worstGap = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const P = instance(12, seed);
    const gap = timed(P, variants["v3 + kicks x5"]).len / heldKarp(P) - 1;
    worstGap = Math.max(worstGap, gap);
  }
  console.log(`Held-Karp check, 20 instances n=12: worst gap ${(worstGap * 100).toFixed(3)}%`);
  if (worstGap > 0.01) throw new Error("candidate is more than 1% above optimal on n=12");

  const baseSizes = quick ? [500, 1000, 2000] : [1000, 2000, 4000, 8000];
  const candSizes = quick ? [500, 1000, 2000, 4000] : [1000, 2000, 4000, 8000, 16000, 32000];
  const base = baseSizes.map((n) => ({ n, ...timed(instance(n, n), baseline) }));
  console.log(`\nbaseline full 2-opt   exponent ${exponent(base).toFixed(2)}`);
  for (const r of base) console.log(`  n=${r.n}  len=${r.len.toFixed(3)}  ${r.ms.toFixed(0)} ms`);

  for (const [name, solve] of Object.entries(variants)) {
    const rows = candSizes.map((n) => ({ n, ...timed(instance(n, n), solve) }));
    console.log(`\n${name}   exponent ${exponent(rows).toFixed(2)}`);
    for (const r of rows) {
      const b = base.find((x) => x.n === r.n);
      const vs = b ? `  ${((r.len / b.len - 1) * 100).toFixed(2)}% vs baseline, ${(b.ms / r.ms).toFixed(1)}x faster` : "";
      // 0.7124*sqrt(n) is the known asymptotic optimal length for uniform points in the unit square.
      const opt = ((r.len / (0.7124 * Math.sqrt(r.n)) - 1) * 100).toFixed(1);
      console.log(`  n=${r.n}  len=${r.len.toFixed(3)}  ${r.ms.toFixed(0)} ms  ~${opt}% above est. optimum${vs}`);
    }
  }
}
