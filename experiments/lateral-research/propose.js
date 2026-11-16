// `lateral propose`: the model proposes search methods as code, lateral measures all of
// them and records which one each selector would have picked.
//
// Selectors, compared on the same proposals:
//   far       the proposal whose idea text is farthest (max-min cosine) from every idea
//             already measured: lateral's orthogonal/opposite selection, at the idea level
//   evaluator the proposal the trained evaluator predicts to score best
// Because every proposal is measured, the measurements say afterwards whether either
// selector beats picking at random.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embed } from '../math/embed.js';
import { maxMinSelect } from '../math/ortho.js';
import { claudeBin, parseClaudeEnvelope } from '../agents/claude_cli.js';
import { loadMeasurements, recordMeasurement, trainEvaluator, outcome } from './evaluator.js';

const here = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

const LAYOUT = {
  ratio2: 'n*2 coordinates of points in the plane, any scale; score = -(max distance / min distance)^2',
  ratio3: 'n*3 coordinates of points in space, any scale; score = -(max distance / min distance)^2',
  'heilbronn-triangle': 'n*2 coordinates of points in the triangle (0,0),(1,0),(0,1); score = smallest triangle area / 0.5',
  'heilbronn-convex': 'n*2 coordinates of points; score = smallest triangle area / area of the convex hull',
  circles: 'n*3 values (x, y, r) of circles in the unit square; score = sum of radii after overlaps are repaired',
  'circles-rect': 'n*3 values (x, y, r) of circles, then one last value w; the circles must lie in the rectangle [0,w] x [0,2-w] (perimeter 4, shape free); score = sum of radii after overlaps are repaired'
};

const BASELINE = {
  idea: 'independent random restarts, each polished once',
  code: 'def search(problem, rng, polish):\n    while True:\n        polish(problem.random(rng))\n'
};

function ask({ problem, n, budget, history, count }) {
  const tried = history.length
    ? history.map((h) => `- reached ${outcome(h).toFixed(1)} digits: ${h.idea}`).join('\n')
    : '- nothing yet';
  const user = `Problem "${problem}" with n=${n}. A configuration is a flat vector: ${LAYOUT[problem]}.
Higher score is better. The best known value has not been reached.

Write ${count} different search methods. Each is a Python function

def search(problem, rng, polish):
    ...

- problem.n, problem.dim (vector length), problem.random(rng) -> a random start vector
- polish(x) -> (score, x_polished): local optimisation (SLSQP) from x; at most ${budget} calls,
  after which it raises and the run ends (let the exception propagate)
- rng is a numpy Generator; numpy is available as np; no other imports, no file or network access
- only values returned by polish count

Methods already measured on this problem (9.0 digits = best known value reached):
${tried}

Propose methods that differ from each other and from the ones above in their core idea, not
in parameters. Reply with exactly ${count} blocks and nothing else, each of the form

IDEA: <one sentence>
\`\`\`python
<source>
\`\`\``;
  const out = execFileSync(claudeBin(), [
    '-p', user, '--model', process.env.LATERAL_CLAUDE_MODEL ?? 'claude-sonnet-5-5', '--output-format', 'json',
    '--system-prompt', 'You design numerical search heuristics. Follow the reply format exactly.',
    '--permission-mode', 'plan', '--strict-mcp-config',
    '--disallowed-tools', 'Write,Edit,NotebookEdit,Bash,KillShell,WebFetch'
  ], { timeout: 600000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const blocks = parseClaudeEnvelope(out).text.matchAll(/IDEA:\s*(.+?)\s*\n```(?:python)?\n([\s\S]*?)```/g);
  return [...blocks].map(([, idea, code]) => ({ idea, code })).filter((p) => p.code.includes('def search'));
}

async function measure({ problem, n, budget, code, file }) {
  writeFileSync(file, code);
  const { stdout } = await run('python3', [join(here, 'run_method.py'), problem, String(n), String(budget), file], {
    env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' }, maxBuffer: 16 * 1024 * 1024
  });
  return JSON.parse(stdout.trim().split('\n').pop());
}

/** CLI: lateral propose --data FILE --problem P --n N --best V [--rounds R] [--count K] [--budget B] [--work DIR] */
export async function runProposeCli(flags) {
  const { data, problem } = flags;
  const n = Number(flags.n);
  const best = Number(flags.best);
  if (!data || !LAYOUT[problem] || !n || !best) throw new Error('propose needs --data, --problem, --n and --best');
  const budget = Number(flags.budget ?? 300);
  const count = Number(flags.count ?? 4);
  const work = flags.work ?? join(dirname(data), 'proposals');
  mkdirSync(work, { recursive: true });
  const minimize = problem.startsWith('ratio');
  const context = `${problem} n=${n}: ${LAYOUT[problem]}`;
  const same = () => (existsSync(data) ? loadMeasurements(data) : []).filter((m) => m.context === context);
  // A method that fails or finds nothing is recorded far from the best value, not dropped.
  const worst = minimize ? best * 2 : best / 2;

  const record = async (proposal, tag, picks) => {
    const file = join(work, `${problem}-${n}-${tag}.py`);
    const res = await measure({ problem, n, budget, code: proposal.code, file });
    const row = {
      idea: proposal.idea, context, found: res.found ?? worst, best, minimize,
      budget, picks, error: res.error ?? undefined, code: file
    };
    recordMeasurement(data, row);
    console.log(`${outcome(row).toFixed(2)} digits  found ${row.found}  [${picks.join(',') || '-'}]  ${proposal.idea.slice(0, 90)}`);
    if (res.x && (minimize ? res.found < best : res.found > best)) {
      writeFileSync(join(work, `${problem}-${n}-${tag}.best.json`), JSON.stringify({ problem, n, found: res.found, x: res.x }));
      console.log(`  >>> better than the best known value ${best}: ${res.found}`);
    }
  };

  if (!same().some((m) => m.idea === BASELINE.idea && m.budget === budget)) await record(BASELINE, 'baseline', ['baseline']);

  for (let round = 1; round <= Number(flags.rounds ?? 3); round++) {
    const history = same();
    let proposals;
    try {
      proposals = ask({ problem, n, budget, history, count });
    } catch (err) {
      console.log(`round ${round}: no proposals (${String(err.message).split('\n')[0].slice(0, 120)})`);
      continue;
    }
    if (proposals.length < 2) continue;
    const all = existsSync(data) ? loadMeasurements(data) : [];
    const tried = [...new Set(all.map((m) => m.idea))].map((t) => embed(t));
    const far = maxMinSelect(proposals.map((p) => embed(p.idea)), tried, 1)[0];
    const predict = trainEvaluator(all);
    const predicted = proposals.map((p) => predict({ idea: p.idea, context }));
    const top = predicted.indexOf(Math.max(...predicted));
    await Promise.all(proposals.map((p, i) => record(
      p, `r${round}-${Date.now().toString(36)}-${i}`, [i === far && 'far', i === top && 'evaluator'].filter(Boolean)
    )));
  }
}
