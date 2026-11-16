def search(problem, rng, polish):
    n = problem.n
    s, x = polish(problem.random(rng))
    while True:
        y = x.copy()
        c = y[:3 * n].reshape(n, 3)
        k = rng.integers(1, 5)
        idx = rng.choice(n, k, replace=False)
        c[idx, :2] += rng.normal(0, 0.12, (k, 2))
        c[idx, 2] *= 0.4
        c[:, :2] += rng.normal(0, 0.01, (n, 2))
        y[-1] = np.clip(y[-1] + rng.normal(0, 0.01), 1, 1.5)
        s2, x2 = polish(y)
        if s2 > s - 0.01 * rng.random():
            s, x = s2, x2
