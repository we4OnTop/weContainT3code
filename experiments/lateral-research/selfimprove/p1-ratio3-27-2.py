def search(problem, rng, polish):
    n = problem.n
    while True:
        p = rng.choice([2, 4, 8, 16, 32])
        y = rng.normal(size=(n, 3))
        y /= np.maximum(1.0, np.linalg.norm(y, axis=1, keepdims=True))
        for _ in range(300):
            diff = y[:, None] - y[None]
            d2 = (diff ** 2).sum(2) + np.eye(n)
            g = (diff / d2[..., None] ** ((p + 2) / 2)).sum(1)
            y += 0.03 * g / (np.abs(g).max() + 1e-12)
            y /= np.maximum(1.0, np.linalg.norm(y, axis=1, keepdims=True))
        polish(y.ravel())
