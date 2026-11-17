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
    def spread(v, it=40):
        for _ in range(it):
            d = v[:, None] - v[None]
            r2 = (d ** 2).sum(-1) + np.eye(len(v))
            f = (d / r2[..., None] ** 1.5).sum(1)
            v = v + 0.05 * f / (np.abs(f).max() + 1e-9)
            v /= np.linalg.norm(v, axis=1, keepdims=True)
        return v
    try:
        for i in range(140):
            center = int(rng.integers(0, 2))
            m = n - center
            k = int(rng.integers(1, 5))
            cuts = np.sort(rng.choice(np.arange(1, m), size=min(k - 1, m - 1), replace=False)) if k > 1 else []
            counts = np.diff(np.concatenate([[0], cuts, [m]])).astype(int)
            radii = np.sort(rng.uniform(0.3, 1, len(counts)))
            radii = radii / radii[-1]
            pts = [np.zeros((center, 3))]
            for c, r in zip(counts, radii):
                v = rng.normal(size=(c, 3))
                v /= np.linalg.norm(v, axis=1, keepdims=True)
                if c > 1:
                    v = spread(v)
                pts.append(v * r)
            x = np.vstack(pts) + rng.normal(scale=0.01, size=(n, 3))
            P(x.ravel())
        while calls[0] < 150 and best[1] is not None:
            P(best[1])
    except Exception:
        pass
    return best[0], best[1]
