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

Against the best published values found by web search (the record sites themselves were
not reachable from this environment):

| problem                           | this search      | best published        | verdict |
| --------------------------------- | ---------------- | --------------------- | ------- |
| max/min distance^2, 2D n=16       | 12.889229907694  | 12.889229907718       | same configuration; 2e-11 is rounding |
| max/min distance^2, 3D n=14       | 4.165783474580   | 4.165783988278        | same configuration, converged 5e-7 further |
| same, 2D n=17..21 and 26, 3D n=7..19 | equal to 3 decimals | Friedman table (3 decimals) | tie |
| same, 2D n=25                     | 22.1362          | 22.121                | worse |
| Heilbronn triangle n=11           | 0.034442         | 0.036530              | worse |
| Heilbronn convex n=13 / n=14      | 0.021906 / 0.026549 | 0.030937 / 0.027836 | worse |
| circles in square n=26            | 2.634292         | 2.635983              | worse |

The 3D n=14 value is the only one below a published number, and it is a tighter polish of
the known configuration, not a new one. Long runs used 20000 polishes (Heilbronn, circles)
or 1500 to 4000 (distance ratio); `results/` holds the coordinates.
