def search(problem, rng, polish):
    n = problem.n
    best = [-np.inf, None]
    calls = [0]
    def P(x):
        if calls[0] >= 149:
            return
        calls[0] += 1
        s, y = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(y, dtype=float)
    r = np.arange(-3, 4)
    G = np.array([(i, j, k) for i in r for j in r for k in r], dtype=float)
    kinds = [G, G[(G.sum(1) % 2) == 0], np.vstack([G, G + 0.5])]
    # exploration: ~95 lattice starts
    for t in range(95):
        L = kinds[t % 3]
        c = rng.uniform(-.5, .5, 3) if t % 4 else np.zeros(3)
        idx = np.argsort(((L - c) ** 2).sum(1) + 1e-9 * rng.random(len(L)))[:n]
        X = L[idx] - L[idx].mean(0)
        X = X + rng.normal(0, rng.choice([0.03, 0.1, 0.25]), X.shape)
        P(X.ravel())
    # refinement: ~54 perturbations of the best, final calls re-polish best
    t = 0
    while calls[0] < 149:
        if best[1] is None:
            P(problem.random(rng)); continue
        t += 1
        sig = [0.01, 0.03, 0.08][t % 3]
        if calls[0] >= 147:
            P(best[1])
        else:
            P(best[1] + rng.normal(0, sig, best[1].shape) * (np.abs(best[1]).mean() + 1e-9))
    return best[0], best[1]
