def search(problem, rng, polish):
    n = problem.n
    best = (-1.0, None)
    while True:
        pos = rng.random((n, 2))
        Rend = rng.uniform(0.08, 0.13)
        for R in np.linspace(0.02, Rend, 60):
            for _ in range(5):
                d = pos[:, None, :] - pos[None, :, :]
                dist = np.sqrt((d ** 2).sum(-1)) + np.eye(n) * 1e9
                ov = np.maximum(2 * R - dist, 0)
                pos = pos + 0.5 * ((ov / dist)[:, :, None] * d).sum(1)
                pos = np.clip(pos, R, 1 - R)
        x = np.column_stack([pos, np.full(n, Rend * 0.9)]).ravel()
        s, xp = polish(x)
        if s > best[0]:
            best = (s, xp)
    return best
