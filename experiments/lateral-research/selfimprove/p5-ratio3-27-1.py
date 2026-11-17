def search(problem, rng, polish):
    n = problem.n
    B, ex = 150, 112
    calls = 0
    res = []

    def P(x):
        nonlocal calls
        calls += 1
        s, y = polish(x)
        y = np.array(y, float)
        res.append((s, y))
        return s, y

    r = np.arange(-3, 4)
    g = np.array([[i, j, k] for i in r for j in r for k in r], float)
    fcc = g[(g.sum(1) % 2) == 0]

    def start():
        if rng.random() < .5:
            c = rng.uniform(-.6, .6, 3)
            X = fcc[np.argsort(np.linalg.norm(fcc - c, axis=1))[:n]].copy()
            return X + rng.normal(0, .05, X.shape)
        return problem.random(rng).reshape(n, 3)

    def hole(X):
        c = X.mean(0)
        rr = np.linalg.norm(X - c, axis=1).max()
        d = rng.normal(size=(300, 3))
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        C = c + d * rr * rng.random((300, 1)) ** (1 / 3)
        D = np.linalg.norm(C[:, None] - X[None], axis=2)
        return C[D.min(1).argmax()]

    def kick(x):
        X = x.reshape(n, 3).copy()
        D = np.linalg.norm(X[:, None] - X[None], axis=2)
        dmin = D[D > 0].min()
        t = rng.integers(4)
        if t == 0:
            i, j = np.unravel_index(D.argmax(), D.shape)
            k = (i, j)[rng.integers(2)]
            X[k] = hole(np.delete(X, k, 0))
        elif t == 1:
            for k in rng.choice(n, rng.integers(1, 4), replace=False):
                X[k] = hole(np.delete(X, k, 0))
        elif t == 2:
            a = rng.normal(size=3)
            a /= np.linalg.norm(a)
            c = X.mean(0)
            V = X - c
            pr = V @ a
            m = pr > np.median(pr)
            th = rng.uniform(-1, 1) * np.pi / 3
            v = V[m]
            V[m] = v * np.cos(th) + np.cross(a, v) * np.sin(th) + np.outer(v @ a, a) * (1 - np.cos(th))
            X = V + c
        else:
            X += rng.normal(0, .15 * dmin, X.shape)
        return X.ravel()

    for _ in range(3):
        P(start().ravel())
    res.sort(key=lambda r: -r[0])
    cur = res[0]
    stag = 0
    while calls < ex:
        T = 0.05 - 0.045 * calls / ex
        s, y = P(kick(cur[1]))
        if s > cur[0] + 1e-12:
            stag = 0
        else:
            stag += 1
        if s > cur[0] or rng.random() < np.exp((s - cur[0]) / T):
            cur = (s, y)
        if stag > 15:
            cur = max(res, key=lambda r: r[0])
            stag = 0

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
