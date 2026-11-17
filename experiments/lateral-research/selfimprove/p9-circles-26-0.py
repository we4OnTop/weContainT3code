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
    cands = []
    g = np.arange(-14, 15); I, J = np.meshgrid(g, g)
    for kind in range(2):
        for ang in np.linspace(0, np.pi / (3 if kind == 0 else 2), 13)[:-1]:
            for d in np.linspace(0.16, 0.26, 11):
                for t in range(3):
                    off = rng.random(2) * d
                    if kind == 0:
                        u = I * d + J * d / 2; v = J * d * 0.8660254
                    else:
                        u = I * d + (J % 2) * rng.random() * d * 0.5 * (t > 0); v = J * d
                    ca, sa = np.cos(ang), np.sin(ang)
                    px = (ca * u - sa * v).ravel() + 0.5 + off[0] - d / 2
                    py = (sa * u + ca * v).ravel() + 0.5 + off[1] - d / 2
                    m = (px > .03) & (px < .97) & (py > .03) & (py < .97)
                    p = np.column_stack([px[m], py[m]]); k = len(p)
                    if k < n or k > n + 6: continue
                    cands.append(np.delete(p, rng.choice(k, k - n, replace=False), 0))
    for _ in range(5):
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
