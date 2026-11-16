def search(problem, rng, polish):
    n = problem.n
    best, bx = polish(problem.random(rng))
    for _ in range(299):
        y = bx.copy().reshape(n, 3)
        k = int(rng.integers(1, 4))
        idx = rng.choice(n, k, replace=False)
        y[idx, :2] = rng.random((k, 2))
        y[idx, 2] = 0.01
        y[:, :2] += rng.normal(0, 0.005, (n, 2))
        s, x = polish(y.ravel())
        if s > best:
            best, bx = s, x
    return bx
