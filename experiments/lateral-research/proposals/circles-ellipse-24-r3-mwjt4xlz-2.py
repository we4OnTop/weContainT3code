def search(problem, rng, polish):
    n = problem.n
    best, bx = polish(problem.random(rng))
    while True:
        x = np.array(bx, dtype=float)
        s = rng.choice([0.05, 0.1, 0.2, 0.35])
        M = np.eye(2) + rng.normal(0, s, (2, 2))
        c = x[:3*n].reshape(n, 3)
        c[:, :2] = c[:, :2] @ M.T
        c[:, 2] *= 0.85
        x[:3*n] = c.ravel()
        x[-1] = np.clip(x[-1] + rng.normal(0, 0.03), 1, 1.5)
        sc, xn = polish(x)
        if sc > best:
            best, bx = sc, xn
        elif rng.random() < 0.05:
            sc, bx = polish(problem.random(rng))
            best = sc
