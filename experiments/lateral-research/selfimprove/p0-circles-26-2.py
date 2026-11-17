def search(problem, rng, polish):
    n = problem.n
    while True:
        P = np.zeros((0, 3))
        for _ in range(n):
            C = rng.uniform(0, 1, (400, 2))
            gap = np.minimum(np.minimum(C[:, 0], 1 - C[:, 0]),
                             np.minimum(C[:, 1], 1 - C[:, 1]))
            if len(P):
                d = np.sqrt(((C[:, None, :] - P[None, :, :2]) ** 2).sum(-1)) - P[:, 2]
                gap = np.minimum(gap, d.min(1))
            top = np.argsort(-gap)[:3]
            i = rng.choice(top)
            r = max(gap[i], 0.01) * rng.uniform(0.7, 1.0)
            P = np.vstack([P, [C[i, 0], C[i, 1], r]])
        polish(P.ravel())
