def search(problem, rng, polish):
    n = problem.n
    def worst(x):
        P = x.reshape(n, 2)
        best = (1e18, None)
        for a in range(n):
            for b in range(a + 1, n):
                for c in range(b + 1, n):
                    ar = abs((P[b, 0] - P[a, 0]) * (P[c, 1] - P[a, 1])
                             - (P[b, 1] - P[a, 1]) * (P[c, 0] - P[a, 0]))
                    if ar < best[0]:
                        best = (ar, (a, b, c))
        return best[1]
    best_s, best = polish(problem.random(rng))
    for _ in range(350):
        P = best.reshape(n, 2).copy()
        v = worst(best)[int(rng.integers(3))]
        lo, hi = P.min(0), P.max(0)
        P[v] = rng.uniform(lo, hi)
        s, y = polish(P.ravel())
        if s > best_s:
            best_s, best = s, y
    return best_s, best
