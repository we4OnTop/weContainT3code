def search(problem, rng, polish):
    n = problem.n
    best, bx = -1, None
    while True:
        m = int(rng.integers(4, 8))
        counts = np.full(m, n // m)
        counts[rng.choice(m, n - counts.sum(), replace=False)] += 1
        pts = []
        for i, c in enumerate(counts):
            y = (i + 0.5) / m
            off = 0.0 if i % 2 == 0 else 0.5 / c * rng.uniform(0, 1)
            for j in range(c):
                pts.append(((j + 0.5) / c * (1 - off) + off / 2, y))
        pts = np.array(pts) + rng.normal(0, 0.01, (n, 2))
        pts = np.clip(pts, 0.02, 0.98)
        r = np.full(n, 0.4 / max(counts)) * rng.uniform(0.7, 1.0, n)
        x = np.column_stack([pts, r]).ravel()
        if bx is not None and rng.random() < 0.4:
            x = bx + rng.normal(0, 0.02, x.size)
        s, xp = polish(x)
        if s > best:
            best, bx = s, xp
