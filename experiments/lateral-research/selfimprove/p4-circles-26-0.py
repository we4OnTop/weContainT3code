def search(problem, rng, polish):
    n = problem.n
    best = [-1.0, None]
    calls = [0]
    def P(x):
        if calls[0] >= 149:
            return None
        calls[0] += 1
        s, xp = polish(x)
        xp = np.array(xp, float)
        if s > best[0]:
            best[0], best[1] = s, xp
        return s
    def lattice():
        m = int(rng.choice([5, 6]))
        base = [n // m] * m
        for k in range(n - sum(base)):
            base[k] += 1
        rng.shuffle(base)
        pts = []
        for i, c in enumerate(base):
            xs = (np.arange(c) + 0.5 + 0.25 * (i % 2) * rng.choice([-1, 1])) / c
            for xv in xs:
                pts.append((min(max(xv, 0.03), 0.97), (i + 0.5) / m))
        z = np.zeros((n, 3))
        z[:, :2] = np.array(pts)
        z[:, 2] = 0.4 / max(m, max(base))
        return z
    def sym():
        h = n // 2
        p = rng.random((h, 2))
        p[:, 0] *= 0.5
        z = np.zeros((n, 3))
        z[:h, :2] = p
        z[h:2 * h, 0] = 1 - p[:, 0]
        z[h:2 * h, 1] = p[:, 1]
        if n > 2 * h:
            z[-1, :2] = (0.5, rng.random())
        z[:, 2] = 0.05
        return z
    for t in range(110):
        z = lattice() if t % 2 == 0 else sym()
        z[:, :2] += rng.normal(0, 0.02 * (1 + t % 3), (n, 2))
        z[:, :2] = np.clip(z[:, :2], 0.02, 0.98)
        P(z.ravel())
    for t in range(38):
        z = best[1].reshape(n, 3).copy()
        z[:, :2] += rng.normal(0, 0.004 * (1 + t % 4), (n, 2))
        z[:, 2] *= 0.95
        P(z.ravel())
    P(best[1])
    return best[0], best[1]
