def search(problem, rng, polish):
    n = problem.n
    T = np.array([(i, j, k) for i in range(n) for j in range(i + 1, n) for k in range(j + 1, n)])
    def sc(P):
        a, b, c = P[:, T[:, 0]], P[:, T[:, 1]], P[:, T[:, 2]]
        cr = (b[..., 0] - a[..., 0]) * (c[..., 1] - a[..., 1]) - (c[..., 0] - a[..., 0]) * (b[..., 1] - a[..., 1])
        return np.abs(cr).min(axis=1)
    while True:
        B = 3000
        P = np.array([problem.random(rng) for _ in range(B)]).reshape(B, n, 2)
        s = sc(P)
        for it in range(150):
            Q = P.copy()
            idx = rng.integers(0, n, B)
            Q[np.arange(B), idx] += rng.normal(0, 0.05, (B, 2))
            ok = (Q >= 0).all(axis=(1, 2)) & (Q.sum(axis=2) <= 1).all(axis=1)
            s2 = sc(Q)
            m = ok & (s2 > s)
            P[m], s[m] = Q[m], s2[m]
        for i in np.argsort(-s)[:20]:
            polish(P[i].ravel())
