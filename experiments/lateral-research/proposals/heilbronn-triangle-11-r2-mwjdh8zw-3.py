def search(problem, rng, polish):
    n = problem.n
    def f(P):
        best = np.inf
        for i in range(n):
            for j in range(i+1, n):
                a = np.abs((P[j, 0]-P[i, 0])*(P[:, 1]-P[i, 1]) - (P[j, 1]-P[i, 1])*(P[:, 0]-P[i, 0]))
                a = np.delete(a, [i, j])
                best = min(best, a.min())
        return best
    def make():
        k = int(rng.integers(2, 4))
        pts = []
        for _ in range(k):
            u = rng.dirichlet([1, 1, 1])
            x, y, z = u
            pts += [[x, y], [y, z], [z, x]]
        if rng.random() < 0.5 and len(pts) + 1 <= n:
            pts.append([1/3, 1/3])
        P = np.array(pts)
        extra = n - len(P)
        if extra > 0:
            E = np.array([problem.random(rng)[:2] for _ in range(extra)])
            P = np.vstack([P, E])
        return P[:n] + rng.normal(0, 0.003, (n, 2))
    best = (-1, None)
    for _ in range(300):
        cands = []
        for _ in range(60):
            P = np.clip(make(), 0, 1)
            s = P.sum(1)
            m = s > 1
            P[m] /= s[m, None]
            cands.append((f(P), P))
        P = max(cands, key=lambda t: t[0])[1]
        r = polish(P.ravel())
        if r[0] > best[0]:
            best = r
    return best
