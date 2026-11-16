def search(problem, rng, polish):
    n = problem.n
    best_s, best = polish(problem.random(rng))
    while True:
        y = best.copy().reshape(n, 3)
        mode = rng.integers(3)
        if mode == 0:
            y[:, :2] += rng.normal(0, rng.choice([0.01, 0.03, 0.08]), (n, 2))
        elif mode == 1:
            k = rng.integers(2, 5)
            idx = rng.choice(n, k, replace=False)
            y[idx, :2] = rng.random((k, 2))
            y[idx, 2] = 0.01
        else:
            i, j = rng.choice(n, 2, replace=False)
            y[[i, j], :2] = y[[j, i], :2]
        y[:, :2] = np.clip(y[:, :2], 0, 1)
        y[:, 2] = np.clip(y[:, 2], 0.005, 0.5)
        s, x = polish(y.ravel())
        if s > best_s:
            best_s, best = s, x
