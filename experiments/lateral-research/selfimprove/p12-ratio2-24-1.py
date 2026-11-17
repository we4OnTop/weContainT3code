def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    while True:
        X = cur.reshape(n, 2).copy()
        D = np.linalg.norm(X[:, None] - X[None], axis=2)
        iu = np.triu_indices(n, 1)
        v = D[iu]
        k = rng.integers(1, 4)
        lo = np.argsort(v)[:k]
        hi = np.argsort(v)[-k:]
        mv = set()
        for j in lo:
            mv.add(int(rng.choice([iu[0][j], iu[1][j]])))
        for j in hi:
            mv.add(int(rng.choice([iu[0][j], iu[1][j]])))
        cen = X.mean(0)
        rad = np.linalg.norm(X - cen, axis=1).max()
        for i in mv:
            if rng.random() < 0.5:
                X[i] = cen + rng.normal(0, 0.5 * rad, 2)
            else:
                X[i] += rng.normal(0, 0.2 * v.min(), 2)
        X += rng.normal(0, 0.02 * v.min(), X.shape)
        s, x = polish(X.ravel())
        if s >= cur_s or rng.random() < 0.05:
            cur_s, cur = s, x
