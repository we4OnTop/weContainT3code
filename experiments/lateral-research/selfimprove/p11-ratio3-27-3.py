def search(problem, rng, polish):
    n = problem.n
    pool = []; calls = [0]
    def run(x, j=None):
        calls[0] += 1
        s, y = polish(x)
        if np.isfinite(s):
            if j is not None:
                if s > pool[j][0]: pool[j] = (s, y)
            elif all(abs(s - p[0]) > 1e-9 for p in pool):
                pool.append((s, y)); pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, y
    cs, cur = run(problem.random(rng))
    fails = 0
    while calls[0] < 112:
        P = cur.reshape(n, 3).copy()
        P -= P.mean(0)
        u = rng.normal(size=3); u /= np.linalg.norm(u)
        t = P @ u
        kind = int(rng.integers(3))
        if kind == 0:  # row/slab shift
            lo = rng.choice(t)
            m = np.abs(t - lo) < .3 * (t.max() - t.min()) / 3
            v = rng.normal(size=3); v -= v @ u * u
            P[m] += .5 * v * np.linalg.norm(P, axis=1).mean() * rng.random()
        elif kind == 1:  # ring rotation
            r = np.linalg.norm(P, axis=1)
            m = np.abs(r - rng.choice(r)) < .15 * r.max()
            a = rng.uniform(.2, 3.0)
            K = np.array([[0, -u[2], u[1]], [u[2], 0, -u[0]], [-u[1], u[0], 0]])
            Rm = np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K
            P[m] = P[m] @ Rm.T
        else:  # swap: outermost point jumps to a random interior spot
            r = np.linalg.norm(P, axis=1)
            i = int(np.argsort(r)[-1 - int(rng.integers(3))])
            P[i] = rng.normal(size=3) * r.mean() * .6
        s, y = run(P.ravel())
        if s > cs + 1e-13 or (fails > 6 and rng.random() < .3):
            cur, cs, fails = y, max(s, -np.inf), 0
        else:
            fails += 1
        if fails > 12:
            cs, cur = pool[0]; fails = 0
    while calls[0] < 150:
        j = calls[0] % len(pool)
        run(pool[j][1], j)
    return pool[0]
