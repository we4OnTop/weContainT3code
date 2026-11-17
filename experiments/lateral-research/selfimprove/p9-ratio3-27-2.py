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
    def gap(P):
        cm = P.mean(0); R = np.linalg.norm(P - cm, axis=1).max() + 1.0
        d = rng.normal(size=(500, 3)); d /= np.linalg.norm(d, axis=1)[:, None]
        C = cm + d * R * rng.uniform(0, 1, (500, 1)) ** (1 / 3)
        m = np.linalg.norm(C[:, None] - P[None], axis=2).min(1)
        return C[np.argmax(m - rng.uniform(.05, .3) * np.linalg.norm(C - cm, axis=1))]
    def build():
        u = rng.normal(size=3); u /= np.linalg.norm(u)
        P = np.array([[0, 0, 0.], u])
        while len(P) < n: P = np.vstack([P, gap(P)])
        return P
    for _ in range(5): run(build().ravel())
    while st[0] < E:
        if not pool:
            run(build().ravel()); continue
        base = pool[0][1] if (rng.random() < .7 or len(pool) < 2) else pool[rng.integers(len(pool))][1]
        P = base.reshape(n, 3)
        D = np.linalg.norm(P[:, None] - P[None], axis=2); np.fill_diagonal(D, np.inf)
        if rng.random() < .5:
            i = np.argsort(D.min(1))[rng.integers(3)]
        else:
            i = np.unravel_index(np.argmax(np.where(np.isinf(D), -1, D)), D.shape)[rng.integers(2)]
        Q = np.delete(P, i, 0)
        run(np.vstack([Q, gap(Q)]).ravel())
    finish()
    return pool[0] if pool else None
