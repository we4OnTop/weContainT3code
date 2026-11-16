def search(problem, rng, polish):
    n = problem.n
    best, bx = -np.inf, None
    while True:
        if bx is None or rng.random() < 0.1:
            sc, x = polish(problem.random(rng))
            if bx is None or sc > best:
                best, bx = sc, x
            continue
        X = bx.reshape(n, 3).copy()
        c = X.mean(0)
        r = np.linalg.norm(X - c, axis=1)
        if rng.random() < 0.7:
            i = rng.choice(np.argsort(-r)[:4])
        else:
            i = rng.integers(n)
        others = np.delete(X, i, axis=0)
        R = r.max() * 0.9
        C = rng.normal(size=(3000, 3))
        C = C / np.linalg.norm(C, axis=1, keepdims=True) * R * rng.random((3000, 1)) ** (1 / 3) + c
        md = np.linalg.norm(C[:, None] - others[None], axis=-1).min(1)
        top = np.argsort(-md)[:5]
        X[i] = C[rng.choice(top)]
        sc, x = polish(X.ravel())
        if sc > best:
            best, bx = sc, x
