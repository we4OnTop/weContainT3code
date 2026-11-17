def search(problem, rng, polish):
    n = problem.n
    pool = []
    used = 0
    def go(x):
        nonlocal used
        used += 1
        s, xp = polish(x)
        pool.append((s, xp))
        pool.sort(key=lambda t: -t[0])
        del pool[3:]
        return s
    def hexstart():
        s = rng.uniform(0.15, 0.21)
        th = rng.uniform(0, np.pi / 3)
        off = rng.uniform(0, s, 2)
        pts = []
        for i in range(-8, 9):
            for j in range(-8, 9):
                p = np.array([s * (i + 0.5 * j), s * j * 0.866])
                c, sn = np.cos(th), np.sin(th)
                p = np.array([c * p[0] - sn * p[1], sn * p[0] + c * p[1]]) + off
                if 0.03 < p[0] < 0.97 and 0.03 < p[1] < 0.97:
                    pts.append(p)
        pts = np.array(pts)
        if len(pts) > n:
            pts = pts[rng.permutation(len(pts))[:n]]
        elif len(pts) < n:
            pts = np.vstack([pts, rng.uniform(0.05, 0.95, (n - len(pts), 2))]) if len(pts) else rng.uniform(0.05, 0.95, (n, 2))
        pts = np.clip(pts + rng.normal(0, 0.005, pts.shape), 0.02, 0.98)
        x = np.zeros((n, 3))
        x[:, :2] = pts
        x[:, 2] = 0.08
        return x.ravel()
    for _ in range(100):
        go(hexstart())
    while used < 150:
        s, x = pool[0] if rng.random() < 0.6 else pool[int(rng.integers(len(pool)))]
        y = x.reshape(n, 3).copy()
        if rng.random() < 0.7:
            k = int(np.argmin(y[:, 2]))
            y[k, :2] = rng.uniform(0.05, 0.95, 2)
            y[k, 2] = 0.03
        else:
            y[:, :2] += rng.normal(0, 0.01, (n, 2))
        go(y.ravel())
    return pool[0][1]
