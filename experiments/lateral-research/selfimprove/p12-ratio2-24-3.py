def search(problem, rng, polish):
    n = problem.n
    pool = []
    for _ in range(6):
        s, x = polish(problem.random(rng))
        pool.append((s, x.reshape(n, 2)))
    while True:
        i, j = rng.choice(len(pool), 2, replace=False)
        A, B = pool[i][1], pool[j][1]
        A = A - A.mean(0)
        B = B - B.mean(0)
        t = rng.uniform(0, 2 * np.pi)
        R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
        B = B @ R.T
        if rng.random() < 0.5:
            B = B * np.array([1, -1])
        sa = A.max() - A.min()
        sb = B.max() - B.min()
        B = B * (sa / sb)
        u = rng.normal(size=2)
        u /= np.linalg.norm(u)
        c = rng.uniform(-0.3, 0.3) * sa
        fa = A[A @ u > c]
        fb = B[B @ u <= c]
        X = np.concatenate([fa, fb])
        if len(X) > n:
            X = X[rng.permutation(len(X))[:n]]
        while len(X) < n:
            X = np.vstack([X, X[rng.integers(len(X))] + rng.normal(0, 0.1 * sa, 2)])
        X = X + rng.normal(0, 0.02 * sa, X.shape)
        s, x = polish(X.ravel())
        pool.append((s, x.reshape(n, 2)))
        pool.sort(key=lambda p: -p[0])
        pool = pool[:8]
