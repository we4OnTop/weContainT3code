def search(problem, rng, polish):
    n = problem.n
    bs, bx = polish(problem.random(rng))
    while True:
        y = bx.reshape(n, 3).copy()
        d = np.linalg.norm(y[:, None] - y[None], axis=2)
        dmin = (d + np.eye(n) * 1e9).min(1)
        dmax = d.max(1)
        k = int(rng.integers(1, 4))
        cand = np.concatenate([np.argsort(dmin)[:4], np.argsort(dmax)[-4:]])
        chosen = rng.choice(cand, size=k, replace=False)
        c = y.mean(0)
        sc = np.linalg.norm(y - c, axis=1).mean()
        for i in chosen:
            y[i] = c + sc * rng.normal(size=3) * 0.7
        y += rng.normal(size=y.shape) * 0.02 * sc
        s, x = polish(y.ravel())
        if s > bs:
            bs, bx = s, x
