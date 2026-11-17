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

    def lat(kind):
        r = np.arange(-3, 4)
        g = np.array([[i, j, k] for i in r for j in r for k in r], float)
        if kind == 0:
            g = g[(g.sum(1) % 2) == 0]
        elif kind == 2:
            g = g[(np.abs(g[:, 0] % 2 == g[:, 1] % 2)) & (g[:, 1] % 2 == g[:, 2] % 2)]
        return g

    def hcp():
        pts = []
        for l in range(-2, 3):
            for i in range(-4, 5):
                for j in range(-4, 5):
                    o = l % 2
                    pts.append([i + .5 * j + .5 * o, np.sqrt(3) / 2 * j + o * np.sqrt(3) / 6, l * np.sqrt(2 / 3)])
        return np.array(pts)

    fcc, bcc, h = lat(0), lat(2), hcp()

    def start():
        t = rng.integers(5)
        if t == 0:
            g = np.array([[i, j, k] for i in range(3) for j in range(3) for k in range(3)], float) - 1
            X = g * 1.0 + rng.normal(0, rng.uniform(.03, .2), (n, 3))
            return X
        if t == 3:
            d = rng.normal(size=(n, 3))
            d /= np.linalg.norm(d, axis=1, keepdims=True)
            return d * rng.random((n, 1)) ** (1 / 3) * 2
        L = [fcc / np.sqrt(2), h, bcc * .6][t - 1] if t < 3 else fcc
        c = rng.uniform(-.6, .6, 3)
        idx = np.argsort(np.linalg.norm(L - c, axis=1))[:n]
        X = L[idx]
        return X + rng.normal(0, rng.uniform(.01, .08), X.shape)

    while calls < ex:
        P(start().ravel())

    res.sort(key=lambda r: -r[0])
    c = [res[0]]
    for r in res[1:]:
        if abs(r[0] - c[0][0]) > 1e-7:
            c.append(r)
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
