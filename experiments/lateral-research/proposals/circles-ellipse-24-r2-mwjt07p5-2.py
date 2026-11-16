def search(problem, rng, polish):
    n = problem.n
    while True:
        a = rng.uniform(1.0, 1.4)
        lo, hi = 0.0, 1.5
        for _ in range(60):
            m = (lo + hi) / 2
            P = np.pi * (3 * (a + m) - np.sqrt((3 * a + m) * (a + 3 * m)))
            if P > 2 * np.pi:
                hi = m
            else:
                lo = m
        b = (lo + hi) / 2
        S = rng.uniform(-1, 1, (6000, 2)) * [a, b]
        S = S[(S[:, 0] / a) ** 2 + (S[:, 1] / b) ** 2 < 1]
        C = S[rng.choice(len(S), n, replace=False)]
        for _ in range(int(rng.integers(2, 12))):
            d = ((S[:, None, :] - C[None]) ** 2).sum(2)
            lab = d.argmin(1)
            for c in range(n):
                q = S[lab == c]
                if len(q):
                    C[c] = q.mean(0)
        D = np.sqrt(((C[:, None] - C[None]) ** 2).sum(2)) + np.eye(n) * 9
        r = 0.5 * D.min(1) * rng.uniform(0.6, 0.95)
        x = np.zeros(3 * n + 1)
        x[0:3 * n:3] = C[:, 0]
        x[1:3 * n:3] = C[:, 1]
        x[2:3 * n:3] = r
        x[-1] = a
        polish(x)
