def search(problem, rng, polish):
    n = problem.n
    calls = [0]
    allp = []
    def P(x):
        calls[0] += 1
        s, y = polish(x)
        allp.append((s, y))
        return s, y
    def feas(x):
        c = np.asarray(x).reshape(-1, 3)
        X, Y, R = c[:, 0], c[:, 1], c[:, 2]
        if (R < 0).any() or (X - R < -1e-9).any() or (X + R > 1 + 1e-9).any() or (Y - R < -1e-9).any() or (Y + R > 1 + 1e-9).any():
            return False
        d = np.hypot(X[:, None] - X, Y[:, None] - Y) - (R[:, None] + R)
        return bool((d[np.triu_indices(len(R), 1)] >= -1e-9).all())
    def start():
        while True:
            m = int(rng.integers(5, 8)); c = int(rng.integers(5, 8))
            if m * c >= n and m * c <= n + 6:
                break
        pts = []
        for i in range(m):
            for j in range(c):
                pts.append(((j + 0.5 + 0.5 * (i % 2) * (1 if rng.random() < 0.9 else 0)) / (c + 0.5), (i + 0.5) / m))
        pts = np.array(pts)
        pts = pts[rng.permutation(len(pts))[:n]]
        if rng.random() < 0.5:
            pts = pts[:, ::-1]
        pts = np.clip(pts + rng.normal(0, 0.01, pts.shape), 0.02, 0.98)
        r = np.full(n, 0.45 / max(m, c))
        return np.column_stack([pts, r]).ravel()
    while calls[0] < 105:
        P(start())
    allp.sort(key=lambda t: -t[0])
    cands = []
    for s, x in allp:
        if feas(x) and all(abs(s - c[0]) > 1e-7 for c in cands):
            cands.append([s, x])
            if len(cands) == 3:
                break
    while calls[0] < 150 and cands:
        imp = False
        for c in cands:
            if calls[0] >= 150:
                break
            s, x = P(c[1])
            if s > c[0] + 1e-12:
                imp = True
            if s >= c[0] - 1e-12 and feas(x):
                c[0], c[1] = s, x
        if not imp:
            break
    ok = [t for t in allp if feas(t[1])] or allp
    return max(ok, key=lambda t: t[0])[1]
