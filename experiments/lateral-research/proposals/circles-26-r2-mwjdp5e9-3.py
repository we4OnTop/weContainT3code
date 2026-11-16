def search(problem, rng, polish):
    n = problem.n
    pool = [polish(problem.random(rng)) for _ in range(10)]
    def sym(P, k):
        x, y = P[:, 0], P[:, 1]
        t = [(x, y), (1 - x, y), (x, 1 - y), (1 - x, 1 - y),
             (y, x), (1 - y, x), (y, 1 - x), (1 - y, 1 - x)][k]
        return np.column_stack(t)
    def match(A, B):
        used = np.zeros(n, bool)
        idx = np.zeros(n, int)
        tot = 0.0
        for i in np.argsort(-A[:, 2]):
            d = ((B[:, :2] - A[i, :2]) ** 2).sum(1)
            d[used] = 1e9
            j = int(np.argmin(d))
            used[j] = True
            idx[i] = j
            tot += d[j]
        return tot, idx
    while True:
        i, j = rng.choice(len(pool), 2, replace=False)
        A = pool[i][1].reshape(n, 3)
        B = pool[j][1].reshape(n, 3)
        bestm = None
        for k in range(8):
            Bk = B.copy()
            Bk[:, :2] = sym(B[:, :2], k)
            tot, idx = match(A, Bk)
            if bestm is None or tot < bestm[0]:
                bestm = (tot, Bk[idx])
        t = rng.uniform(0.25, 0.75)
        C = (1 - t) * A + t * bestm[1]
        C[:, :2] += rng.normal(0, 0.005, (n, 2))
        C[:, 2] *= 0.85
        s, x = polish(np.clip(C, 0.001, 0.999).ravel())
        w = min(range(len(pool)), key=lambda q: pool[q][0])
        if s > pool[w][0] and all(abs(s - p[0]) > 1e-8 for p in pool):
            pool[w] = (s, x)
