# lateral TSP improvement loop

Goal registered in lateral (`lateral goal-add`, heuristic backend): beat the strongest TSP
baseline on tour quality with a better time complexity. `tsp.mjs` is the result; run
`node experiments/lateral-tsp/tsp.mjs` (`--quick` for a ~15 s run).

What it is: neighbour-list 2-opt + Or-opt with a work queue, then local double-bridge kicks
that are undone when they do not help. What it is not: a faster _exact_ algorithm. Nothing
here improves on Held-Karp's O(n^2 2^n) worst case; that would be a P-vs-NP-scale result.

Random uniform instances, one seed per size, Node 22, single thread:

| iteration                | time exponent | n=8000 length | vs full 2-opt | n=8000 time |
| ------------------------ | ------------- | ------------- | ------------- | ----------- |
| baseline: NN + full 2-opt | 2.22          | 69.239        | -             | 45.1 s      |
| v1 neighbour-list 2-opt  | 0.93          | 74.698        | +7.88% worse  | 0.09 s      |
| v2 + Or-opt              | 0.93          | 71.387        | +3.10% worse  | 0.10 s      |
| v3 + 5 kicks per city    | 1.05          | 64.829        | -6.37% better | 3.4 s       |

v3 is also optimal on all 20 Held-Karp-checked n=12 instances, and stays about 2-3% above
the 0.7124*sqrt(n) estimate of the optimum up to n=32000. The exponent is a log-log fit of
measured time, not a proven bound: a single array reversal is O(n) in the worst case.
