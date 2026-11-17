def search(problem, rng, polish):
    n = problem.n
    best = polish(problem.random(rng))
    for _ in range(149):
        P = best[1].reshape(n, 3).copy()
        D = np.linalg.norm(P[:, None] - P[None], axis=2)
        iu = np.triu_indices(n, 1)
        v = D[iu]
        mode = rng.random()
        if mode < 0.5:
            idx = np.argsort(v)[-int(rng.integers(1, 4))]
        else:
            idx = np.argsort(v)[int(rng.integers(0, 3))]
        i = iu[0][idx] if rng.random() < 0.5 else iu[1][idx]
        c = P.mean(0)
        rad = np.linalg.norm(P - c, axis=1).mean()
        P[i] = c + rng.normal(size=3) * rad * 0.5
        s, xp = polish(P.ravel())
        if s > best[0]:
            best = (s, xp)
    return best
