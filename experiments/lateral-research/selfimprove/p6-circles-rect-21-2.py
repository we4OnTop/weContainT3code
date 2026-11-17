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
        w = rng.uniform(0.65, 1.35); h = 2 - w
        C = np.zeros((0, 3))
        for _ in range(n):
            q = np.column_stack([rng.uniform(0, w, 500), rng.uniform(0, h, 500)])
            gap = np.minimum(np.minimum(q[:, 0], w - q[:, 0]), np.minimum(q[:, 1], h - q[:, 1]))
            if len(C):
                d = np.hypot(q[:, None, 0] - C[None, :, 0], q[:, None, 1] - C[None, :, 1]) - C[None, :, 2]
                gap = np.minimum(gap, d.min(axis=1))
            i = int(np.argmax(gap))
            r = float(np.clip(gap[i] * rng.uniform(0.7, 1.0), 0.01, 0.2))
            C = np.vstack([C, [q[i, 0], q[i, 1], r]])
        return np.concatenate([C.ravel(), [w]])
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
