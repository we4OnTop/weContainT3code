def search(problem, rng, polish):
    n = problem.n
    I = np.array([(i, j, k) for i in range(n) for j in range(i+1, n) for k in range(j+1, n)])
    def f(P):
        a, b, c = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
        return np.abs((b[:, 0]-a[:, 0])*(c[:, 1]-a[:, 1]) - (b[:, 1]-a[:, 1])*(c[:, 0]-a[:, 0])).min()
    def fix(p):
        p = np.clip(p, 0, 1)
        s = p.sum()
        return p / s if s > 1 else p
    best = (-1, None)
    for _ in range(300):
        P = problem.random(rng).reshape(n, 2).copy()
        cur = f(P)
        T0, T1, steps = 0.02, 0.0003, 6000
        for t in range(steps):
            T = T0 * (T1 / T0) ** (t / steps)
            i = rng.integers(n)
            old = P[i].copy()
            sc = 0.02 + 0.2 * T / T0
            P[i] = fix(old + rng.normal(0, sc, 2))
            v = f(P)
            if v >= cur or rng.random() < np.exp((v - cur) / T):
                cur = v
            else:
                P[i] = old
        s, x = polish(P.ravel())
        if s > best[0]:
            best = (s, x)
    return best
