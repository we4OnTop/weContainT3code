def search(problem, rng, polish):
    n = problem.n
    pop = []
    for w in np.linspace(0.3, 1.0, 8):
        x = problem.random(rng)
        x[-1] = w
        P = x[:-1].reshape(n, 3)
        P[:, 0] = rng.uniform(0, w, n)
        P[:, 1] = rng.uniform(0, 2 - w, n)
        P[:, 2] = 0.5 * np.sqrt(w * (2 - w) / n) * 0.5
        pop.append(polish(np.concatenate([P.ravel(), [w]])))
    while True:
        pop.sort(key=lambda t: -t[0])
        pop = pop[:8]
        parent = pop[int(rng.integers(0, min(4, len(pop))))][1].copy()
        w = float(np.clip(parent[-1] + rng.normal(0, 0.05), 0.2, 1.0))
        P = parent[:-1].reshape(n, 3).copy()
        sx = w / parent[-1]
        sy = (2 - w) / (2 - parent[-1])
        P[:, 0] *= sx
        P[:, 1] *= sy
        P[:, :2] += rng.normal(0, 0.02, (n, 2))
        P[:, 2] *= 0.8
        pop.append(polish(np.concatenate([P.ravel(), [w]])))
