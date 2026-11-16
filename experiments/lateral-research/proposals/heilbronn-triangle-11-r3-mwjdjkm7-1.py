def search(problem, rng, polish):
    n = problem.n
    T = [(i, j, k) for i in range(n) for j in range(i + 1, n) for k in range(j + 1, n)]
    I, J, K = (np.array(t) for t in zip(*T))
    def fix(X):
        P = np.clip(X.reshape(len(X), n, 2), 0, 1)
        e = np.maximum(P.sum(2) - 1, 0) / 2
        return np.clip(P - e[:, :, None], 0, 1)
    def score(P):
        A, B, C = P[:, I], P[:, J], P[:, K]
        c = (B[..., 0] - A[..., 0]) * (C[..., 1] - A[..., 1]) - (C[..., 0] - A[..., 0]) * (B[..., 1] - A[..., 1])
        return np.abs(c).min(1)
    while True:
        m = np.array(problem.random(rng), float)
        s = np.full(problem.dim, 0.2)
        best = None
        for g in range(70):
            P = fix(m + s * rng.standard_normal((200, problem.dim)))
            f = score(P)
            idx = np.argsort(-f)[:20]
            E = P[idx].reshape(20, -1)
            m = E.mean(0)
            s = E.std(0) + 1e-3
            best = E[0]
        polish(best)
