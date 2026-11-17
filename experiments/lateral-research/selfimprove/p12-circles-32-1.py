def search(problem, rng, polish):
    n = problem.n
    cur, cx = polish(problem.random(rng))
    T = 0.02
    while True:
        x = cx.copy().reshape(n, 3)
        k = int(rng.integers(2, 8))
        idx = rng.choice(n, k, replace=False)
        x[idx, :2] += rng.normal(0, 0.08, (k, 2))
        if rng.random() < 0.5:
            a, b = rng.choice(n, 2, replace=False)
            x[[a, b], :2] = x[[b, a], :2]
        x[:, :2] = np.clip(x[:, :2], 0.02, 0.98)
        x[:, 2] *= 0.9
        s, xp = polish(x.ravel())
        if s > cur or rng.random() < np.exp((s - cur) / T):
            cur, cx = s, xp
