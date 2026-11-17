def search(problem, rng, polish):
    n = problem.n
    TOTAL, used, pool = 150, [0], []
    def P(x):
        used[0] += 1
        s, y = polish(x)
        for i, (t, _) in enumerate(pool):
            if abs(s - t) < 1e-9:
                if s > t:
                    pool[i] = (s, y)
                break
        else:
            pool.append((s, y))
        pool.sort(key=lambda a: -a[0])
        del pool[3:]
        return s, y
    def finish():
        for s, x in list(pool):
            while used[0] < TOTAL:
                s2, x2 = P(x)
                if s2 <= s + 1e-13:
                    break
                s, x = s2, x2
        return pool[0]
    def dists(Q):
        return np.sqrt(((Q[:, None] - Q[None]) ** 2).sum(-1))
    def ins(Q):
        d = dists(Q)[np.triu_indices(len(Q), 1)]
        lo, hi = max(d.min(), 1e-9), d.max()
        a = rng.uniform(0, 2 * np.pi, 500)
        r = hi / 2 * np.sqrt(rng.random(500))
        C = Q.mean(0) + np.stack([r * np.cos(a), r * np.sin(a)], 1)
        dc = np.sqrt(((C[:, None] - Q[None]) ** 2).sum(-1))
        q = np.maximum(hi, dc.max(1)) / np.maximum(np.minimum(lo, dc.min(1)), 1e-9)
        return np.vstack([Q, C[q.argmin()]])
    def build():
        Q = rng.random((3, 2))
        while len(Q) < n:
            Q = ins(Q)
        return Q
    for _ in range(3):
        P(build().ravel())
    it = 0
    while used[0] < TOTAL - 38:
        it += 1
        x = pool[int(rng.integers(len(pool)))][1]
        Q = x.reshape(-1, 2)
        D = dists(Q)
        np.fill_diagonal(D, np.inf if it % 2 else -np.inf)
        i, j = np.unravel_index(D.argmin() if it % 2 else D.argmax(), D.shape)
        Q = np.delete(Q, i if rng.random() < 0.5 else j, 0)
        P(ins(Q).ravel())
    return finish()
