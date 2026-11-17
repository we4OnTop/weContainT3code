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

    budget = 150 - 45
    nrand = 25
    for _ in range(nrand):
        P(problem.random(rng))
    while st['c'] < budget:
        top = sorted(pool, key=lambda a: -a[0])[:3]
        s, x = top[int(rng.integers(0, len(top)))]
        p = x.reshape(n, 3)
        p = p - p.mean(0)
        sh = rng.uniform(0.3, 0.7)
        ex = rng.uniform(1.0 / sh * 0.8, 1.0 / sh * 1.2)
        q = p * sh
        k = int(rng.integers(1, 5))
        idx = rng.choice(n, k, replace=False)
        q[idx] += rng.normal(0, 0.15 * np.abs(q).max(), (k, 3))
        q = q * ex + rng.normal(0, 0.02 * np.abs(p).max(), q.shape)
        P(q.ravel())
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
