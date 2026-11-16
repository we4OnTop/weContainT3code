def search(problem, rng, polish):
    n = problem.n
    t = np.linspace(0.008, 0.992, 64)
    G = np.stack(np.meshgrid(t, t), -1).reshape(-1, 2)
    while True:
        P = rng.random((n, 2))
        for _ in range(int(rng.integers(3, 40))):
            a = ((G[:, None] - P[None]) ** 2).sum(-1).argmin(1)
            for i in range(n):
                m = a == i
                if m.any():
                    P[i] = G[m].mean(0)
        D = np.sqrt(((P[:, None] - P[None]) ** 2).sum(-1)) + np.eye(n) * 9
        b = np.minimum(P, 1 - P).min(1)
        r = 0.9 * np.minimum(D.min(1) / 2, b)
        polish(np.column_stack((P, r)).ravel())
