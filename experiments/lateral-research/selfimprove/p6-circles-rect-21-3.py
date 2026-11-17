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
    best_s, best_y = -1e9, None
    while calls[0] < 40:
        x = np.array(problem.random(rng), float)
        x[:-1].reshape(n, 3)[:, 2] *= 0.3
        s, y = P(x)
        if ok(y) and s > best_s: best_s, best_y = s, y
    if best_y is None: best_s, best_y = pool[0]
    while calls[0] < 110:
        x = best_y.copy()
        w = x[-1]; h = 2 - w
        c = x[:-1].reshape(n, 3)
        k = int(rng.integers(1, 3))
        for i in np.argsort(c[:, 2])[:k]:
            c[i] = [rng.uniform(0.05, max(w - 0.05, 0.06)), rng.uniform(0.05, max(h - 0.05, 0.06)), 0.02]
        c[:, :2] += rng.normal(0, 0.02, (n, 2))
        c[:, 2] *= 0.9
        x[-1] = np.clip(w + rng.normal(0, 0.03), 0.3, 1.7)
        s, y = P(x)
        if ok(y) and s > best_s: best_s, best_y = s, y
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
