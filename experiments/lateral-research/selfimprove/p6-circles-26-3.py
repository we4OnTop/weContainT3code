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
    best = None
    for _ in range(25):
        x = np.array(problem.random(rng), float).reshape(-1, 3)
        x[:, 2] = 0.01
        s, y = P(x.ravel())
        if best is None or s > best[0]:
            best = (s, y)
    while calls[0] < 105:
        x = best[1].reshape(-1, 3).copy()
        x[:, :2] = 0.5 + (x[:, :2] - 0.5) * rng.uniform(0.85, 0.97)
        x[:, :2] += rng.normal(0, rng.choice([0.01, 0.03, 0.06]), (n, 2))
        x[:, 2] *= 0.4
        k = int(np.argmin(best[1].reshape(-1, 3)[:, 2]))
        if rng.random() < 0.5:
            x[k, :2] = rng.uniform(0.05, 0.95, 2)
        x[:, :2] = np.clip(x[:, :2], 0.02, 0.98)
        s, y = P(x.ravel())
        if s > best[0]:
            best = (s, y)
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
