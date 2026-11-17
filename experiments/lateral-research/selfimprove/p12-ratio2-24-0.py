def search(problem, rng, polish):
    n = problem.n
    g = np.arange(-8, 9)
    A, B = np.meshgrid(g, g)
    L = np.stack([A.ravel() + 0.5 * B.ravel(), B.ravel() * np.sqrt(3) / 2], 1)
    best = -np.inf
    while True:
        t = rng.uniform(0, 2 * np.pi)
        R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
        P = L @ R.T + rng.uniform(-0.5, 0.5, 2)
        c = rng.uniform(-0.7, 0.7, 2)
        s = np.array([1.0, rng.uniform(0.85, 1.15)])
        d = np.linalg.norm((P - c) * s, axis=1)
        idx = np.argsort(d)[:n]
        X = P[idx] + rng.normal(0, 0.05, (n, 2))
        sc, x = polish(X.ravel())
        best = max(best, sc)
