def search(problem, rng, polish):
    n = problem.n
    while True:
        a = rng.uniform(1.0, 1.4)
        b = 1.0 / a
        m = rng.integers(2, 5)
        cuts = np.sort(rng.choice(np.arange(1, n), m - 1, replace=False))
        counts = np.diff(np.concatenate([[0], cuts, [n]]))
        rows = []
        for r_i, cnt in enumerate(counts[::-1]):
            f = 1.0 - r_i * rng.uniform(0.25, 0.4)
            f = max(f, 0.0)
            if r_i == len(counts) - 1 and cnt <= 2:
                f = 0.0
            th0 = rng.uniform(0, 2 * np.pi)
            for k in range(cnt):
                t = th0 + 2 * np.pi * k / cnt
                rad = 0.9 * min(0.5, np.pi * f / max(cnt, 1)) if f > 0 else 0.2
                rows.append([0.85 * f * a * np.cos(t), 0.85 * f * b * np.sin(t), 0.5 * rad])
        rows = np.array(rows[:n])
        while len(rows) < n:
            rows = np.vstack([rows, [rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0.02]])
        rows[:, :2] += rng.normal(0, 0.01, (n, 2))
        polish(np.concatenate([rows.ravel(), [a]]))
