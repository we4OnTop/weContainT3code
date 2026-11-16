def search(problem, rng, polish):
    n = problem.n
    s = np.std(problem.random(rng))
    g = np.arange(-3, 4)
    G = np.array([[a, b, c] for a in g for b in g for c in g], float)
    kinds = [G, G[G.sum(1) % 2 == 0], np.vstack([G, G + 0.5])]
    best = -np.inf
    while True:
        L = kinds[rng.integers(3)]
        c = rng.uniform(-0.5, 0.5, 3)
        d = np.linalg.norm(L - c, axis=1) + rng.uniform(0, 0.05, len(L))
        P = L[np.argsort(d)[:n]].copy()
        P = P / 2.0 * s + rng.normal(0, rng.choice([0.02, 0.05, 0.1]) * s, P.shape)
        sc, x = polish(P.ravel())
        best = max(best, sc)
