def search(problem, rng, polish):
    n = problem.n
    pool = []; calls = [0]
    def run(x, j=None):
        calls[0] += 1
        s, y = polish(x)
        if np.isfinite(s):
            if j is not None:
                if s > pool[j][0]: pool[j] = (s, y)
            elif all(abs(s - p[0]) > 1e-9 for p in pool):
                pool.append((s, y)); pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s
    def fib(m):
        if m == 1: return np.array([[0, 0, 1.0]])
        i = np.arange(m) + .5
        z = 1 - 2 * i / m; ph = np.pi * (1 + 5 ** .5) * i
        rr = np.sqrt(1 - z * z)
        return np.stack([rr * np.cos(ph), rr * np.sin(ph), z], 1)
    while calls[0] < 112:
        c0 = int(rng.integers(0, 2))
        k = int(rng.integers(2, 5))
        rem = n - c0
        cuts = np.sort(rng.choice(np.arange(1, rem), k - 1, replace=False))
        counts = np.diff(np.concatenate([[0], cuts, [rem]]))
        counts.sort()
        pts = [np.zeros((1, 3))] if c0 else []
        cum = c0
        for m in counts:
            cum += m
            rad = (cum / 1.5) ** (1 / 3) * (1 + rng.normal(scale=.05))
            R, _ = np.linalg.qr(rng.normal(size=(3, 3)))
            pts.append(rad * fib(int(m)) @ R)
        run(np.vstack(pts).ravel())
    while calls[0] < 150:
        j = calls[0] % len(pool)
        run(pool[j][1], j)
    return pool[0]
