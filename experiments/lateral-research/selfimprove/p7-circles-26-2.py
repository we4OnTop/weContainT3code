def search(problem, rng, polish):
    n = problem.n
    best = [-1e9, None]
    calls = [0]

    def P(x, lim=146):
        if calls[0] >= lim:
            return None
        calls[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            if calls[0] >= 150:
                raise
            return None
        if s > best[0]:
            best[0] = s
            best[1] = np.array(xp, float)
        return s

    def insert_build():
        k = int(rng.integers(1, 6))
        shrink = rng.uniform(0.6, 1.0)
        X = np.zeros((0, 3))
        for _ in range(n):
            c = rng.random((500, 2))
            # include boundary-biased candidates
            c[:100] = np.clip(c[:100] + rng.choice([-0.5, 0.5], (100, 2)) * (rng.random((100, 2)) < 0.3), 0, 1)
            rad = np.minimum.reduce([c[:, 0], 1 - c[:, 0], c[:, 1], 1 - c[:, 1]])
            if len(X):
                d = np.sqrt(((c[:, None, :] - X[None, :, :2]) ** 2).sum(-1)) - X[None, :, 2]
                rad = np.minimum(rad, d.min(1))
            rad = np.maximum(rad, 0.005)
            top = np.argsort(-rad)[:k]
            j = rng.choice(top)
            X = np.vstack([X, [c[j, 0], c[j, 1], rad[j] * shrink]])
        return X.ravel()

    while calls[0] < 146:
        try:
            P(insert_build())
        except Exception:
            if calls[0] >= 150:
                raise
    if best[1] is None:
        P(problem.random(rng), 149)
    for _ in range(2):
        if best[1] is not None:
            P(best[1], 150)
    return best[1]
