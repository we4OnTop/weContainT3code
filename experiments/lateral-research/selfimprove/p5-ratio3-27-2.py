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

    def relax(X):
        for p in (4, 8, 16, 32, 64, 128):
            m = np.zeros_like(X)
            v2 = np.zeros_like(X)
            for t in range(1, 81):
                G, s = grad(X, p)
                m = .9 * m + .1 * G
                v2 = .999 * v2 + .001 * G * G
                X = X - 0.03 * s / p ** .25 * (m / (1 - .9 ** t)) / (np.sqrt(v2 / (1 - .999 ** t)) + 1e-12 * 0 + 1e-9)
        return X

    while calls < ex:
        X = problem.random(rng).reshape(n, 3)
        if rng.random() < .5:
            d = rng.normal(size=(n, 3))
            d /= np.linalg.norm(d, axis=1, keepdims=True)
            X = d * rng.random((n, 1)) ** (1 / 3)
        X = X - X.mean(0)
        P(relax(X).ravel())

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
