// Adds the research commands to lateral's CLI switch; each is inserted once.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const anchor = "    case 'mcp':";
const flags = (names) =>
  `Object.fromEntries(${JSON.stringify(names)}.map((k) => [k, flag(rest, k)]).filter(([, v]) => v != null))`;

const hooks = {
  research: `      const { runResearchCli } = await import("./research/search.js");
      await runResearchCli(${flags(['problem', 'n', 'strategy', 'budget', 'seed', 'workers', 'restart', 'out'])});
      return "done";`,
  evaluator: `      const { runEvaluatorCli } = await import("./research/evaluator.js");
      const opts = ${flags(['data', 'context', 'add', 'found', 'best'])};
      if (hasFlag(rest, "minimize")) opts.minimize = true;
      runEvaluatorCli(opts, rest.flatMap((v, i) => (rest[i - 1] === "--rank" ? [v] : [])));
      return undefined;`,
  propose: `      const { runProposeCli } = await import("./research/propose.js");
      await runProposeCli(${flags(['data', 'problem', 'n', 'best', 'rounds', 'count', 'budget', 'work'])});
      return undefined;`
};

let src = readFileSync(file, 'utf8');
if (!src.includes(anchor)) throw new Error('cli.js layout changed; add the research cases by hand');
for (const [name, body] of Object.entries(hooks)) {
  if (src.includes(`case "${name}":`)) continue;
  src = src.replace(anchor, `    case "${name}": {\n${body}\n    }\n\n${anchor}`);
}
writeFileSync(file, src);
