def search(problem, rng, polish):
    n = problem.n
    while True:
        k = int(rng.integers(4, 8))
        counts = np.full(k, n // k)
        counts[rng.choice(k, n % k, replace=False)] += 1
        rng.shuffle(counts)
        rad = 0.5 / max(k, counts.max()) * 0.9
        pts = []
        for i, c in enumerate(counts):
            off = 0.5 / c * (i % 2) * rng.uniform(0, 1)
            for j in range(c):
                pts.append([(j + 0.5) / c * (1 - 0.5 / c) + off + 0.25 / c,
                            (i + 0.5) / k, rad])
        a = np.array(pts)
        a[:, :2] += rng.normal(0, 0.02, (n, 2))
        a[:, :2] = np.clip(a[:, :2], 0.02, 0.98)
        polish(a.ravel())
