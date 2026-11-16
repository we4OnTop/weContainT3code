def search(problem, rng, polish):
    n = problem.n
    while True:
        a = rng.uniform(1.0, 1.3)
        lo, hi = 0.0, 1.5
        for _ in range(60):
            m = (lo + hi) / 2
            P = np.pi * (3 * (a + m) - np.sqrt((3 * a + m) * (a + 3 * m)))
            if P > 2 * np.pi:
                hi = m
            else:
                lo = m
        b = (lo + hi) / 2
        s = rng.uniform(0.35, 0.5)
        th = rng.uniform(0, np.pi)
        off = rng.uniform(-s, s, 2)
        R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
        pts = []
        for _ in range(80):
            g = np.arange(-12, 13)
            i, j = np.meshgrid(g, g)
            L = np.stack([(i + 0.5 * j).ravel() * s, (j * s * 0.8660254).ravel()], 1)
            L = L @ R.T + off
            ok = (L[:, 0] / a) ** 2 + (L[:, 1] / b) ** 2 < 0.85
            pts = L[ok]
            if len(pts) >= n:
                break
            s *= 0.96
        idx = rng.permutation(len(pts))[:n]
        P = pts[idx]
        P = P + rng.normal(0, 0.01, P.shape)
        x = np.zeros(3 * n + 1)
        x[0:3 * n:3] = P[:, 0]
        x[1:3 * n:3] = P[:, 1]
        x[2:3 * n:3] = s * 0.4
        x[-1] = a
        polish(x)
