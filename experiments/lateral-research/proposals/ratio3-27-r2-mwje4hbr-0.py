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
    best = -np.inf
    while True:
        X = problem.random(rng).reshape(n, 3)
        X = X - X.mean(0)
        for p in (2, 4, 8, 16, 32, 64):
            for t in range(150):
                g = grad(X, p)
                s = np.sqrt(((X - X.mean(0)) ** 2).sum(1).mean()) + 1e-9
                lr = 0.05 * s * (1 - t / 150) + 0.002 * s
                X = X - lr * g / (np.abs(g).max() + 1e-12)
        sc, x = polish(X.ravel())
        best = max(best, sc)
