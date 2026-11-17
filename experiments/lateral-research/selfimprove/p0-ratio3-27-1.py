def search(problem, rng, polish):
    n = problem.n
    R = np.arange(-4, 5)
    g = np.array(np.meshgrid(R, R, R)).reshape(3, -1).T.astype(float)
    lats = {
        0: g[g.sum(1) % 2 == 0],
        1: np.vstack([g, g + 0.5]),
        2: g,
        3: np.vstack([g[:, :] * [1, np.sqrt(3), 1] + [0, 0, 0],
                      g * [1, np.sqrt(3), 1] + [0.5, np.sqrt(3) / 2, 0.5]]),
    }
    best = (-np.inf, None)
    for _ in range(150):
        P = lats[int(rng.integers(0, 4))]
        c = rng.uniform(-0.5, 0.5, 3)
        sc = rng.uniform(0.9, 1.1, 3)
        dd = np.linalg.norm((P - c) * sc, axis=1) + rng.normal(scale=0.02, size=len(P))
        pts = P[np.argsort(dd)[:n]] - c
        x = (pts + rng.normal(scale=rng.choice([0.02, 0.06, 0.12]), size=(n, 3))).ravel()
        s, xp = polish(x)
        if s > best[0]:
            best = (s, xp)
    return best
