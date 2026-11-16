def search(problem, rng, polish):
    m = problem.n // 2
    best_s, best = -1.0, None
    for _ in range(150):
        p = rng.uniform(-1, 1, (m, 2))
        x = np.vstack([p, -p])
        if problem.n % 2:
            x = np.vstack([x, rng.uniform(-1, 1, (1, 2))])
        x = x.ravel() + rng.normal(0, 1e-3, problem.dim)
        s, y = polish(x)
        if s > best_s:
            best_s, best = s, y
    for _ in range(150):
        s, y = polish(best + rng.normal(0, 0.03, best.shape))
        if s > best_s:
            best_s, best = s, y
    return best_s, best
