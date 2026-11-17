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

    lat = np.array([(a + b / 2, b * np.sqrt(3) / 2) for a in range(-6, 7) for b in range(-6, 7)])
    offs = np.array([[0, 0], [.5, 0], [.25, .433]])
    comps = []
    for L in (3, 4, 5):
        seen = set()
        for _ in range(6000):
            parts = rng.integers(3, 14 if L == 3 else 9, size=L)
            t = tuple(int(q) for q in parts)
            if parts.sum() == 27 and t[0] <= t[-1] and t not in seen:
                seen.add(t)
                comps.append(t)
                if len(seen) >= 30:
                    break
    C = []
    for comp in comps:
        for mode in (2, 3):
            c0 = offs[rng.integers(3)] + 0.1 * rng.normal(size=2)
            h = 0.7 + 0.25 * rng.random()
            pts = []
            for i, k in enumerate(comp):
                sh = np.array([.5, .2887]) * (i % mode)
                P2 = lat + sh
                idx = np.argsort(((P2 - c0) ** 2).sum(1))[:k]
                z = (i - (len(comp) - 1) / 2) * h
                pts.append(np.c_[P2[idx], np.full(k, z)])
            x = np.vstack(pts).ravel() + 0.03 * rng.normal(size=3 * n)
            x = relax(x, 120, 3, 16)
            C.append((sc(x), x))
    C.sort(key=lambda t: -t[0])
    return run([x for _, x in C])
