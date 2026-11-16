def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    stale = 0
    while True:
        z = cur.copy().reshape(n, 3)
        z[:, 2] *= rng.uniform(0.4, 0.95)
        z[:, :2] += rng.normal(0, rng.uniform(0.005, 0.06), (n, 2))
        z[:, :2] = np.clip(z[:, :2], 0.0, 1.0)
        s, x = polish(z.ravel())
        if s > cur_s + 1e-12:
            cur_s, cur, stale = s, x, 0
        else:
            stale += 1
            if stale > 25:
                cur_s, cur = polish(problem.random(rng))
                stale = 0
