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
    res = []
    try:
        for i in range(120):
            k = i % 4
            if k == 0:
                x = problem.random(rng)
            elif k == 1:
                x = rng.normal(size=(n, 3)).ravel()
            elif k == 2:
                v = rng.normal(size=(n, 3))
                v /= np.linalg.norm(v, axis=1, keepdims=True)
                x = (v * rng.random((n, 1)) ** (1 / 3)).ravel()
            else:
                x = (rng.random((n, 3)) * np.array([1, 1, rng.uniform(0.2, 1)])).ravel()
            s = P(x)
            if s is not None:
                res.append((s, x))
        res.sort(key=lambda t: -t[0])
        for s, x in res[:5]:
            if calls[0] >= 145:
                break
            P(best[1] if best[1] is not None else x)
        while calls[0] < 150 and best[1] is not None:
            P(best[1])
    except Exception:
        pass
    return best[0], best[1]
