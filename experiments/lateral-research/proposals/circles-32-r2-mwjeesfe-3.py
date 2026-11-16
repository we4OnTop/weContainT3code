def search(problem, rng, polish):
    n = problem.n
    prof = np.linspace(0.12, 0.05, n)
    elites = []
    best = (-1.0, None)
    while True:
        target = np.sort(np.maximum(prof * rng.normal(1, 0.08, n), 0.01))[::-1]
        C = np.zeros((0, 3))
        for t in target:
            cand = rng.random((150, 2))
            clr = np.minimum(cand, 1 - cand).min(1)
            if len(C):
                dd = np.sqrt(((cand[:, None, :] - C[None, :, :2]) ** 2).sum(-1)) - C[:, 2]
                clr = np.minimum(clr, dd.min(1))
            b = int(np.argmax(clr))
            C = np.vstack([C, [cand[b, 0], cand[b, 1], max(min(t, clr[b]), 1e-3)]])
        s, xp = polish(C.ravel())
        if s > best[0]:
            best = (s, xp)
        elites.append((s, np.sort(xp.reshape(n, 3)[:, 2])[::-1]))
        elites.sort(key=lambda e: -e[0])
        elites = elites[:5]
        prof = np.mean([e[1] for e in elites], axis=0)
    return best
