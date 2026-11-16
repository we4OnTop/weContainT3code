def search(problem, rng, polish):
    n = problem.n
    def grad(X, p):
        d = X[:, None] - X[None]
        r2 = (d ** 2).sum(-1) + np.eye(n)
        r = np.sqrt(r2)
        m = 1 - np.eye(n)
        a = r ** p * m
        b = r ** -p * m
        w = a / a.sum() - b / b.sum()
        return ((w / r2)[:, :, None] * d).sum(1)
    while True:
        X = rng.normal(size=(n, 4))
        T = 600
        for t in range(T):
            p = 4 + 28 * t / T
            g = grad(X, p)
            s = np.sqrt(((X - X.mean(0)) ** 2).sum(1).mean()) + 1e-9
            lr = 0.04 * s * (1 - t / T) + 0.002 * s
            X = X - lr * g / (np.abs(g).max() + 1e-12)
            if t > T // 3:
                X[:, 3] *= 0.97  # squeeze out the 4th dimension
        X[:, 3] = 0
        polish(X[:, :3].ravel())
