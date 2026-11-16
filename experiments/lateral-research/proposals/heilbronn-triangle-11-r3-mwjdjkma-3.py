def search(problem, rng, polish):
    n = problem.n
    T = [(i, j, k) for i in range(n) for j in range(i + 1, n) for k in range(j + 1, n)]
    I, J, K = (np.array(t) for t in zip(*T))
    def score(P):
        A, B, C = P[:, I], P[:, J], P[:, K]
        c = (B[..., 0] - A[..., 0]) * (C[..., 1] - A[..., 1]) - (C[..., 0] - A[..., 0]) * (B[..., 1] - A[..., 1])
        return np.abs(c).min(1)
    def seed():
        k = int(rng.integers(3, 9))
        P = np.array(problem.random(rng), float).reshape(n, 2).copy()
        for i in range(k):
            e = int(rng.integers(0, 3))
            t = rng.random()
            P[i] = [(t, 0), (0, t), (t, 1 - t)][e]
        return P
    while True:
        S = np.stack([seed() for _ in range(400)])
        P = S[np.argmax(score(S))]
        s1, x1 = polish(P.ravel())
        Q = np.array(x1, float).reshape(n, 2).copy()
        Q[Q < 0.03] = 0.0
        h = Q.sum(1) > 0.97
        Q[h] -= ((Q[h].sum(1) - 1) / 2)[:, None]
        polish(np.clip(Q, 0, 1).ravel())
