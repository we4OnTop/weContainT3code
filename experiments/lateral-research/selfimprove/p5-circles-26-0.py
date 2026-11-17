def search(problem, rng, polish):
    n = problem.n
    pool = []
    used = 0
    def P(x):
        nonlocal used
        used += 1
        s, y = polish(x)
        pool.append((s, np.array(y)))
        return s
    def rows_start():
        k = int(rng.integers(4, 7))
        cuts = np.sort(rng.choice(np.arange(1, n), k - 1, replace=False))
        counts = np.diff(np.concatenate([[0], cuts, [n]]))
        pts = []
        for i, c in enumerate(counts):
            y = (i + 0.5) / k
            off = 0.5 / c if (i % 2 and rng.random() < 0.5) else 0
            for j in range(c):
                pts.append([min(0.97, (j + 0.5) / c * (1 - off) + off / 2), y])
        pts = np.array(pts) + rng.normal(0, 0.01, (n, 2))
        r = 0.45 / max(counts.max(), k)
        return np.column_stack([np.clip(pts, 0.03, 0.97), np.full(n, r)]).ravel()
    def hex_start():
        s = rng.uniform(0.17, 0.21)
        g = []
        for i in range(8):
            for j in range(8):
                g.append([s / 2 + j * s + (s / 2 if i % 2 else 0), s / 2 + i * s * 0.87])
        g = np.array(g)
        g = g[(g < 1).all(1)]
        idx = rng.permutation(len(g))[:n]
        pts = g[idx] if len(g) >= n else np.vstack([g, rng.random((n - len(g), 2))])
        pts = pts + rng.normal(0, 0.01, (n, 2))
        return np.column_stack([np.clip(pts, 0.03, 0.97), np.full(n, s * 0.4)]).ravel()
    while used < 112:
        x = rows_start() if rng.random() < 0.6 else hex_start()
        if rng.random() < 0.3:
            x = problem.random(rng) if rng.random() < 0.2 else x
        P(x)
    pool.sort(key=lambda t: -t[0])
    top = [pool[0][1], pool[min(1, len(pool) - 1)][1]]
    k = 0
    while used < 148:
        x = top[k % 2].copy().reshape(n, 3)
        x[:, :2] += rng.normal(0, 1e-4, (n, 2))
        x[:, 2] *= 0.9995
        P(x.ravel())
        k += 1
    return max(pool, key=lambda t: t[0])[1]
