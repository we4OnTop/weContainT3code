def search(problem, rng, polish):
    n = problem.n
    best = [-np.inf, None]
    calls = [0]
    def P(x):
        if calls[0] >= 150:
            return None
        calls[0] += 1
        try:
            s, y = polish(x)
        except Exception:
            if calls[0] >= 150:
                raise
            return None
        if np.isfinite(s) and s > best[0]:
            best[0], best[1] = s, np.array(y, float)
        return s, np.array(y, float)
    try:
        cur = None
        for _ in range(6):
            r = P(problem.random(rng))
            if r is not None and (cur is None or r[0] > cur[0]):
                cur = r
        if cur is None:
            raise RuntimeError
        T = 0.3
        while calls[0] < 146:
            s, x = cur
            X = x.reshape(n, 3).copy()
            D = np.linalg.norm(X[:, None] - X[None], axis=-1)
            np.fill_diagonal(D, np.inf)
            Dm = np.where(np.isinf(D), 0, D)
            k = int(rng.integers(1, 4))
            mode = rng.random()
            if mode < 0.5:
                # points on longest distances
                score = (Dm == Dm.max()).any(1) * 1.0 + Dm.max(1) / Dm.max()
            else:
                score = rng.random(n)
            out = np.argsort(-score)[:k]
            cen = X.mean(0)
            rad = np.linalg.norm(X - cen, axis=1).max()
            for j in out:
                keep = np.setdiff1d(np.arange(n), out)
                cand = cen + rng.normal(size=(40, 3)) * rad * 0.5
                dd = np.linalg.norm(cand[:, None] - X[keep][None], axis=-1).min(1)
                X[j] = cand[np.argmax(dd)]
            X += rng.normal(scale=0.02 * rad, size=X.shape)
            r = P(X.ravel())
            if r is None:
                continue
            if r[0] > cur[0] or rng.random() < np.exp((r[0] - cur[0]) / (T * abs(cur[0]) * 0.05 + 1e-9)):
                cur = r
        while calls[0] < 150 and best[1] is not None:
            P(best[1])
    except Exception:
        pass
    return best[0], best[1]
