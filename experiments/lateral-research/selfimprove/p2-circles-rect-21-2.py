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
        w = rng.uniform(0.5, 1.0); h = 2 - w
        rows = int(rng.integers(3, 8))
        base = n // rows
        cs = np.full(rows, base); cs[rng.permutation(rows)[:n - base * rows]] += 1
        pts = []
        for i, c in enumerate(cs):
            for j in range(c):
                pts.append(((j + rng.uniform(0.3, 0.7)) / c * w, (i + 0.5) / rows * h))
        pts = np.array(pts) + rng.normal(0, 0.01, (n, 2))
        v = np.zeros(3 * n + 1)
        v[0:3 * n:3] = np.clip(pts[:, 0], 0, w)
        v[1:3 * n:3] = np.clip(pts[:, 1], 0, h)
        v[2:3 * n:3] = 0.35 * min(w / cs.max(), h / rows)
        v[-1] = w
        P(v)
    while cnt[0] < 144:
        v = best[1].copy()
        r = v[2:3 * n:3]
        i = int(np.argmax(r)); j = int(np.argmin(r))
        for k in (0, 1):
            v[3 * i + k], v[3 * j + k] = v[3 * j + k], v[3 * i + k]
        if rng.random() < 0.5:
            a, b = rng.choice(n, 2, replace=False)
            for k in (0, 1):
                v[3 * a + k], v[3 * b + k] = v[3 * b + k], v[3 * a + k]
        v[0:3 * n:3] += rng.normal(0, 0.005, n)
        v[1:3 * n:3] += rng.normal(0, 0.005, n)
        P(v)
    while cnt[0] < 149:
        P(best[1])
    return best[0], best[1]
