def search(problem, rng, polish):
    n = problem.n
    pool = []
    used = 0
    def P(x):
        nonlocal used
        used += 1
        s, y = polish(x)
        pool.append((s, np.array(y)))
    eye = np.eye(n)
    def grow(C, steps):
        r = 0.03
        for _ in range(steps):
            D = C[:, None] - C[None]
            d = np.sqrt((D ** 2).sum(-1)) + eye
            ov = np.maximum(0, 2 * r - d)
            np.fill_diagonal(ov, 0)
            C = C + 0.5 * ((ov / d)[:, :, None] * D).sum(1)
            C = np.clip(C, r, 1 - r)
            r *= 1.01 if ov.max() < 1e-4 else 0.995
        return C, r
    while used < 112:
        C = rng.random((n, 2))
        steps = int(rng.integers(150, 500))
        C, r = grow(C, steps)
        rad = r * 0.97 * (1 + rng.normal(0, 0.03, n))
        P(np.column_stack([C, np.clip(rad, 0.01, None)]).ravel())
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
