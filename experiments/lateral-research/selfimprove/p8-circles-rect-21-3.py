def search(problem, rng, polish):
    n = problem.n
    cnt = [0]
    res = []
    def P(x):
        if cnt[0] >= 150:
            return None
        cnt[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            if cnt[0] >= 150:
                raise
            return None
        res.append((s, xp))
        return s, xp
    classes = [("m", m) for m in range(5, 11)] + [("c2", 0)]
    for q in range(2, 6):
        for a in range(0, 11 - 2 * q):
            classes.append(("d2", (q, a, 10 - 2 * q - a)))
    def build(cl, w):
        kind, p = cl
        U = rng.random
        pts = []
        if kind == "m":
            for _ in range(p):
                x0, y0 = U() * 0.5, U()
                pts += [(x0, y0), (1 - x0, y0)]
            for _ in range(n - 2 * p):
                pts.append((0.5, U()))
        elif kind == "c2":
            for _ in range(10):
                x0, y0 = U(), U() * 0.5
                pts += [(x0, y0), (1 - x0, 1 - y0)]
            pts.append((0.5, 0.5))
        else:
            q, a, b = p
            for _ in range(q):
                x0, y0 = U() * 0.5, U() * 0.5
                pts += [(x0, y0), (1 - x0, y0), (x0, 1 - y0), (1 - x0, 1 - y0)]
            for _ in range(a):
                x0 = U() * 0.5
                pts += [(x0, 0.5), (1 - x0, 0.5)]
            for _ in range(b):
                y0 = U() * 0.5
                pts += [(0.5, y0), (0.5, 1 - y0)]
            pts.append((0.5, 0.5))
        u = np.clip(np.array(pts), 0.03, 0.97)
        h = 2 - w
        x = np.empty(3 * n + 1)
        x[0:3 * n:3] = u[:, 0] * w
        x[1:3 * n:3] = u[:, 1] * h
        x[2:3 * n:3] = 0.3 * np.sqrt(w * h / n)
        x[-1] = w
        return x
    sc = []
    i = 0
    while cnt[0] < 112:
        cl = classes[i % len(classes)]
        i += 1
        w = float(rng.uniform(0.6, 1.4))
        r = P(build(cl, w))
        if r:
            sc.append(r)
    sc.sort(key=lambda t: -t[0])
    for k, (s, x) in enumerate(sc[:3]):
        lim = cnt[0] + (150 - cnt[0]) // (3 - k)
        while cnt[0] < lim:
            r = P(x)
            if r is None:
                break
            d = r[0] - s
            if r[0] > s:
                s, x = r
            if d < 1e-12:
                break
    return max(res, key=lambda t: t[0])[1] if res else problem.random(rng)
