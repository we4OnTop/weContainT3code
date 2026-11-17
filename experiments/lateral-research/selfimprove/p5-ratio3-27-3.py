def search(problem, rng, polish):
    n = problem.n
    B, ex = 150, 112
    calls = 0
    res = []
    I, J = np.triu_indices(n, 1)

    def P(x):
        nonlocal calls
        calls += 1
        s, y = polish(x)
        y = np.array(y, float)
        res.append((s, y))
        return s, y

    def rot(a):
        c, s = np.cos(a), np.sin(a)
        return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.]])

    I3 = np.eye(3)
    # (ops, number of base points, has centre)
    groups = [
        (np.array([rot(2 * np.pi * k / 3) for k in range(3)]), 9, False),
        (np.array([rot(2 * np.pi * k / 9) for k in range(9)]), 3, False),
        (np.array([I3, rot(np.pi)]), 13, True),
        (np.array([I3, -I3]), 13, True),
    ]

    def grad(X, p):
        v = X[I] - X[J]
        d = np.linalg.norm(v, axis=1) + 1e-12
        s = d.mean()
        u = d / s
        a, b = u ** p, u ** -p
        gd = (a / u) / a.sum() - (b / u) / b.sum()
        gv = (gd / s / d)[:, None] * v
        G = np.zeros_like(X)
        np.add.at(G, I, gv)
        np.add.at(G, J, -gv)
        return G, s

    def build(ops, Bs, ctr):
        X = np.einsum('gij,mj->mgi', ops, Bs).reshape(-1, 3)
        return np.vstack([X, np.zeros((1, 3))]) if ctr else X

    def relax(ops, m, ctr):
        Bs = rng.normal(size=(m, 3))
        if len(ops) == 9:
            Bs[:, 2] = np.linspace(-1, 1, m) * 1.2
        for p in (4, 8, 16, 32, 64, 128):
            M = np.zeros_like(Bs)
            V = np.zeros_like(Bs)
            for t in range(1, 81):
                X = build(ops, Bs, ctr)
                G, s = grad(X, p)
                Gm = G[:m * len(ops)].reshape(m, len(ops), 3)
                gB = np.einsum('gij,mgi->mj', ops, Gm)
                M = .9 * M + .1 * gB
                V = .999 * V + .001 * gB * gB
                Bs = Bs - 0.03 * s / p ** .25 * (M / (1 - .9 ** t)) / (np.sqrt(V / (1 - .999 ** t)) + 1e-9)
        return build(ops, Bs, ctr)

    while calls < ex:
        ops, m, ctr = groups[rng.integers(len(groups))]
        X = relax(ops, m, ctr)
        X = X + rng.normal(0, 1e-3 * X.std(), X.shape)
        P(X.ravel())

    res.sort(key=lambda r: -r[0])
    c = [res[0]]
    for q in res[1:]:
        if abs(q[0] - c[0][0]) > 1e-7:
            c.append(q)
            break
    if len(c) < 2:
        c.append(res[0])
    k = 0
    while calls < B:
        s0, x = c[k % 2]
        if k >= 2:
            x = x + rng.normal(0, 1e-3 * x.std(), x.shape)
        s, y = P(x)
        if s > s0:
            c[k % 2] = (s, y)
        k += 1
    res.sort(key=lambda r: -r[0])
    return res[0]
