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

    def gen():
        R = 1.0
        pts = [rng.normal(size=3) * 0.2]
        ncand = int(rng.choice([200, 800, 3000]))
        while len(pts) < n:
            c = rng.normal(size=(ncand, 3))
            c = c / np.linalg.norm(c, axis=1)[:, None] * R * rng.random(ncand)[:, None] ** (1 / 3)
            A = np.array(pts)
            d = np.sqrt(((c[:, None] - A[None]) ** 2).sum(-1)).min(1)
            pts.append(c[np.argmax(d)])
        return np.array(pts) + rng.normal(0, 0.01, (n, 3))

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
