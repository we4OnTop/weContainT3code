def search(problem, rng, polish):
    n = problem.n
    while True:
        k = int(rng.integers(14, n + 1))
        v = rng.normal(size=(n, 3))
        v /= np.linalg.norm(v, axis=1, keepdims=True)
        r = np.ones(n)
        r[k:] = rng.uniform(0.0, 0.5, n - k) ** (1 / 3)
        P = v * r[:, None] * rng.uniform(0.9, 1.1, (n, 1))
        polish(P.ravel())
