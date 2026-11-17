def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    best = cur_s
    T = 0.02
    while True:
        x = cur.copy()
        m = rng.integers(1, 6)
        idx = rng.choice(n, m, replace=False)
        w = x[-1]
        for i in idx:
            if rng.random() < 0.5:
                x[3*i] = rng.uniform(0, w)
                x[3*i+1] = rng.uniform(0, 2 - w)
                x[3*i+2] *= 0.3
            else:
                x[3*i:3*i+2] += rng.normal(0, 0.1, 2)
                x[3*i+2] *= 0.7
        x[-1] = np.clip(w + rng.normal(0, 0.03), 0.3, 1.0)
        s, xp = polish(x)
        if s > cur_s or rng.random() < np.exp((s - cur_s) / T):
            cur_s, cur = s, xp
        best = max(best, cur_s)
