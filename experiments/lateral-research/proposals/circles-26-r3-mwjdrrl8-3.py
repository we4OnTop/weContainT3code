def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    stale = 0
    while True:
        z = cur.copy().reshape(n, 3)
        for _ in range(20):
            c = rng.random(2)
            h = rng.uniform(0.2, 0.45)
            m = (np.abs(z[:, 0] - c[0]) < h) & (np.abs(z[:, 1] - c[1]) < h)
            if m.sum() >= 3:
                break
            h = 0.5
            m = (np.abs(z[:, 0] - c[0]) < h) & (np.abs(z[:, 1] - c[1]) < h)
        k = int(rng.integers(1, 8))
        dx = z[m, 0] - c[0]
        dy = z[m, 1] - c[1]
        if k & 1:
            dx = -dx
        if k & 2:
            dy = -dy
        if k & 4:
            dx, dy = dy, dx
        z[m, 0] = c[0] + dx + rng.normal(0, 0.01, m.sum())
        z[m, 1] = c[1] + dy + rng.normal(0, 0.01, m.sum())
        z[:, :2] = np.clip(z[:, :2], 0, 1)
        z[:, 2] *= 0.9
        s, x = polish(z.ravel())
        if s > cur_s - 0.003 * rng.exponential():
            if s > cur_s + 1e-12:
                stale = 0
            else:
                stale += 1
            cur_s, cur = s, x
        else:
            stale += 1
        if stale > 40:
            cur_s, cur = polish(problem.random(rng))
            stale = 0
