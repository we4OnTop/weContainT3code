def search(problem, rng, polish):
    n = problem.n; B = 150; E = 112; st = [0]; pool = []
    def run(x):
        st[0] += 1
        s, y = polish(np.asarray(x, float).ravel())
        if np.isfinite(s) and np.all(np.isfinite(y)):
            for i, (ps, py) in enumerate(pool):
                if abs(ps - s) < 1e-9 * max(1.0, abs(s)):
                    if s > ps: pool[i] = (s, y)
                    break
            else:
                pool.append((s, y))
            pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, y
    def finish():
        while st[0] < B and pool:
            imp = False
            for s0, x0 in list(pool):
                if st[0] >= B: return
                s, _ = run(x0)
                if s - s0 > 1e-13: imp = True
            if not imp: return
    def rot(v, u, t):
        c = np.cos(t); s = np.sin(t)
        return v * c + np.cross(u, v) * s + np.outer(v @ u, u) * (1 - c)
    for _ in range(3): run(problem.random(rng))
    while st[0] < E:
        if not pool:
            run(problem.random(rng)); continue
        P = (pool[0][1] if rng.random() < .8 else pool[rng.integers(len(pool))][1]).reshape(n, 3).copy()
        cm = P.mean(0)
        D = np.linalg.norm(P[:, None] - P[None], axis=2); np.fill_diagonal(D, np.inf)
        s = max(D.min(), 1e-6)
        u = rng.normal(size=3); u /= np.linalg.norm(u)
        pr = (P - cm) @ u; k = rng.integers(4)
        if k == 0:
            m = pr > np.quantile(pr, rng.uniform(.2, .8))
            v = np.cross(u, rng.normal(size=3)); v /= np.linalg.norm(v)
            P[m] += v * s * rng.uniform(.3, .8)
        elif k == 1:
            m = np.abs(pr - pr[rng.integers(n)]) < .6 * s
            P[m] = cm + rot(P[m] - cm, u, rng.uniform(.3, 1.2))
        elif k == 2:
            i, j = rng.choice(n, 2, replace=False)
            ri = max(np.linalg.norm(P[i] - cm), 1e-9); rj = max(np.linalg.norm(P[j] - cm), 1e-9)
            pi_, pj = P[i].copy(), P[j].copy()
            P[i] = cm + (pi_ - cm) * rj / ri; P[j] = cm + (pj - cm) * ri / rj
        else:
            P += rng.normal(size=P.shape) * .15 * s
        run(P.ravel())
    finish()
    return pool[0] if pool else None
