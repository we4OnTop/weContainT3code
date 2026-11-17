def search(problem, rng, polish):
    n = problem.n
    calls = [0]
    pool = []
    def P(x):
        calls[0] += 1
        s, y = polish(x)
        y = np.asarray(y, float)
        pool.append((s, y))
        return s, y
    def ok(y, t=1e-7):
        w = y[-1]; h = 2 - w; c = y[:-1].reshape(n, 3)
        if w <= 0 or h <= 0 or np.any(c[:, 2] < -t): return False
        if np.any(c[:, 0] - c[:, 2] < -t) or np.any(c[:, 0] + c[:, 2] > w + t): return False
        if np.any(c[:, 1] - c[:, 2] < -t) or np.any(c[:, 1] + c[:, 2] > h + t): return False
        d = np.hypot(c[:, None, 0] - c[None, :, 0], c[:, None, 1] - c[None, :, 1])
        rr = c[:, None, 2] + c[None, :, 2]
        m = ~np.eye(n, dtype=bool)
        return bool(np.all((d - rr)[m] >= -t))
    def gen():
        w = rng.uniform(0.7, 1.3); h = 2 - w
        k = int(rng.integers(2, 5))
        cuts = np.sort(rng.choice(np.arange(1, n), k - 1, replace=False))
        counts = np.diff(np.concatenate([[0], cuts, [n]]))
        counts = np.sort(counts)
        pts = []
        for i, cnt in enumerate(counts):
            f = (i + 1) / k
            if cnt == 1 and i == 0: f = 0.0
            a0 = rng.uniform(0, 2 * np.pi)
            for j in range(cnt):
                a = a0 + 2 * np.pi * j / cnt
                pts.append((w / 2 + 0.8 * f * w / 2 * np.cos(a), h / 2 + 0.8 * f * h / 2 * np.sin(a)))
        pts = np.array(pts) + rng.normal(0, 0.01, (n, 2))
        r = np.full(n, 0.06)
        pts[:, 0] = np.clip(pts[:, 0], r, w - r); pts[:, 1] = np.clip(pts[:, 1], r, h - r)
        return np.concatenate([np.column_stack([pts, r]).ravel(), [w]])
    while calls[0] < 110:
        P(gen())
    pool.sort(key=lambda t: -t[0])
    cands = []
    for s, y in pool:
        if ok(y) and all(abs(s - c[0]) > 1e-9 for c in cands):
            cands.append((s, y))
        if len(cands) == 3: break
    if not cands: cands = pool[:1]
    for k in range(len(cands)):
        s, y = cands[k]
        quota = calls[0] + (150 - calls[0]) // (len(cands) - k)
        while calls[0] < min(quota, 150):
            s2, y2 = P(y)
            if s2 > s + 1e-12:
                s, y = s2, y2
            else:
                break
        cands[k] = (s, y)
    best = [t for t in pool if ok(t[1])] or pool
    s, y = max(best, key=lambda t: t[0])
    return s, y
