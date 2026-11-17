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
        K = int(rng.integers(2, 5))
        center = int(rng.integers(0, 2))
        rest = n - center
        rho = 0.42 * (np.arange(1, K + 1) / K)
        w = rho * rng.uniform(0.7, 1.3, K)
        cnt = np.floor(w / w.sum() * rest).astype(int)
        cnt[-1] += rest - cnt.sum()
        pts = [(0.5, 0.5)] * center
        for k in range(K):
            ph = rng.uniform(0, 6.283)
            for t in range(cnt[k]):
                a = ph + 6.283 * t / max(cnt[k], 1)
                pts.append((0.5 + rho[k] * np.cos(a), 0.5 + rho[k] * np.sin(a)))
        pts = np.clip(np.array(pts) + rng.normal(0, 0.008, (n, 2)), 0.03, 0.97)
        return np.column_stack([pts, np.full(n, 0.07)]).ravel()
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
