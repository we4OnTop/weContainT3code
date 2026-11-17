def search(problem, rng, polish):
    n = problem.n
    cs, cur = polish(problem.random(rng))
    while True:
        y = cur.copy().reshape(n, 3)
        if rng.random() < 0.5:
            k = int(rng.integers(1, 4))
            order = np.argsort(y[:, 2])[:k + 3]
            for i in rng.choice(order, k, replace=False):
                y[i, :2] = rng.uniform(0.05, 0.95, 2)
                y[i, 2] = 0.01
        else:
            y[:, :2] += rng.normal(0, 0.04, (n, 2))
            y[:, :2] = np.clip(y[:, :2], 0.02, 0.98)
        s, x = polish(y.ravel())
        if s > cs or rng.random() < 0.1:
            cs, cur = s, x
