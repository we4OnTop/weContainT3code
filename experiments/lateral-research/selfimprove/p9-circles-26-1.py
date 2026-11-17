def search(problem, rng, polish):
    n = problem.n; B = 150; EX = 112
    c = [0]; pool = []
    def P(x):
        c[0] += 1
        s, xp = polish(np.clip(np.asarray(x, float), 0, 1))
        for k, (t, _) in enumerate(pool):
            if abs(s - t) < 1e-9:
                if s > t: pool[k] = (s, xp)
                break
        else:
            pool.append((s, xp))
        pool.sort(key=lambda a: -a[0]); del pool[3:]
        return s, xp
    def fin():
        for s, x in list(pool):
            while c[0] < B:
                s2, x2 = P(x)
                if s2 - s < 1e-13: break
                s, x = s2, x2
        return pool[0]
    def prox(p):
        d = np.hypot(p[:, None, 0] - p[None, :, 0], p[:, None, 1] - p[None, :, 1])
        np.fill_diagonal(d, 9)
        r = np.minimum(np.minimum(p, 1 - p).min(1), d.min(1) / 2)
        return r.sum(), r
    comps = []
    for m in (0, 1):
        for a in range(3, 13):
            b = n - m - a
            if a <= b <= 18: comps.append((m, [a, b]))
            for b in range(a, 17):
                cc = n - m - a - b
                if b <= cc <= 18: comps.append((m, [a, b, cc]))
    cands = []
    for m, cnt in comps:
        K = len(cnt)
        for scale in (0.36, 0.41, 0.45):
            for t in range(2):
                pts = [[0.5, 0.5]] if m else []
                for j, q in enumerate(cnt):
                    R = scale * (j + 1) / K
                    ph = rng.random() * 6.2832 if t else 0.0
                    a = ph + 2 * np.pi * np.arange(q) / q
                    pts += list(np.column_stack([0.5 + R * np.cos(a), 0.5 + R * np.sin(a)]))
                cands.append(np.clip(np.array(pts), 0.03, 0.97))
    cands.append(problem.random(rng).reshape(n, 3)[:, :2])
    sc = [prox(p)[0] for p in cands]
    seen = set()
    for i in np.argsort(sc)[::-1]:
        key = round(sc[i], 5)
        if key in seen: continue
        seen.add(key)
        if c[0] >= EX: break
        s, r = prox(cands[i])
        P(np.column_stack([cands[i], r * 0.95 + 1e-3]).ravel())
    return fin()
