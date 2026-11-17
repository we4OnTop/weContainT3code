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

    def relax():
        R = rng.uniform(0.095, 0.115)
        p = rng.random((n, 2)) * (1 - 2 * R) + R
        for it in range(250):
            d = p[:, None, :] - p[None, :, :]
            dist = np.sqrt((d ** 2).sum(-1)) + np.eye(n)
            ov = np.maximum(2 * R - dist, 0) * (1 - np.eye(n))
            f = (d / dist[..., None] * ov[..., None]).sum(1)
            p = np.clip(p + 0.5 * f + rng.normal(0, 0.002 * (1 - it / 250), p.shape), R, 1 - R)
        v = np.zeros((n, 3))
        v[:, :2] = p
        v[:, 2] = R * 0.8
        return v.ravel()

    while calls[0] < 70:
        try:
            P(relax())
        except Exception:
            if calls[0] >= 150:
                raise

    def hop(v):
        v = v.copy().reshape(-1, 3)
        m = int(rng.integers(1, 4))
        idx = np.argsort(v[:, 2])[:m]
        keep = np.setdiff1d(np.arange(n), idx)
        for i in idx:
            c = rng.random((400, 2))
            rad = np.minimum.reduce([c[:, 0], 1 - c[:, 0], c[:, 1], 1 - c[:, 1]])
            d = np.sqrt(((c[:, None, :] - v[None, keep, :2]) ** 2).sum(-1)) - v[None, keep, 2]
            rad = np.minimum(rad, d.min(1))
            j = int(np.argmax(rad))
            v[i] = [c[j, 0], c[j, 1], max(rad[j], 0.01) * 0.9]
            keep = np.append(keep, i)
        v[:, :2] += rng.normal(0, 0.01, (n, 2))
        return v.ravel()

    while calls[0] < 146 and best[1] is not None:
        P(hop(best[1]))
    if best[1] is None:
        P(problem.random(rng), 149)
    for _ in range(2):
        if best[1] is not None:
            P(best[1], 150)
    return best[1]
