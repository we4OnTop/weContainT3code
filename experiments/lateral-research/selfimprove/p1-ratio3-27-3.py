def search(problem, rng, polish):
    n = problem.n
    pool = []
    for _ in range(6):
        s, x = polish(problem.random(rng))
        pool.append((s, x.reshape(n, 3).copy()))
    while True:
        def pick():
            a, b = rng.choice(len(pool), 2, replace=False)
            return pool[a] if pool[a][0] > pool[b][0] else pool[b]
        A = pick()[1]
        B = pick()[1]
        A = A - A.mean(0)
        B = B - B.mean(0)
        Q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        B = B @ Q
        B = B * (np.linalg.norm(A, axis=1).mean() / (np.linalg.norm(B, axis=1).mean() + 1e-12))
        u = rng.normal(size=3)
        u /= np.linalg.norm(u)
        k = int(rng.integers(8, n - 7))
        ia = np.argsort(A @ u)[:k]
        ib = np.argsort(B @ u)[k:]
        y = np.vstack([A[ia], B[ib]])
        y = y + rng.normal(size=y.shape) * 0.02
        s, x = polish(y.ravel())
        pool.append((s, x.reshape(n, 3).copy()))
        pool.sort(key=lambda t: -t[0])
        pool = pool[:10]
