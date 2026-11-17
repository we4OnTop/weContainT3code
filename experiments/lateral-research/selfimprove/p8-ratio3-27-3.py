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

    classes = []
    for k in range(2, 7):
        for refl in (0, 1, 2):
            m = k * (2 if refl else 1)
            for a in range(0, 6):
                if (27 - a) % m == 0 and (refl != 2 or a % 2 == 1):
                    classes.append((k, refl, a, (27 - a) // m))
    C = []
    for k, refl, a, q in classes:
        for v in range(8):
            pts = []
            for _ in range(q):
                p = rng.normal(size=3) * 1.2
                for j in range(k):
                    c, s_ = np.cos(2 * np.pi * j / k), np.sin(2 * np.pi * j / k)
                    r = np.array([c * p[0] - s_ * p[1], s_ * p[0] + c * p[1], p[2]])
                    pts.append(r)
                    if refl == 1:
                        pts.append(r * np.array([1, 1, -1]))
                    elif refl == 2:
                        pts.append(-r)
            if a:
                zs = (np.arange(a) - (a - 1) / 2) * (0.9 + 0.2 * rng.random())
                for z in zs:
                    pts.append(np.array([0, 0, z]))
            x = np.array(pts).ravel() + 0.01 * rng.normal(size=3 * n)
            x = relax(x, 150, 8, 32)
            C.append((sc(x), x))
    C.sort(key=lambda t: -t[0])
    return run([x for _, x in C])
