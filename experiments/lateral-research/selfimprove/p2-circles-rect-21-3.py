def search(problem, rng, polish):
    n = problem.n
    best = [-1e18, None]
    cnt = [0]
    def P(x):
        cnt[0] += 1
        s, xp = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(xp, float)
        return s
    for _ in range(100):
        w = rng.uniform(0.45, 1.0); h = 2 - w
        rs = np.sort(rng.uniform(0.5, 1.5, n))[::-1] * 0.6 * np.sqrt(w * h / n) / 1.0
        rs = np.minimum(rs, 0.45 * w)
        pts = []
        for r in rs:
            bp, bd = None, -1e9
            for _t in range(30):
                p = np.array([rng.uniform(r, max(r, w - r)), rng.uniform(r, max(r, h - r))])
                d = min([np.hypot(*(p - q)) - r - rq for q, rq in pts] + [1.0])
                if d > bd:
                    bd, bp = d, p
            pts.append((bp, r))
        v = np.zeros(3 * n + 1)
        for i, (p, r) in enumerate(pts):
            v[3 * i], v[3 * i + 1], v[3 * i + 2] = p[0], p[1], r
        v[-1] = w
        P(v)
    t = 0
    while cnt[0] < 144:
        v = best[1].copy()
        s = 0.06 * (1 - t / 44.0) + 0.003
        t += 1
        m = rng.random(n) < 0.3
        v[0:3 * n:3] += m * rng.normal(0, s, n)
        v[1:3 * n:3] += m * rng.normal(0, s, n)
        v[2:3 * n:3] *= 0.9
        P(v)
    while cnt[0] < 149:
        P(best[1])
    return best[0], best[1]
