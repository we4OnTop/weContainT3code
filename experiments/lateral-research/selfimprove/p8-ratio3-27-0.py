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

    comps = [[1, 12, 14], [1, 8, 18], [1, 6, 12, 8], [1, 12, 6, 8], [1, 4, 10, 12],
             [1, 10, 16], [2, 12, 13], [4, 10, 13], [1, 6, 8, 12], [1, 14, 12],
             [3, 9, 15], [1, 5, 10, 11], [1, 9, 17], [1, 6, 20], [1, 8, 12, 6]]
    C = []
    for comp in comps:
        for v in range(10):
            pts = []
            prev = 0.0
            for s, c in enumerate(comp):
                if c == 1 and s == 0:
                    pts.append(np.zeros((1, 3)))
                    continue
                r = max(prev + 0.8 + 0.2 * rng.random(),
                        np.sqrt(c * 0.9 / 12.57) * (0.9 + 0.2 * rng.random()))
                prev = r
                i = np.arange(c) + 0.5
                z = 1 - 2 * i / c
                ph = i * 2.39996 + rng.random() * 6.28
                rr = np.sqrt(1 - z * z)
                S = np.stack([rr * np.cos(ph), rr * np.sin(ph), z], 1)
                Rm = np.linalg.qr(rng.normal(size=(3, 3)))[0]
                pts.append(r * S @ Rm)
            x = np.vstack(pts).ravel() + 0.02 * rng.normal(size=3 * n)
            x = relax(x, 100, 6, 24)
            C.append((sc(x), x))
    C.sort(key=lambda t: -t[0])
    return run([x for _, x in C])
