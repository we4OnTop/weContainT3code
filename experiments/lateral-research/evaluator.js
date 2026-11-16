// `lateral evaluator`: a model that predicts how well an idea will measure, trained on
// ideas that were actually measured.
//
// Each measurement is one JSON line: { idea, context, found, best, minimize }. The target
// is the number of digits by which `found` agrees with the best known value (9 = reached).
// The model is kernel ridge regression whose kernel is the dot product of lateral's own
// text embeddings (hashed words, word pairs and character 4-grams), so two ideas are
// similar when their wording is.

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { embed, dot } from '../math/embed.js';

const REACHED = 9;

/** Digits of agreement with the best known value, capped at REACHED. */
export function outcome({ found, best, minimize }) {
  const gap = minimize ? found / best - 1 : 1 - found / best;
  return Math.min(REACHED, -Math.log10(Math.max(gap, 10 ** -REACHED)));
}

export function loadMeasurements(file) {
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

export function recordMeasurement(file, row) {
  for (const key of ['idea', 'context', 'found', 'best']) {
    if (row[key] === undefined || row[key] === '') throw new Error(`measurement needs ${key}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(row) + '\n');
}

// The idea counts twice: the context alone says how hard the instance is, the idea is what
// the evaluator is asked about.
const features = (row) => embed(`${row.idea} ${row.idea} ${row.context}`);

/** Solves (K + lambda I) a = y by Gaussian elimination with partial pivoting. */
function solve(K, y, lambda) {
  const n = y.length;
  const A = K.map((row, i) => [...row.map((v, j) => v + (i === j ? lambda : 0)), y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const a = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r][n];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * a[k];
    a[r] = s / A[r][r];
  }
  return a;
}

export function trainEvaluator(rows, { lambda = 0.3 } = {}) {
  if (rows.length === 0) throw new Error('no measurements to train on');
  const X = rows.map(features);
  const y = rows.map(outcome);
  const mean = y.reduce((a, b) => a + b) / y.length;
  const alpha = solve(X.map((a) => X.map((b) => dot(a, b))), y.map((v) => v - mean), lambda);
  return (row) => {
    const f = features(row);
    return mean + X.reduce((s, x, i) => s + alpha[i] * dot(x, f), 0);
  };
}

function spearman(a, b) {
  const rank = (v) => {
    const order = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j < order.length && order[j][0] === order[i][0]) j++;
      for (let k = i; k < j; k++) r[order[k][1]] = (i + j - 1) / 2;
      i = j;
    }
    return r;
  };
  const [ra, rb] = [rank(a), rank(b)];
  const m = (ra.length - 1) / 2;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - m) * (rb[i] - m);
    da += (ra[i] - m) ** 2;
    db += (rb[i] - m) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * Held-out check. `groupBy` names the field whose value is withheld together: "row" asks
 * whether the model interpolates, "idea" whether it can judge an idea it never saw
 * measured, "context" whether it can judge a known idea on a new instance.
 */
export function validate(rows, groupBy) {
  const key = (r, i) => (groupBy === 'row' ? i : r[groupBy]);
  const groups = [...new Set(rows.map(key))];
  const predicted = new Array(rows.length);
  const baseline = new Array(rows.length);
  for (const g of groups) {
    const train = rows.filter((r, i) => key(r, i) !== g);
    if (train.length === 0) return null;
    const predict = trainEvaluator(train);
    const mean = train.map(outcome).reduce((a, b) => a + b) / train.length;
    rows.forEach((r, i) => {
      if (key(r, i) === g) {
        predicted[i] = predict(r);
        baseline[i] = mean;
      }
    });
  }
  const y = rows.map(outcome);
  const mae = (p) => p.reduce((s, v, i) => s + Math.abs(v - y[i]), 0) / y.length;
  return { groups: groups.length, spearman: spearman(predicted, y), mae: mae(predicted), baselineMae: mae(baseline) };
}

/** CLI: lateral evaluator --data FILE [--rank IDEA ... --context TEXT] | --add ... */
export function runEvaluatorCli(flags, ideas) {
  const file = flags.data;
  if (!file) throw new Error('evaluator needs --data FILE');
  if (flags.add) {
    recordMeasurement(file, {
      idea: flags.add, context: flags.context, found: Number(flags.found), best: Number(flags.best),
      minimize: flags.minimize !== undefined
    });
    return;
  }
  const rows = loadMeasurements(file);
  if (ideas.length) {
    const predict = trainEvaluator(rows);
    const ranked = ideas.map((idea) => ({ idea, digits: predict({ idea, context: flags.context ?? '' }) }));
    ranked.sort((a, b) => b.digits - a.digits);
    for (const r of ranked) console.log(`${r.digits.toFixed(2)}  ${r.idea}`);
    return;
  }
  console.log(`${rows.length} measurements, ${new Set(rows.map((r) => r.idea)).size} ideas`);
  for (const groupBy of ['row', 'context', 'idea']) {
    const v = validate(rows, groupBy);
    if (!v) continue;
    console.log(
      `held-out ${groupBy.padEnd(7)} (${v.groups} folds): rank correlation ${v.spearman.toFixed(2)}, ` +
      `mean error ${v.mae.toFixed(2)} digits (always-predict-the-mean: ${v.baselineMae.toFixed(2)})`
    );
  }
}
