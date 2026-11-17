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
        C = rng.uniform(0, 1, (1500, 2))
        shrink = rng.uniform(0.75, 1.0)
        cx = []; cy = []; cr = []
        for k in range(n):
            gap = np.minimum(np.minimum(C[:, 0], 1 - C[:, 0]), np.minimum(C[:, 1], 1 - C[:, 1]))
            if cx:
                d = np.hypot(C[:, 0, None] - np.array(cx), C[:, 1, None] - np.array(cy)) - np.array(cr)
                gap = np.minimum(gap, d.min(axis=1))
            i = int(np.argmax(gap))
            r = max(gap[i] * shrink, 0.01)
            cx.append(C[i, 0]); cy.append(C[i, 1]); cr.append(r)
        return np.column_stack([cx, cy, cr]).ravel()
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
