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
    def sym():
        m = n // 2
        mode = int(rng.integers(3))
        if mode == 0:
            h = np.column_stack([rng.uniform(0.04, 0.48, m), rng.uniform(0.04, 0.96, m)])
            mir = np.column_stack([1 - h[:, 0], h[:, 1]])
        elif mode == 1:
            h = rng.uniform(0.04, 0.96, (m, 2))
            h = np.where((h[:, 1] > h[:, 0])[:, None], h[:, ::-1], h)
            mir = h[:, ::-1]
        else:
            h = np.column_stack([rng.uniform(0.04, 0.96, m), rng.uniform(0.04, 0.48, m)])
            mir = np.column_stack([h[:, 0], 1 - h[:, 1]])
        extra = np.array([[0.5, 0.5]]) if mode != 1 else np.array([[0.5, 0.5]])
        pts = np.vstack([h, mir, np.tile(extra, (n - 2 * m, 1))])
        x = np.zeros((n, 3))
        x[:, :2] = np.clip(pts + rng.normal(0, 0.003, pts.shape), 0.02, 0.98)
        x[:, 2] = 0.06
        return x.ravel()
    for _ in range(100):
        go(sym())
    while used < 150:
        sig = 0.03 * (150 - used) / 50 + 0.002
        s, x = pool[0] if rng.random() < 0.6 else pool[int(rng.integers(len(pool)))]
        y = x.reshape(n, 3).copy()
        y[:, :2] += rng.normal(0, sig, (n, 2))
        y[:, 2] *= 0.9
        go(y.ravel())
    return pool[0][1]
