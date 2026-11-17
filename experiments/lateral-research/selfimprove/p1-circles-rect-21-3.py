def search(problem, rng, polish):
    n = problem.n
    best_s, best = polish(problem.random(rng))
    while True:
        x = best.copy()
        P = x[:-1].reshape(n, 3)
        w = x[-1]
        h = 2 - w
        k = int(rng.integers(1, 5))
        order = np.argsort(P[:, 2] + rng.uniform(0, 0.03, n))
        for i in order[:k]:
            P[i, 2] = 0.0
        for i in order[:k]:
            q = np.column_stack([rng.uniform(0, w, 400), rng.uniform(0, h, 400)])
            d = np.sqrt(((q[:, None, :] - P[None, :, :2]) ** 2).sum(-1)) - P[None, :, 2]
            wall = np.minimum.reduce([q[:, 0], w - q[:, 0], q[:, 1], h - q[:, 1]])
            c = np.minimum(d.min(1), wall)
            j = int(np.argmax(c + rng.uniform(0, 0.01, 400)))
            P[i, :2] = q[j]
            P[i, 2] = max(c[j], 1e-3) * 0.9
        s, xp = polish(x)
        if s > best_s:
            best_s, best = s, xp
