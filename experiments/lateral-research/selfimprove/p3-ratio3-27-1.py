def search(problem, rng, polish):
    n = problem.n
    cnt = [0]
    best = [-1e18, None]
    def run(x):
        cnt[0] += 1
        s, y = polish(x)
        y = np.array(y, float)
        if s > best[0]:
            best[0], best[1] = s, y
        return s, y
    def seed():
        if rng.random() < 0.4:
            g = np.array([[a, b, c] for a in range(3) for b in range(3) for c in range(3)], float)
        else:
            m = 5
            g = np.array([[a, b, c] for a in range(m) for b in range(m) for c in range(m) if (a + b + c) % 2 == 0], float)
            g = g[np.argsort(np.linalg.norm(g - (m - 1) / 2 - rng.normal(size=3) * 0.3, axis=1))[:n]]
        g = g - g.mean(0)
        return (g + rng.normal(size=g.shape) * 0.1).ravel()
    def kick(x):
        P = x.reshape(-1, 3).copy()
        ax = rng.integers(3)
        t = np.quantile(P[:, ax], 0.66 if rng.random() < 0.5 else 0.34)
        m = P[:, ax] > t if rng.random() < 0.5 else P[:, ax] <= t
        d = np.linalg.norm(P[:, None] - P[None], axis=2)
        np.fill_diagonal(d, 1e18)
        step = d.min() * 0.7
        v = rng.normal(size=3) * step
        v[ax] *= 0.3
        P[m] += v
        return (P + rng.normal(size=P.shape) * step * 0.05).ravel()
    main = 128
    cur_s, cur = run(seed())
    stall = 0
    while cnt[0] < main:
        s, y = run(kick(cur))
        if s > cur_s:
            cur_s, cur, stall = s, y, 0
        else:
            stall += 1
        if stall > 15 and cnt[0] < main:
            cur_s, cur = run(seed())
            stall = 0
    sc = np.ptp(best[1]) + 1e-9
    while cnt[0] < 150:
        run(best[1] + rng.normal(size=best[1].shape) * sc * 1e-4)
    return best[0], best[1]
