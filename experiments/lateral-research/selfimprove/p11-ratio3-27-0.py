def search(problem, rng, polish):
    n = problem.n
    pool = []; calls = [0]
    def run(x, j=None):
        calls[0] += 1
        s, y = polish(x)
        if np.isfinite(s):
            if j is not None:
                if s > pool[j][0]: pool[j] = (s, y)
            elif all(abs(s - p[0]) > 1e-9 for p in pool):
                pool.append((s, y)); pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s
    r3 = np.sqrt(3.0); h = np.sqrt(2.0 / 3.0)
    bases = {"sc": np.eye(3),
             "fcc": np.array([[0, .5, .5], [.5, 0, .5], [.5, .5, 0]]),
             "bcc": np.array([[-.5, .5, .5], [.5, -.5, .5], [.5, .5, -.5]])}
    g = np.arange(-3, 4)
    I, J, K = np.meshgrid(g, g, g, indexing="ij")
    I = I.ravel(); J = J.ravel(); K = K.ravel()
    lats = []
    for name, B in bases.items():
        P = np.stack([I, J, K], 1) @ B
        lats.append((P, K % 2))
    P = np.stack([I + .5 * J + .5 * (K % 2), r3 / 2 * J + r3 / 6 * (K % 2), h * K], 1)
    lats.append((P, K % 2))
    it = 0
    while calls[0] < 112:
        P, layer = lats[it % 4]; it += 1
        R, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        c = [np.zeros(3), rng.uniform(-.5, .5, 3), np.full(3, .25)][int(rng.integers(3))]
        Q = P.copy()
        if rng.random() < .5:  # shifted layer
            Q[layer == 1] += rng.normal(scale=.3, size=3)
        d = np.linalg.norm(Q - c, axis=1)
        r = int(rng.integers(0, 4))
        idx = np.argsort(d)[:n + r]
        if r:
            idx = np.delete(idx, rng.choice(len(idx), r, replace=False))
        run(((Q[idx] - c) @ R).ravel())
    while calls[0] < 150:
        j = calls[0] % len(pool)
        run(pool[j][1], j)
    return pool[0]
