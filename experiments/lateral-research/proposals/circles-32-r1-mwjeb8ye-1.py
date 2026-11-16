def search(problem, rng, polish):
    n = problem.n
    best, bx = -1e9, None
    for _ in range(300):
        m = int(rng.integers(4, 8))
        counts = np.ones(m, dtype=int)
        for _ in range(n - m):
            counts[rng.integers(m)] += 1
        pts = []
        stagger = rng.random() < 0.5
        for j, c in enumerate(counts):
            off = 0.5 * (j % 2) / c if stagger else 0.0
            for i in range(c):
                x = (i + 0.5 + off) / (c + (0.5 if stagger else 0.0))
                pts.append((x, (j + 0.5) / m, 0.45 / max(m, c)))
        y = np.array(pts, dtype=float)
        y[:, :2] += rng.normal(0, 0.02, (n, 2))
        y[:, :2] = np.clip(y[:, :2], 0.02, 0.98)
        s, x = polish(y.ravel())
        if s > best:
            best, bx = s, x
    return bx
