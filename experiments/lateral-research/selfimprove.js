// `lateral selfimprove`: lateral's propose loop applied to its own proposer.
//
// The object being improved is the policy text inside the proposer's prompt (what kind of
// methods the model is asked to write). Its utility is measured, never judged: run one
// propose round per benchmark task with that policy and take how close the best measured
// method gets to the best known value. The model then writes new policies from the archive
// of measured ones, as in STOP and the Darwin Goedel Machine: an empirical utility, an
// archive instead of a single incumbent, and a held-out task set the search never sees.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { claudeBin, parseClaudeEnvelope } from '../agents/claude_cli.js';
import { ask, measure, SEED_POLICY } from './propose.js';
import { outcome } from './evaluator.js';

const run = promisify(execFile);

const TRAIN = [
  { problem: 'ratio3', n: 27, best: 7.526054942, minimize: true },
  { problem: 'circles', n: 26, best: 2.635983085, minimize: false },
  { problem: 'circles-rect', n: 21, best: 2.365832376, minimize: false }
];
// Never shown to the model that writes policies; only the seed and the winner run on these.
const HELD_OUT = [
  { problem: 'ratio2', n: 24, best: 20.92820323, minimize: true },
  { problem: 'circles', n: 32, best: 2.939572771, minimize: false },
  { problem: 'circles-rect', n: 28, best: 2.740975606, minimize: false }
];

/** Mean over tasks of the digits reached by the best method of one propose round. */
async function utility(policy, tasks, { budget, count, work, tag }) {
  const perTask = await Promise.all(tasks.map(async (task) => {
    let proposals = [];
    try {
      proposals = await ask({ ...task, budget, history: [], count, policy });
    } catch {
      // A policy that breaks the reply format earns nothing on this task.
    }
    const results = await Promise.all(proposals.map((p, i) => measure({
      ...task, budget, code: p.code, file: join(work, `${tag}-${task.problem}-${task.n}-${i}.py`)
    }).catch(() => ({ found: null }))));
    const digits = results.map((r) => (r.found == null ? 0 : outcome({ found: r.found, best: task.best, minimize: task.minimize })));
    return { task: `${task.problem}-${task.n}`, proposals: proposals.length, digits: Math.max(0, ...digits) };
  }));
  return { utility: perTask.reduce((s, t) => s + t.digits, 0) / perTask.length, perTask };
}

async function askPolicies(archive, count) {
  const shown = archive.map((a) =>
    `utility ${a.utility.toFixed(2)} (${a.perTask.map((t) => `${t.task}: ${t.digits.toFixed(1)}`).join(', ')})\n"""${a.policy}"""`
  ).join('\n\n');
  const user = `A search system asks a language model to write numerical search methods (Python functions that
call a local optimiser a limited number of times) for geometric optimisation problems. Its prompt
states the problem, the function interface and the reply format, which are fixed, and then one
free paragraph, the "policy", that says what kind of methods to write.

Each policy below was measured: one round of four methods per task on three tasks, utility = mean
over tasks of how many digits of the best known value the best method reached (9 = reached).
One round is noisy; the same policy can differ by a digit between runs.

${shown}

Write ${count} new policies likely to score higher. A policy may say how to choose and diversify
methods, what to spend the call budget on, or which structures to exploit. It must not change
the interface or the reply format, and must stay under 900 characters. Reply with exactly
${count} blocks and nothing else, each of the form

POLICY:
\`\`\`
<text>
\`\`\``;
  const { stdout } = await run(claudeBin(), [
    '-p', user, '--model', process.env.LATERAL_CLAUDE_MODEL ?? 'claude-sonnet-5-5', '--output-format', 'json',
    '--system-prompt', 'You improve prompts from measurements. Follow the reply format exactly.',
    '--permission-mode', 'plan', '--strict-mcp-config',
    '--disallowed-tools', 'Write,Edit,NotebookEdit,Bash,KillShell,WebFetch'
  ], { timeout: 600000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
  const blocks = parseClaudeEnvelope(stdout).text.matchAll(/POLICY:\s*\n```[a-z]*\n([\s\S]*?)```/g);
  return [...blocks].map(([, text]) => text.trim().slice(0, 900)).filter(Boolean);
}

/** CLI: lateral selfimprove --data FILE [--generations G] [--count K] [--budget B] [--work DIR] */
export async function runSelfImproveCli(flags) {
  if (!flags.data) throw new Error('selfimprove needs --data FILE');
  const opts = { budget: Number(flags.budget ?? 150), count: 4, work: flags.work ?? join(dirname(flags.data), 'selfimprove') };
  mkdirSync(opts.work, { recursive: true });
  const archive = [];
  let serial = 0;
  const evaluate = async (policy, generation, tasks = TRAIN, set = 'train') => {
    const res = await utility(policy, tasks, { ...opts, tag: `p${serial++}` });
    const row = { policy, generation, set, ...res };
    appendFileSync(flags.data, JSON.stringify(row) + '\n');
    console.log(`gen ${generation} ${set.padEnd(8)} utility ${res.utility.toFixed(2)}  [${res.perTask.map((t) => t.digits.toFixed(1)).join(' ')}]  ${policy.replace(/\s+/g, ' ').slice(0, 80)}`);
    return row;
  };

  // The seed twice: the gap between the two runs is the noise any gain has to exceed.
  archive.push(await evaluate(SEED_POLICY, 0));
  archive.push(await evaluate(SEED_POLICY, 0));

  for (let g = 1; g <= Number(flags.generations ?? 3); g++) {
    let policies = [];
    try {
      policies = await askPolicies(archive, Number(flags.count ?? 3));
    } catch (err) {
      console.log(`gen ${g}: no policies (${String(err.message).split('\n')[0].slice(0, 100)})`);
    }
    for (const policy of policies) archive.push(await evaluate(policy, g));
  }

  const winner = archive.filter((a) => a.generation > 0).sort((a, b) => b.utility - a.utility)[0];
  if (!winner) return;
  // The winner was picked for a high noisy score, so run it again before believing it.
  await evaluate(winner.policy, 'recheck');
  await evaluate(SEED_POLICY, 'final', HELD_OUT, 'held-out');
  await evaluate(winner.policy, 'final', HELD_OUT, 'held-out');
  console.log(`\nwinning policy:\n${winner.policy}`);
}
