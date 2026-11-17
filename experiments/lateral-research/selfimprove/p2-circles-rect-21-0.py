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
    def build(pts, w, r):
        v = np.zeros(3 * n + 1)
        v[0:3 * n:3] = np.clip(pts[:, 0], 0, w)
        v[1:3 * n:3] = np.clip(pts[:, 1], 0, 2 - w)
        v[2:3 * n:3] = r
        v[-1] = w
        return v
    for _ in range(100):
        w = rng.uniform(0.45, 1.0); h = 2 - w
        rows = int(rng.integers(3, 9)); cols = int(np.ceil(n / rows)) + int(rng.integers(0, 2))
        pts = [((j + 0.5 + (0.5 if i % 2 else 0)) / (cols + 0.5) * w, (i + 0.5) / rows * h)
               for i in range(rows) for j in range(cols)]
        pts = np.array(pts)
        pts = pts[rng.permutation(len(pts))[:n]] + rng.normal(0, 0.01, (n, 2))
        r = 0.4 * min(w / cols, h / rows) * np.ones(n)
        P(build(pts, w, r))
    while cnt[0] < 144:
        v = best[1].copy()
        w = v[-1]
        i = int(np.argmin(v[2:3 * n:3]))
        v[3 * i] = rng.uniform(0, w); v[3 * i + 1] = rng.uniform(0, 2 - w); v[3 * i + 2] = 0.01
        P(v)
    while cnt[0] < 149:
        P(best[1])
    return best[0], best[1]
