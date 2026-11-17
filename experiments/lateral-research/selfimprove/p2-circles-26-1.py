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
    def rings():
        c = 0.5 + rng.normal(0, 0.03, 2)
        left = n
        pts = []
        if rng.random() < 0.6:
            pts.append(c.copy())
            left -= 1
        R = 0.0
        while left > 0:
            R += rng.uniform(0.13, 0.2)
            m = min(left, max(3, int(round(2 * np.pi * R / rng.uniform(0.16, 0.22)))))
            ph = rng.uniform(0, 2 * np.pi)
            for k in range(m):
                a = ph + 2 * np.pi * k / m
                pts.append(c + R * np.array([np.cos(a), np.sin(a)]))
            left -= m
        pts = np.clip(np.array(pts[:n]), 0.04, 0.96)
        x = np.zeros((n, 3))
        x[:, :2] = pts + rng.normal(0, 0.005, pts.shape)
        x[:, 2] = 0.07
        return x.ravel()
    for _ in range(100):
        go(rings())
    while used < 150:
        s, x = pool[0] if rng.random() < 0.6 else pool[int(rng.integers(len(pool)))]
        y = x.reshape(n, 3).copy()
        i, j = rng.choice(n, 2, replace=False)
        if rng.random() < 0.5:
            y[[i, j], :2] = y[[j, i], :2]
            y[[i, j], 2] = 0.03
        else:
            y[[i, j], 2], y[i, :2] = y[[j, i], 2], y[j, :2] + rng.normal(0, 0.02, 2)
            y[:, 2] *= 0.8
        go(y.ravel())
    return pool[0][1]
