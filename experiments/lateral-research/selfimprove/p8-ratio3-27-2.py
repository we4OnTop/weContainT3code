def search(problem, rng, polish):
    n = problem.n
    I, J = np.triu_indices(n, 1)

    def sc(x):
        Q = x.reshape(n, 3)
        d = np.sqrt(((Q[I] - Q[J]) ** 2).sum(1))
        return -(d.max() / max(d.min(), 1e-9)) ** 2

    def relax(x, steps, p0, p1):
        Q = x.reshape(n, 3).copy()
        for t in range(steps):
            p = p0 + (p1 - p0) * t / steps
            D = Q[I] - Q[J]
            d = np.sqrt((D * D).sum(1)) + 1e-12
            m = d.mean()
            u = d / m
            coef = (u ** (p - 1) / (u ** p).sum() - u ** (-p - 1) / (u ** -p).sum()) / d
            G = np.zeros_like(Q)
            np.add.at(G, I, coef[:, None] * D)
            np.add.at(G, J, -coef[:, None] * D)
            Q -= (0.05 * (1 - t / steps) + 0.003) * G / (np.abs(G).max() + 1e-12)
            Q = (Q - Q.mean(0)) / m
        return Q.ravel()

    def run(C):
        st = [0]
        b = [-1e18, None]

        def P(x):
            if st[0] >= 150:
                return None
            st[0] += 1
            try:
                s, y = polish(x)
            except Exception:
                st[0] = 150
                return None
            y = np.asarray(y, float)
            if s > b[0]:
                b[0] = s
                b[1] = y
            return s, y

        if not C:
            C = [problem.random(rng)]
        R = [r for r in (P(x) for x in C[:20]) if r]
        R.sort(key=lambda r: -r[0])
        for s, y in R[:3]:
            for _ in range(40):
                r = P(y)
                if r is None:
                    break
                ok = abs(r[0] - s) > 1e-12 * abs(s)
                s, y = r
                if not ok:
                    break
        return b[0], b[1]

    g = np.array([(i, j, k) for i in range(-5, 6) for j in range(-5, 6) for k in range(-5, 6)], float)
    sc3 = [np.array([0., 0, 0])]
    fcc = [np.array(v) for v in ([0, 0, 0], [.5, .5, 0], [.5, 0, .5], [0, .5, .5])]
    lats = {}
    lats[0] = g
    lats[1] = np.vstack([g, g + .5]) / 0.866
    lats[2] = np.vstack([g + v for v in fcc]) / 0.7071
    hx = np.array([(i + j / 2, j * np.sqrt(3) / 2) for i in range(-6, 7) for j in range(-6, 7)])
    hp = []
    for k in range(-6, 7):
        sh = np.array([.5, .2887]) * (k % 2)
        hp.append(np.c_[hx + sh, np.full(len(hx), k * 0.8165)])
    lats[3] = np.vstack(hp)
    C = []
    tries = 0
    while len(C) < 150 and tries < 4000:
        tries += 1
        L = lats[int(rng.integers(4))]
        o = rng.choice([0, 0.25, 0.5], size=3)
        h = rng.uniform(0.8, 2.4, size=3)
        P0 = L - o
        pts = P0[(np.abs(P0) <= h).all(1)]
        if len(pts) < 27 or len(pts) > 48:
            continue
        cen = pts.mean(0)
        dd = ((pts - cen) ** 2).sum(1)
        if rng.random() < 0.5:
            idx = np.argsort(dd)[:27]
        else:
            idx = rng.permutation(len(pts))[:27]
        x = pts[idx].ravel() + 0.03 * rng.normal(size=3 * n)
        x = relax(x, 100, 6, 28)
        C.append((sc(x), x))
    C.sort(key=lambda t: -t[0])
    return run([x for _, x in C])
