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
    def start():
        w = rng.uniform(0.6, 1.0)
        H = 2 - w
        rows = int(rng.integers(3, 6))
        c = np.full(rows, n // rows)
        for i in rng.permutation(rows)[: n - c.sum()]:
            c[i] += 1
        r0 = 0.8 * min(w / (2 * c.max()), H / (2 * rows))
        out = []
        for i, ci in enumerate(c):
            for j in range(ci):
                out += [w * (j + .5) / ci, H * (i + .5) / rows, r0]
        out.append(w)
        return np.array(out) + 0.0
    cur_s, cur = -1e9, None
    for _ in range(5):
        s, x = P(start())
        if s > cur_s:
            cur_s, cur = s, x
    T = 0.01
    while k[0] < 110:
        y = cur.copy()
        C = y[:3 * n].reshape(n, 3)
        w = y[-1]
        t = rng.integers(4)
        if t == 0:
            sig = rng.uniform(0.2, 0.8)
            C[:, :2] += sig * C[:, 2:3] * rng.normal(size=(n, 2))
        elif t == 1:
            for i in np.argsort(C[:, 2])[: int(rng.integers(1, 3))]:
                C[i] = [rng.uniform(0, w), rng.uniform(0, 2 - w), 0.02]
        elif t == 2:
            a, b = rng.choice(n, 2, replace=False)
            C[[a, b], :2] = C[[b, a], :2]
        else:
            nw = float(np.clip(w + rng.uniform(-0.1, 0.1), 0.3, 1.0))
            C[:, 0] *= nw / w
            C[:, 1] *= (2 - nw) / (2 - w)
            C[:, 2] *= 0.9
            y[-1] = nw
        C[:, 0] = np.clip(C[:, 0], 0, y[-1])
        C[:, 1] = np.clip(C[:, 1], 0, 2 - y[-1])
        s, x = P(y)
        if s > cur_s or rng.random() < np.exp((s - cur_s) / T):
            cur_s, cur = s, x
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
