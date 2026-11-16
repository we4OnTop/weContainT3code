def search(problem, rng, polish):
    n = problem.n
    T = [(i, j, k) for i in range(n) for j in range(i + 1, n) for k in range(j + 1, n)]
    I, J, K = (np.array(t) for t in zip(*T))
    def proj(P):
        P = np.clip(P, 0, 1)
        e = np.maximum(P.sum(1) - 1, 0) / 2
        return np.clip(P - e[:, None], 0, 1)
    def cr(P):
        A, B, C = P[I], P[J], P[K]
        return A, B, C, (B[:, 0] - A[:, 0]) * (C[:, 1] - A[:, 1]) - (C[:, 0] - A[:, 0]) * (B[:, 1] - A[:, 1])
    while True:
        P = proj(np.array(problem.random(rng), float).reshape(n, 2))
        bestP, bestm = P.copy(), 0.0
        lr = 0.02
        for rnd in range(50):
            m0 = np.abs(cr(P)[3]).min()
            if m0 > bestm:
                bestm, bestP = m0, P.copy()
            t = m0 * 1.08 + 1e-4
            for s in range(40):
                A, B, C, c = cr(P)
                w = np.maximum(t - np.abs(c), 0) * np.sign(c)
                g = np.zeros_like(P)
                np.add.at(g, I, np.stack([B[:, 1] - C[:, 1], C[:, 0] - B[:, 0]], 1) * w[:, None])
                np.add.at(g, J, np.stack([C[:, 1] - A[:, 1], A[:, 0] - C[:, 0]], 1) * w[:, None])
                np.add.at(g, K, np.stack([A[:, 1] - B[:, 1], B[:, 0] - A[:, 0]], 1) * w[:, None])
                P = proj(P + lr * g / (np.linalg.norm(g) + 1e-12))
            lr = max(lr * 0.95, 0.002)
        polish(bestP.ravel())
