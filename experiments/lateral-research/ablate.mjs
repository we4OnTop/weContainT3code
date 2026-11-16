// Compares kick strategies at equal polish budgets.
// node ablate.mjs <problem> <n> [budget] [seeds] [restartEvery]
const { research } = await import(`${process.env.HOME}/.local/share/lateral/src/research/search.js`);
const [problem, n, budget = 300, seeds = 6, restartEvery = 60] = process.argv.slice(2);
const groupSize = { circles: 3, ratio3: 3 }[problem] ?? 2;
for (const strategy of ['random', 'lateral']) {
  const finals = [];
  for (let seed = 1; seed <= +seeds; seed++) {
    const { best } = await research({ problem, n: +n, groupSize, strategy, budget: +budget, seed, restartEvery: +restartEvery });
    finals.push(best.score);
  }
  finals.sort((a, b) => b - a);
  const mean = finals.reduce((a, b) => a + b) / finals.length;
  console.log(`${problem} n=${n} ${strategy.padEnd(8)} best ${finals[0].toPrecision(12)} median ${finals[finals.length >> 1].toPrecision(12)} mean ${mean.toPrecision(12)}`);
}
