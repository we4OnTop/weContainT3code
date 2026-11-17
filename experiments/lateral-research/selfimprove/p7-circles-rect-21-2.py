def search(problem, rng, polish):
    n = problem.n
    best = [-1e18, None]
    cnt = [0]
    LIM = 150

    def P(x):
        if cnt[0] >= LIM:
            return None
        cnt[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            return None
        if s > best[0]:
            best[0] = s
            best[1] = np.array(xp, float)
        return s

    iu = np.triu_indices(n, 1)

    def relax(p, r, w):
        for mu in (5.0, 20.0, 80.0, 300.0):
            lr = 0.2 / mu
            for _ in range(150):
                gp = np.zeros_like(p)
                gr = -np.ones(n)
                gw = 0.0
                D = p[:, None, :] - p[None, :, :]
                d = np.sqrt((D ** 2).sum(-1)) + 1e-12
                v = np.maximum(0.0, r[:, None] + r[None, :] - d)
                np.fill_diagonal(v, 0.0)
                gr += 2 * mu * v.sum(1)
                gp += (-2 * mu * v / d)[:, :, None].__mul__(D).sum(1)
                H = 2 - w
                for ax, lim, sg in ((0, w, 1), (1, H, 1)):
                    vh = np.maximum(0.0, p[:, ax] + r - lim)
                    gp[:, ax] += 2 * mu * vh
                    gr += 2 * mu * vh
                    gw += (-2 * mu * vh.sum()) if ax == 0 else (2 * mu * vh.sum())
                    vl = np.maximum(0.0, r - p[:, ax])
                    gp[:, ax] -= 2 * mu * vl
                    gr += 2 * mu * vl
                p = p - lr * gp
                r = np.maximum(r - lr * gr, 1e-3)
                w = float(np.clip(w - lr * gw, 0.1, 1.9))
        return p, r, w

    while cnt[0] < LIM - 3:
        try:
            w = float(np.clip(rng.uniform(0.5, 1.5), 0.1, 1.9))
            p = np.column_stack([rng.uniform(0, w, n), rng.uniform(0, 2 - w, n)])
            r = np.full(n, rng.uniform(0.02, 0.08))
            p, r, w = relax(p, r, w)
            x = np.concatenate([np.column_stack([p, r]).ravel(), [w]])
            P(x)
        except Exception:
            P(problem.random(rng))
    if best[1] is not None:
        P(best[1])
        P(best[1])
    if best[1] is None:
        return problem.random(rng)
    return best[1]
