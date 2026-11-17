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
    def fill(P):
        while len(P) < n:
            c = P.mean(0)
            ext = np.linalg.norm(P - c, axis=1).max() * 1.1 + .5
            C = rng.normal(size=(500, 3))
            C = c + C / np.linalg.norm(C, axis=1, keepdims=True) * ext * rng.random((500, 1)) ** (1 / 3)
            md = np.linalg.norm(C[:, None] - P[None], axis=2).min(1)
            sc = md - .05 * np.linalg.norm(C - c, axis=1)
            P = np.vstack([P, C[np.argmax(sc)]])
        return P
    cur = None; cs = -np.inf; fails = 0
    while calls[0] < 112:
        if cur is None or fails > 8:
            s, y = run(fill(rng.normal(size=(4, 3))).ravel())
            cur, cs, fails = y, s, 0
            continue
        P = cur.reshape(n, 3)
        D = np.linalg.norm(P[:, None] - P[None], axis=2) + np.eye(n) * 1e9
        i, j = np.unravel_index(np.argmin(D), D.shape)
        drop = i if rng.random() < .5 else j
        s, y = run(fill(np.delete(P, drop, 0)).ravel())
        if s > cs + 1e-13:
            cur, cs, fails = y, s, 0
        else:
            fails += 1
    while calls[0] < 150:
        j = calls[0] % len(pool)
        run(pool[j][1], j)
    return pool[0]
