def search(problem, rng, polish):
    n = problem.n
    T = [(i, j, k) for i in range(n) for j in range(i + 1, n) for k in range(j + 1, n)]
    I, J, K = (np.array(t) for t in zip(*T))
    def proj(P):
        P = np.clip(P, 0, 1)
        e = np.maximum(P.sum(1) - 1, 0) / 2
        return np.clip(P - e[:, None], 0, 1)
    def ascend(P, steps=400):
        for s in range(steps):
            beta = 20 * (40 ** (s / steps))
            A, B, C = P[I], P[J], P[K]
            c = (B[:, 0] - A[:, 0]) * (C[:, 1] - A[:, 1]) - (C[:, 0] - A[:, 0]) * (B[:, 1] - A[:, 1])
            a = np.abs(c)
            w = np.exp(-beta * (a - a.min()))
            w = w / w.sum() * np.sign(c)
            g = np.zeros_like(P)
            np.add.at(g, I, np.stack([B[:, 1] - C[:, 1], C[:, 0] - B[:, 0]], 1) * w[:, None])
            np.add.at(g, J, np.stack([C[:, 1] - A[:, 1], A[:, 0] - C[:, 0]], 1) * w[:, None])
            np.add.at(g, K, np.stack([A[:, 1] - B[:, 1], B[:, 0] - A[:, 0]], 1) * w[:, None])
            P = proj(P + 0.02 * (1 - s / steps) * g / (np.linalg.norm(g) + 1e-12))
        return P
    while True:
        x = problem.random(rng)
        P = ascend(np.array(x, float).reshape(n, 2).copy())
        polish(P.ravel())
