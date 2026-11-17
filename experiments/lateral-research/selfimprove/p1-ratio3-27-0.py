def search(problem, rng, polish):
    n = problem.n
    g = np.arange(-3, 4).astype(float)
    G = np.array(np.meshgrid(g, g, g)).reshape(3, -1).T
    lats = [G, G[G.sum(1) % 2 == 0], np.vstack([G, G + 0.5])]
    while True:
        L = lats[rng.integers(3)]
        c = rng.uniform(-0.5, 0.5, 3)
        p = L - c
        idx = np.argsort(np.linalg.norm(p, axis=1) + rng.normal(size=len(p)) * 0.05)[:n]
        y = p[idx] + rng.normal(size=(n, 3)) * rng.choice([0.03, 0.1, 0.2])
        polish(y.ravel())
