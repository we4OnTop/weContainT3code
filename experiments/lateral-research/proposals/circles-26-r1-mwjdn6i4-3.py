def search(problem, rng, polish):
    n = problem.n
    best_s, best = polish(problem.random(rng))
    stale = 0
    while True:
        if stale > 25:
            best_s, best = polish(problem.random(rng))
            stale = 0
        y = best.copy().reshape(n, 3)
        k = int(rng.integers(2, 6))
        w = 1.0 / (y[:, 2] + 0.02)
        gone = rng.choice(n, k, replace=False, p=w / w.sum())
        keep = np.setdiff1d(np.arange(n), gone)
        cur = y[keep]
        new = []
        for _ in gone:
            pts = rng.random((1500, 2))
            d = np.sqrt(((pts[:, None, :] - cur[None, :, :2]) ** 2).sum(-1)) - cur[None, :, 2]
            clr = np.minimum(d.min(1), np.minimum(pts, 1 - pts).min(1))
            p = pts[np.argmax(clr)]
            r = max(0.5 * clr.max(), 0.01)
            cur = np.vstack([cur, [*p, r]])
            new.append(1)
        s, x = polish(cur.ravel())
        if s > best_s + 1e-12:
            best_s, best, stale = s, x, 0
        else:
            stale += 1
