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
    def kick(x):
        Q = x.reshape(-1, 2).copy()
        d = np.sqrt(((Q[:, None] - Q[None]) ** 2).sum(-1))[np.triu_indices(n, 1)]
        s = max(d.min(), 1e-6)
        k = int(rng.integers(4))
        if k == 0:
            a = rng.uniform(0, np.pi)
            u = np.array([np.cos(a), np.sin(a)])
            v = np.array([-np.sin(a), np.cos(a)])
            t = Q @ v
            o = np.argsort(t)
            rows = np.split(o, np.where(np.diff(t[o]) > 0.4 * s)[0] + 1)
            r = rows[int(rng.integers(len(rows)))]
            Q[r] += u * s * (0.5 if rng.random() < 0.5 else rng.random())
        elif k == 1:
            c = Q.mean(0)
            rad = np.sqrt(((Q - c) ** 2).sum(1))
            ring = np.abs(rad - rng.choice(rad)) < 0.3 * s
            th = rng.uniform(0, 2 * np.pi)
            R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
            Q[ring] = (Q[ring] - c) @ R.T + c
        elif k == 2:
            i = int(rng.integers(n))
            j, l = rng.choice(n, 2, replace=False)
            Q[i] = (Q[j] + Q[l]) / 2 + rng.normal(0, 0.1 * s, 2)
        else:
            Q += rng.normal(0, 0.15 * s, Q.shape)
        return Q.ravel()
    for _ in range(3):
        P(problem.random(rng))
    while used[0] < TOTAL - 38:
        base = pool[0][1] if rng.random() < 0.7 else pool[int(rng.integers(len(pool)))][1]
        P(kick(base))
    return finish()
