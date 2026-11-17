def search(problem, rng, polish):
    n = problem.n
    st = {'c': 0}
    pool = []

    def sc(x):
        p = x.reshape(n, 3)
        d = np.sqrt(((p[:, None] - p[None]) ** 2).sum(-1))[np.triu_indices(n, 1)]
        return -(d.max() / d.min()) ** 2 if d.min() > 1e-9 else -1e18

    def P(x):
        st['c'] += 1
        s, y = polish(x)
        y = np.asarray(y, float).ravel()
        if np.isfinite(s) and np.all(np.isfinite(y)) and y.size == n * 3:
            pool.append((s, y))
        return s, y

    def fcc(hcp):
        g = np.arange(-3, 4)
        pts = []
        for i in g:
            for j in g:
                for k in g:
                    if hcp:
                        pts.append([i + 0.5 * (j % 2), np.sqrt(3) / 2 * (j + (k % 2) / 3), np.sqrt(2 / 3) * k])
                    elif (i + j + k) % 2 == 0:
                        pts.append([i, j, k])
        return np.array(pts, float)

    lats = [fcc(False), fcc(True)]
    cube = np.array([[i, j, k] for i in range(3) for j in range(3) for k in range(3)], float)
    budget = 150 - 45
    t = 0
    while st['c'] < budget:
        m = t % 3
        t += 1
        if m == 0:
            p = cube - 1 + rng.normal(0, rng.choice([0.03, 0.08, 0.15]), cube.shape)
        else:
            L = lats[m - 1]
            c = rng.normal(0, 0.7, 3)
            idx = np.argsort(((L - c) ** 2).sum(1))[:27 + rng.integers(0, 4)]
            p = L[idx]
            p = p[rng.permutation(len(p))[:27]] if len(p) > 27 else p
            p = p + rng.normal(0, rng.choice([0.02, 0.06, 0.12]), p.shape)
        P(p.ravel())
    cands = sorted(pool, key=lambda a: -a[0])[:3]
    while st['c'] < 150 and cands:
        imp = False
        for i in range(len(cands)):
            if st['c'] >= 150:
                break
            s, x = cands[i]
            s2, y = P(x)
            if s2 > s + 1e-12:
                imp = True
            if s2 >= s:
                cands[i] = (s2, y)
        if not imp:
            break
    good = [(sc(x), x) for _, x in pool]
    good = [g for g in good if g[0] > -1e17]
    return max(good, key=lambda a: a[0])
