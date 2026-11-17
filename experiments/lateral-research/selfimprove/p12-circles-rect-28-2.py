def search(problem, rng, polish):
    n = problem.n
    best_s, best = polish(problem.random(rng))
    stale = 0
    while True:
        y = best.copy()
        w = y[-1]
        h = 2 - w
        P = y[:-1].reshape(n, 3)
        k = int(rng.integers(1, 4))
        order = np.argsort(P[:, 2] + rng.normal(0, 0.03, n))
        rem = order[:k]
        for i in rem:
            P[i, 2] = 0.0
        for i in rem:
            pts = np.column_stack([rng.uniform(0, w, 1500), rng.uniform(0, h, 1500)])
            d = np.minimum.reduce([pts[:, 0], w - pts[:, 0], pts[:, 1], h - pts[:, 1]])
            for j in range(n):
                if P[j, 2] > 0:
                    dj = np.hypot(pts[:, 0] - P[j, 0], pts[:, 1] - P[j, 1]) - P[j, 2]
                    d = np.minimum(d, dj)
            m = int(np.argmax(d))
            P[i] = [pts[m, 0], pts[m, 1], max(d[m] * 0.9, 1e-3)]
        s, z = polish(np.concatenate([P.ravel(), [w]]))
        if s > best_s:
            best_s, best, stale = s, z, 0
        else:
            stale += 1
            if stale > 25:
                best_s, best = polish(problem.random(rng))
                stale = 0
