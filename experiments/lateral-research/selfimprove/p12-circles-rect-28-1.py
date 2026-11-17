def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    best_s = cur_s
    while True:
        y = cur.copy()
        w = y[-1]
        k = int(rng.integers(1, 5))
        for i in rng.choice(n, k, replace=False):
            y[3*i] = rng.uniform(0, w)
            y[3*i+1] = rng.uniform(0, 2 - w)
            y[3*i+2] = 0.005
        y[:-1] += rng.normal(0, 0.01, size=len(y) - 1) * (np.arange(len(y) - 1) % 3 != 2)
        s, z = polish(y)
        if s > cur_s or rng.random() < np.exp((s - cur_s) / 0.01):
            cur_s, cur = s, z
        if cur_s > best_s:
            best_s = cur_s
