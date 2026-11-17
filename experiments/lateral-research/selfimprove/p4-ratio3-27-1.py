def search(problem, rng, polish):
    n = problem.n
    iu = np.triu_indices(n, 1)
    best = [-np.inf, None]
    calls = [0]
    def P(x):
        if calls[0] >= 149:
            return
        calls[0] += 1
        s, y = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(y, dtype=float)
    def smooth(X):
        X = X - X.mean(0); X = X / np.sqrt((X ** 2).sum(1).mean())
        for p in (3, 6, 12, 24, 48, 96):
            for t in range(120):
                lr = 0.1 * (1 - t / 120) + 0.004
                diff = X[:, None] - X[None]
                d = np.sqrt((diff ** 2).sum(-1) + np.eye(n))
                dd = d[iu] + 1e-12
                ld = np.log(dd)
                wa = np.exp(p * (ld - ld.max())); wa /= wa.sum()
                wb = np.exp(-p * (ld - ld.min())); wb /= wb.sum()
                M = np.zeros((n, n)); M[iu] = (wa - wb) / dd / dd
                M = M + M.T
                g = (M[:, :, None] * diff).sum(1)
                X = X - lr * g / (np.linalg.norm(g) + 1e-12)
                X = X - X.mean(0); X = X / np.sqrt((X ** 2).sum(1).mean())
        return X
    # exploration: 100 continuation runs, each ending in one exact polish
    for t in range(100):
        X = problem.random(rng).reshape(n, 3)
        P(smooth(X).ravel())
    # refinement: perturb the best, re-smooth lightly from p=24 is skipped; plain polish
    t = 0
    while calls[0] < 149:
        t += 1
        if best[1] is None:
            P(problem.random(rng)); continue
        sc = np.abs(best[1]).mean() + 1e-9
        P(best[1] if calls[0] >= 147 else best[1] + rng.normal(0, [0.01, 0.04][t % 2] * sc, best[1].shape))
    return best[0], best[1]
