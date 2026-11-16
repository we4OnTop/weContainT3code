# lateral research: measured search with far-from-tried escape directions

`search.js` adds a `lateral research` command (install with `./install.sh`). It applies
lateral's max-min direction selection to solution space: from an archive of local optima it
kicks the one least like recently used parents, in the candidate direction farthest from
every direction that already failed there, with the exact opposite of each failed direction
always in the pool. `problems.py` polishes (SLSQP) and scores every candidate, so nothing
counts without a measurement. `ablate.mjs` compares it with independent random kicks.

    lateral research --problem ratio3 --n 14 --budget 1500 --restart 150 --out best.json
    node ablate.mjs circles 26 600 8 150

## Result: the direction selection does not help, and no record was beaten

Ablation, equal polish budgets, 8 seeds, median final score (higher is better):

| problem                | random kicks | far-from-tried ("lateral") |
| ---------------------- | ------------ | -------------------------- |
| Heilbronn triangle n=11 | 0.03159      | 0.03243                    |
| Heilbronn convex n=13  | 0.02486      | 0.02579                    |
| circles in square n=26 | 2.62841      | 2.62420                    |

The differences are inside seed-to-seed spread and change sign between problems. In 20 to 80
dimensions a random kick is already nearly orthogonal to a few dozen earlier ones, so
selecting for it changes little.

Against the best known values (Erich Friedman's Packing Center tables for the distance
ratio, read 2026-11-16; web search for the rest):

| problem                           | this search      | best known            | verdict |
| --------------------------------- | ---------------- | --------------------- | ------- |
| max/min distance^2, 2D n=16       | 12.889229907694  | 12.889229907718       | same configuration; 2e-11 is rounding |
| same, 2D n=17..23, 25..28         | equal to the table's 3 decimals | Friedman table | tie |
| same, 2D n=24                     | 20.9602          | 14 + 4*sqrt(3) = 20.9282 | worse |
| max/min distance^2, 3D n=14       | 4.165783474580   | 4.165783988278        | same configuration, converged 5e-7 further |
| same, 3D n=7..21, 23, 24, 26      | equal to the table's 3 to 5 decimals | Friedman table | tie |
| same, 3D n=22, 25, 27, 28, 29     | 6.3558 / 7.0480 / 7.5367 / 7.7370 / 7.8977 | 6.34552 / 7.04527 / 7.52605 / 7.68958 / 7.84943 | worse |
| Heilbronn triangle n=11           | 0.034442         | 0.036530              | worse |
| Heilbronn convex n=13 / n=14      | 0.021906 / 0.026549 | 0.030937 / 0.027836 | worse |
| circles in square n=26            | 2.634292         | 2.635983              | worse |

Where the search is strong enough it lands exactly on the table value, including entries
from 2009; elsewhere it is below. The 3D n=14 value is the only one under a published
number, and it is a tighter polish of the known configuration, not a new one. Budgets:
20000 polishes (Heilbronn, circles), 1500 to 12000 (distance ratio). `results/` holds the
coordinates.

## Method chosen by lateral's LLM backend: structured starts

With `LATERAL_BACKEND=claude`, lateral's decision loop ranked six candidate methods and
chose symmetric starts, with lattice cut-outs second. `seeds.py` measures both against
random starts at equal budgets (best of 400 polishes in 2D, 500 in 3D):

| instance | random    | lattice   | symmetric | table     |
| -------- | --------- | --------- | --------- | --------- |
| 2D n=24  | 20.960213 | 20.928203 | 20.928203 | 20.928203 |
| 3D n=22  | 6.345524  | 6.345524  | 6.345524  | 6.34552+  |
| 3D n=25  | 7.045279  | 7.045279  | 7.045279  | 7.04527+  |
| 3D n=27  | 7.539632  | 7.546326  | 7.536739  | 7.52605+  |
| 3D n=28  | 7.689589  | 7.713135  | 7.689589  | 7.68958+  |
| 3D n=29  | 7.849436  | 7.849436  | 7.849436  | 7.84943+  |
| 3D n=30  | 8.032330  | 8.034733  | 8.031711  | 8.03171+  |
| 2D n=30  | 26.879265 | 26.879265 | 26.879265 | 26.879+   |
| 2D n=31  | 28.283577 | 28.000000 | 28.000000 | 28        |

Structured starts reach the 2D n=24, 2D n=31 and 3D n=30 records that random starts miss,
and make no difference elsewhere. Still ties, no improvement. Plain restarts with 500 polishes also match table values
that the kick loop above missed with 6000, so kicking from found optima hurt on these
instances whichever way the direction was chosen.

## Evaluator trained on measurements

`evaluator.js` adds `lateral evaluator`. `measurements.jsonl` holds every measured
(idea, instance, result) from the runs above; the model is kernel ridge regression over
lateral's text embeddings and predicts how many digits of the best known value an idea
will reach on an instance.

    lateral evaluator --data measurements.jsonl
    lateral evaluator --data measurements.jsonl --context "<instance>" --rank "<idea>" --rank "<idea>"
    lateral evaluator --data measurements.jsonl --add "<idea>" --context "<instance>" --found 7.54 --best 7.52605 --minimize

With the first 49 measurements of 4 ideas it predicted barely better than the mean (held-out
rank correlation 0.08 to 0.19). After the propose loop below (114 measurements, 64 ideas)
the held-out rank correlation is 0.68 to 0.74, but most of that is the instance: Heilbronn
runs end far from the record whatever the method. Its picks inside a round, where the
instance is fixed, are the fair test, and there it is no better than chance (see below).

## Propose loop: the model writes methods, lateral measures them

`propose.js` adds `lateral propose`. Each round the model (Claude CLI) writes four search
methods as code against a fixed interface, `run_method.py` measures each with 300 polishes,
and every result is appended to `measurements.jsonl` with the code in `proposals/`.

    lateral propose --data measurements.jsonl --problem circles --n 32 --best 2.939572771 --rounds 3

Best proposed method per instance, same 300-polish budget as the random-restart baseline:

| instance                | random restarts | best proposal  | best known       | verdict |
| ----------------------- | --------------- | -------------- | ---------------- | ------- |
| circles in square n=32  | 2.924535        | 2.939572771206 | 2.939572771206   | reached |
| circles in square n=26  | 2.615194        | 2.635983085    | 2.635983         | reached |
| distance ratio 3D n=27  | 7.536739        | 7.526055       | 7.52605+         | reached |
| Heilbronn triangle n=11 | 0.028866        | 0.035762       | 0.036530         | below   |
| Heilbronn convex n=14   | 0.018369        | 0.025976       | 0.027836         | below   |

47 of 60 proposals beat random restarts, and three records that every hand-written method
above missed were reached. None was beaten: the two `*.best.json` files in `proposals/` are
the n=32 record itself, flagged only because `--best` was given truncated.

Two selectors were scored on the same proposals (all were measured, so this is a fair
comparison; digits of agreement with the best known value, higher is better):

| selector                                   | mean digits | reached a record |
| ------------------------------------------ | ----------- | ---------------- |
| all 60 proposals (what a random pick gets) | 2.47        | 7 of 60          |
| evaluator's pick (15 rounds)               | 2.52        | 2 of 15          |
| farthest from ideas already tried (15)     | 1.83        | 0 of 15          |

Picking the idea farthest from everything tried is worse than picking at random, and the
evaluator is level with random. What helped was generating many different methods and
measuring all of them.

### The proposed circle methods on the rest of the table

The three best proposed circle methods, 600 polishes each for n=24..40, then the two best
with 3000 polishes for n=33..38 (table: Friedman's circles-in-squares page, 2026-11):

| n                          | this search | table    | verdict |
| -------------------------- | ----------- | -------- | ------- |
| 24, 25, 28, 29, 30, 31     | equal to 5 decimals | entries from 2011/2012 | tie |
| 34, 35, 37, 38             | 3.029799 / 3.074036 / 3.161499 / 3.205946 | 3.02979+ / 3.07403+ / 3.16149+ / 3.20594+ | tie |
| 27                         | 2.685157    | 2.68597+ | below |
| 33                         | 2.987285    | 2.98729+ | below by 5e-6 |
| 36                         | 3.121004    | 3.12175+ | below |
| 39, 40 (600 polishes only) | 3.243679 / 3.291236 | 3.24811+ / 3.29239+ | below |

Ten more table values matched, none exceeded. For n=41..50 the strongest method with 1500
polishes stays 0.007 to 0.028 below the table (two runs failed on an invalid start).
