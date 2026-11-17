def search(problem, rng, polish):
    n = problem.n
    cur, cx = polish(problem.random(rng))
    best = cur
    T = 0.02
    while True:
        y = cx.copy()
        k = int(rng.integers(1, 4))
        r = y[2:-1:3]
        if rng.random() < 0.5:
            ids = np.argsort(r)[:k]
        else:
            ids = rng.choice(n, k, replace=False)
        w = y[-1]
        h = 2 - w
        for i in ids:
            y[3 * i] = rng.uniform(0, w)
            y[3 * i + 1] = rng.uniform(0, h)
            y[3 * i + 2] = 0.005
        y[-1] = np.clip(w + rng.normal(0, 0.02), 0.3, 1.7)
        s, x = polish(y)
        if s > cur or rng.random() < np.exp((s - cur) / T):
            cur, cx = s, x
        best = max(best, s)
        T = max(0.002, T * 0.98)
