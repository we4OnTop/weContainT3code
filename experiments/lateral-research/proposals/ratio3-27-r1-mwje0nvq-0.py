def search(problem, rng, polish):
    n = problem.n
    best = (-np.inf, None)
    while True:
        x = problem.random(rng).reshape(n, 3)
        x = x - x.mean(0)
        x = x / (np.abs(x).max() + 1e-12)
        for s in (4, 8, 16, 32):
            for _ in range(60):
                d = x[:, None] - x[None]
                r2 = (d ** 2).sum(-1) + np.eye(n)
                f = (d / r2[..., None] ** ((s + 2) / 2)).sum(1)
                f /= np.linalg.norm(f, axis=1).max() + 1e-12
                x = x + 0.05 * f
                r = np.linalg.norm(x, axis=1, keepdims=True)
                x = x / np.maximum(r, 1.0)
        sc, xp = polish(x.ravel())
        if sc > best[0]:
            best = (sc, xp)
    return best
