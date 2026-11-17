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
        w = rng.uniform(0.6, 1.4); h = 2 - w
        hexa = rng.random() < 0.6
        m = int(rng.integers(3, 7))
        cols = int(np.ceil((n + rng.integers(0, 4)) / m))
        pts = []
        for i in range(m):
            for j in range(cols):
                off = 0.5 * (i % 2) if hexa else 0.0
                pts.append(((j + 0.5 + off) / (cols + 0.5 * hexa) * w, (i + 0.5) / m * h))
        pts = np.array(pts)
        keep = rng.permutation(len(pts))[:n]
        pts = pts[keep]
        sp = min(w / (cols + 0.5 * hexa), h / m)
        pts = pts + rng.normal(0, 0.08 * sp, pts.shape)
        r = np.full(n, 0.45 * sp)
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
