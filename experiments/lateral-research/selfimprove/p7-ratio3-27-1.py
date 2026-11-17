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
        return s
    def lattice(kind):
        r = np.arange(-4, 5)
        g = np.array(np.meshgrid(r, r, r)).reshape(3, -1).T.astype(float)
        if kind == 0:
            return g
        if kind == 1:
            return np.vstack([g, g + 0.5])
        if kind == 2:
            return np.vstack([g, g + [0.5, 0.5, 0], g + [0.5, 0, 0.5], g + [0, 0.5, 0.5]])
        a = np.vstack([g, g + [0.5, 0.5, 0]])
        a[:, 1] *= np.sqrt(3) / 1.0
        h = np.vstack([a, a + [0.5, np.sqrt(3) / 6 * 2 * 0 + 0.5 * 0.577, 0.5]])
        return h
    try:
        for i in range(140):
            L = lattice(i % 4)
            q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
            L = L @ q.T
            c = rng.uniform(-0.7, 0.7, 3)
            w = np.exp(rng.uniform(-0.5, 0.5, 3))
            d = np.linalg.norm((L - c) * w, axis=1)
            idx = np.argsort(d)[:n]
            x = L[idx] + rng.normal(scale=rng.choice([0.01, 0.05, 0.12]), size=(n, 3))
            P(x.ravel())
        while calls[0] < 150 and best[1] is not None:
            P(best[1])
    except Exception:
        pass
    return best[0], best[1]
