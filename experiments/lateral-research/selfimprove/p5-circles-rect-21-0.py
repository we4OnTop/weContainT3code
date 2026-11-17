def search(problem, rng, polish):
    n = problem.n
    pool = []
    k = [0]
    def P(x):
        s, xp = polish(x)
        k[0] += 1
        if s == s:
            pool.append((s, np.array(xp, float)))
        return s
    def start():
        w = rng.uniform(0.5, 1.0)
        H = 2 - w
        rows = int(rng.integers(3, 6))
        c = np.full(rows, n // rows)
        for i in rng.permutation(rows)[: n - c.sum()]:
            c[i] += 1
        r0 = 0.9 * min(w / (2 * c.max()), H / (2 * rows))
        jit = rng.uniform(0.0, 0.5)
        out = []
        for i, ci in enumerate(c):
            y = H * (i + .5) / rows
            for j in range(ci):
                x = w * (j + .5) / ci
                out += [np.clip(x + jit * r0 * rng.normal(), 0, w),
                        np.clip(y + jit * r0 * rng.normal(), 0, H),
                        r0 * rng.uniform(0.5, 1.0)]
        out.append(w)
        return np.array(out)
    while k[0] < 110:
        P(start())
    for _ in range(2):
        pass
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
