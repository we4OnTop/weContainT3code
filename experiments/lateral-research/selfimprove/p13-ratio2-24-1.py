def search(problem, rng, polish):
    n = problem.n
    TOTAL, used, pool = 150, [0], []
    def sc(x):
        Q = x.reshape(-1, 2)
        d = np.sqrt(((Q[:, None] - Q[None]) ** 2).sum(-1))[np.triu_indices(len(Q), 1)]
        return -(d.max() / d.min()) ** 2 if d.min() > 1e-12 else -1e18
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
    combos = []
    for c0 in (0, 1):
        for c1 in range(3, 13):
            for c2 in range(c1, n):
                r = n - c0 - c1 - c2
                if r == 0:
                    combos.append((c0, (c1, c2)))
                elif r >= c2:
                    combos.append((c0, (c1, c2, r)))
    cands = []
    for c0, rings in combos:
        for _ in range(3):
            pts = [[0.0, 0.0]] if c0 else []
            prev = 0.1 if c0 else 0.0
            for c in rings:
                rad = max(c / (2 * np.pi) * rng.uniform(0.9, 1.1), prev + 0.9 if prev else 0.0)
                ph = rng.uniform(0, 2 * np.pi)
                for k in range(c):
                    a = ph + 2 * np.pi * k / c
                    pts.append([rad * np.cos(a), rad * np.sin(a)])
                prev = rad
            x = np.array(pts).ravel()
            cands.append((sc(x), x))
    cands.sort(key=lambda a: -a[0])
    seen = []
    for s0, x in cands:
        if used[0] >= TOTAL - 38:
            break
        if any(abs(s0 - t) < 1e-9 for t in seen):
            continue
        seen.append(s0)
        P(x)
    return finish()
