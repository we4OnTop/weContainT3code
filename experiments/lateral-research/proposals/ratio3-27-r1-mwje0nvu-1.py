def search(problem, rng, polish):
    n = problem.n
    best = (-np.inf, None)
    while True:
        k = int(rng.choice([2, 3, 4, 5, 6, 9, 13]))
        flip = int(rng.integers(0, 2))
        g = k * (1 + flip)
        opts = [e for e in range(4) if (n - e) % g == 0]
        if not opts:
            flip = 0
            g = k
            opts = [e for e in range(4) if (n - e) % g == 0]
            if not opts:
                continue
        e = int(rng.choice(opts))
        m = (n - e) // g
        pts = []
        for _ in range(m):
            p = rng.normal(size=3)
            p = p / np.linalg.norm(p) * rng.uniform(0.3, 1.0)
            for j in range(k):
                a = 2 * np.pi * j / k
                c, s = np.cos(a), np.sin(a)
                q = np.array([c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]])
                pts.append(q)
                if flip:
                    pts.append(q * np.array([1, 1, -1]))
        for _ in range(e):
            pts.append(np.array([0, 0, rng.uniform(-1, 1)]))
        x = np.array(pts) + rng.normal(scale=0.02, size=(n, 3))
        sc, xp = polish(x.ravel())
        if sc > best[0]:
            best = (sc, xp)
    return best
