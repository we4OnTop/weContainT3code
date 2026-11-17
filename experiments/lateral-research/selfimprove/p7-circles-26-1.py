def search(problem, rng, polish):
    n = problem.n
    best = [-1e9, None]
    calls = [0]

    def P(x, lim=146):
        if calls[0] >= lim:
            return None
        calls[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            if calls[0] >= 150:
                raise
            return None
        if s > best[0]:
            best[0] = s
            best[1] = np.array(xp, float)
        return s

    def ring_start():
        m0 = int(rng.integers(0, 2))
        corners = int(rng.choice([0, 0, 4]))
        rest = n - m0 - corners
        k = int(rng.integers(2, 5))
        cuts = np.sort(rng.choice(np.arange(1, rest), k - 1, replace=False)) if k > 1 else []
        counts = np.diff(np.concatenate([[0], cuts, [rest]])).astype(int)
        counts = np.sort(counts)  # inner rings get fewer
        rhos = np.sort(rng.uniform(0.12, 0.45, k))
        pts = []
        if m0:
            pts.append((0.5, 0.5))
        for cx, cy in [(0.1, 0.1), (0.9, 0.1), (0.1, 0.9), (0.9, 0.1 + 0.8)][:corners]:
            pts.append((cx, cy))
        sq = rng.random() < 0.5
        for c, rho in zip(counts, rhos):
            ph = rng.uniform(0, 2 * np.pi)
            for j in range(c):
                a = ph + 2 * np.pi * j / c
                dx, dy = np.cos(a), np.sin(a)
                if sq:  # push toward square boundary
                    s = max(abs(dx), abs(dy))
                    dx, dy = dx / s * 0.8 + dx * 0.2, dy / s * 0.8 + dy * 0.2
                pts.append((0.5 + rho * dx, 0.5 + rho * dy))
        pts = np.clip(np.array(pts), 0.05, 0.95)
        v = np.zeros((n, 3))
        v[:, :2] = pts[:n] + rng.normal(0, 0.005, (n, 2))
        v[:, 2] = 0.05
        return v.ravel()

    while calls[0] < 125:
        try:
            P(ring_start())
        except Exception:
            if calls[0] >= 150:
                raise
    while calls[0] < 146 and best[1] is not None:
        v = best[1].copy().reshape(-1, 3)
        i = rng.integers(0, n, 3)
        v[i, :2] = rng.random((3, 2))
        v[i, 2] = 0.02
        P(v.ravel())
    if best[1] is None:
        P(problem.random(rng), 149)
    for _ in range(2):
        if best[1] is not None:
            P(best[1], 150)
    return best[1]
