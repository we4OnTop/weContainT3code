def search(problem, rng, polish):
    n = problem.n
    h = n // 2
    pool = []
    used = 0
    def P(x):
        nonlocal used
        used += 1
        s, y = polish(x)
        pool.append((s, np.array(y)))
    def expand(A, mode):
        if mode == 0:
            B = 1 - A
        elif mode == 1:
            B = np.column_stack([1 - A[:, 0], A[:, 1]])
        else:
            B = A[:, ::-1]
        return np.vstack([A, B])
    eye = np.eye(n)
    def relax(A, mode, steps):
        r = 0.03
        for _ in range(steps):
            C = expand(A, mode)
            D = C[:, None] - C[None]
            d = np.sqrt((D ** 2).sum(-1)) + eye
            ov = np.maximum(0, 2 * r - d)
            np.fill_diagonal(ov, 0)
            F = 0.5 * ((ov / d)[:, :, None] * D).sum(1)
            A = np.clip(A + F[:h], r, 1 - r)
            r *= 1.01 if ov.max() < 1e-4 else 0.995
        return A, r
    while used < 112:
        mode = int(rng.integers(0, 3))
        A = rng.random((h, 2))
        A, r = relax(A, mode, int(rng.integers(200, 500)))
        C = expand(A, mode)
        P(np.column_stack([C, np.full(n, r * 0.97)]).ravel())
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
