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
        w = rng.uniform(0.4, 1.0); h = 2 - w
        counts = []; left = n; k = 0
        while left > 0:
            c = 1 if k == 0 and rng.random() < 0.5 else min(left, int(rng.integers(4, 6 + 5 * k + 1)))
            counts.append(c); left -= c; k += 1
        pts = []
        for k, c in enumerate(counts):
            f = (k + 1) / (len(counts) + 0.5) if (k > 0 or c > 1) else 0.0
            ph = rng.uniform(0, 6.283)
            for j in range(c):
                a = ph + 6.283 * j / c
                pts.append((w / 2 + 0.5 * w * f * np.cos(a), h / 2 + 0.5 * h * f * np.sin(a)))
        pts = np.array(pts[:n]) + rng.normal(0, 0.01, (n, 2))
        v = np.zeros(3 * n + 1)
        v[0:3 * n:3] = np.clip(pts[:, 0], 0, w)
        v[1:3 * n:3] = np.clip(pts[:, 1], 0, h)
        v[2:3 * n:3] = 0.3 * np.sqrt(w * h / n)
        v[-1] = w
        P(v)
    while cnt[0] < 144:
        v = best[1].copy()
        s = rng.choice([0.005, 0.02, 0.05])
        v[0:3 * n:3] += rng.normal(0, s, n)
        v[1:3 * n:3] += rng.normal(0, s, n)
        v[2:3 * n:3] *= 0.8
        v[-1] = np.clip(v[-1] + rng.normal(0, 0.02), 0.3, 1.0)
        P(v)
    while cnt[0] < 149:
        P(best[1])
    return best[0], best[1]
