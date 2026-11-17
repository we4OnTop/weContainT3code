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

    def shell(k, r):
        i = np.arange(k) + 0.5
        z = 1 - 2 * i / k
        a = np.pi * (1 + 5 ** 0.5) * i
        q = np.stack([np.sqrt(1 - z * z) * np.cos(a), np.sqrt(1 - z * z) * np.sin(a), z], 1)
        Q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        return r * q @ Q

    def gen():
        centre = int(rng.integers(0, 2))
        rest = n - centre
        ns = int(rng.integers(2, 4))
        cuts = np.sort(rng.choice(np.arange(1, rest), ns - 1, replace=False)) if ns > 1 else []
        counts = np.diff(np.concatenate([[0], cuts, [rest]])).astype(int)
        counts = np.sort(counts)
        pts = [np.zeros((1, 3))] if centre else []
        for j, k in enumerate(counts):
            r = (j + 1) / ns * (1 + rng.normal(0, 0.05))
            pts.append(shell(int(k), r))
        return np.vstack(pts) + rng.normal(0, 0.02, (n, 3))

    budget = 150 - 45
    while st['c'] < budget:
        P(gen().ravel())
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
