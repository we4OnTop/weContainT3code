def search(problem, rng, polish):
    n = problem.n
    while True:
        R = int(rng.integers(4, 7))
        counts = np.full(R, n // R)
        for i in rng.choice(R, n - counts.sum(), replace=False):
            counts[i] += 1
        rng.shuffle(counts)
        base = 0.5 / counts.max()
        pts = []
        off = rng.integers(2)
        for i, c in enumerate(counts):
            yy = (i + 0.5) / R
            span = 1.0 - 2 * base
            shift = base * 0.5 * ((i + off) % 2) if c == counts.max() - 1 else 0
            xs = (np.arange(c) + 0.5) / c
            for xx in xs:
                pts.append((xx + shift * 0, yy))
        P = np.array(pts)[:n]
        P += rng.normal(0, rng.choice([0.005, 0.02, 0.04]), P.shape)
        P = np.clip(P, 0.02, 0.98)
        r = base * (0.5 + 0.5 * rng.random(len(P)))
        y = np.column_stack([P, r])
        polish(y.ravel())
