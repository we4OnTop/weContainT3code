def search(problem, rng, polish):
    n = problem.n
    pool = []
    k = [0]
    def P(x):
        s, xp = polish(x)
        k[0] += 1
        xp = np.array(xp, float)
        if s == s:
            pool.append((s, xp))
        return (s if s == s else -1e9), xp
    sched = [(0.5, 0.5), (0.35, 0.6), (0.2, 0.7), (0.1, 0.8), (0.05, 0.9), (0.02, 0.95)]
    while k[0] < 108:
        s0, cur = P(problem.random(rng))
        cs = s0
        for sig, shrink in sched:
            if k[0] >= 110:
                break
            y = cur.copy()
            C = y[:3 * n].reshape(n, 3)
            w = y[-1]
            C[:, 2] *= shrink
            C[:, :2] += sig * np.maximum(C[:, 2:3], 0.03) * 2 * rng.normal(size=(n, 2))
            C[:, 0] = np.clip(C[:, 0], 0, w)
            C[:, 1] = np.clip(C[:, 1], 0, 2 - w)
            s, x = P(y)
            if s >= cs:
                cs, cur = s, x
    pool.sort(key=lambda t: -t[0])
    top = []
    for s, x in pool:
        if all(abs(s - t[0]) > 1e-9 for t in top):
            top.append([s, x])
        if len(top) == 2:
            break
    i = 0
    while k[0] < 148 and top:
        t = top[i % len(top)]
        s, xp = polish(t[1])
        k[0] += 1
        if s == s and s > t[0]:
            t[0], t[1] = s, np.array(xp, float)
            pool.append((s, t[1]))
        i += 1
    return max(pool, key=lambda t: t[0])[1] if pool else problem.random(rng)
