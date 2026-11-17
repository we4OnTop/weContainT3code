def search(problem, rng, polish):
    n = problem.n
    while True:
        m = rng.integers(0, 2)
        rest = n - m
        k = rng.integers(2, 5)
        cuts = np.sort(rng.choice(np.arange(1, rest), k - 1, replace=False))
        counts = np.diff(np.concatenate([[0], cuts, [rest]]))
        pts = [np.zeros((1, 2))] if m else []
        for r, c in enumerate(counts, 1):
            rad = r + rng.normal(0, 0.1)
            ph = rng.uniform(0, 2 * np.pi)
            a = ph + 2 * np.pi * np.arange(c) / c + rng.normal(0, 0.05, c)
            pts.append(rad * np.stack([np.cos(a), np.sin(a)], 1))
        X = np.concatenate(pts)
        polish(X.ravel())
