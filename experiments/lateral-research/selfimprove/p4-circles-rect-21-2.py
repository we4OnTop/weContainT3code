def search(problem, rng, polish):
    n = problem.n
    m = (n - 1) // 2
    best = [-1e9, None]
    cnt = [0]

    def P(x):
        cnt[0] += 1
        s, xp = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(xp, dtype=float)
        return s, xp

    def build(u, w):
        h = 2 - w
        p = np.clip(u.reshape(-1, 2), 0.02, 0.98) * [w, h]
        pts = np.vstack([[w / 2, h / 2], p, np.array([w, h]) - p])
        return pts[:n], w, h

    def radii(pts, w, h):
        r = np.minimum(np.minimum(pts[:, 0], w - pts[:, 0]), np.minimum(pts[:, 1], h - pts[:, 1]))
        D = np.hypot(pts[:, None, 0] - pts[None, :, 0], pts[:, None, 1] - pts[None, :, 1])
        np.fill_diagonal(D, 1e9)
        wall = r.copy()
        for _ in range(6):
            for i in range(len(pts)):
                r[i] = max(0.0, min(wall[i], (D[i] - r).min()))
        return r

    def score(u, w):
        pts, w, h = build(u, w)
        return radii(pts, w, h).sum()

    cands = []
    for _ in range(12):
        u = rng.uniform(0, 1, 2 * m)
        w = rng.uniform(0.7, 1.3)
        s = score(u, w)
        for _ in range(60):
            u2 = u + 0.05 * rng.normal(size=u.size)
            w2 = float(np.clip(w + 0.03 * rng.normal(), 0.5, 1.5))
            s2 = score(u2, w2)
            if s2 > s:
                u, w, s = u2, w2, s2
        cands.append((s, u, w))
    cands.sort(key=lambda t: -t[0])

    def vec(u, w):
        pts, w, h = build(u, w)
        r = radii(pts, w, h) * 0.95 + 1e-3
        v = np.column_stack([pts, r]).ravel()
        return np.append(v, w)

    # exploration: polish the 12 symmetric candidates plus jittered copies (~90 calls)
    for k in range(90):
        s, u, w = cands[k % 12]
        x = vec(u, w)
        if k >= 12:
            x[:-1] += 0.01 * rng.normal(size=x.size - 1)
        P(x)
    # refinement: perturb best (~58 calls)
    P(best[1])
    while cnt[0] < 148:
        x = best[1].copy()
        x[:-1] += 2e-3 * rng.normal(size=x.size - 1)
        P(x)
    return best[0], best[1]
