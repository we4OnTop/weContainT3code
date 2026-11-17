def search(problem, rng, polish):
    n = problem.n
    best = [-1e9, None]
    cnt = [0]

    def P(x):
        cnt[0] += 1
        s, xp = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(xp, dtype=float)
        return s, xp

    sched = [1.4, 1.25, 1.12, 1.05, 1.0]
    while cnt[0] + len(sched) <= 145:
        x = np.array(problem.random(rng), dtype=float)
        for s in sched:
            y = x.copy()
            y[2:3 * n:3] *= s
            if s > 1:
                y[:3 * n].reshape(n, 3)[:, :2] += 0.03 * (s - 1) * rng.normal(size=(n, 2))
            sc, x = P(y)
            x = np.array(x, dtype=float)
    # refinement with leftover calls: repolish best
    while cnt[0] < 148:
        P(best[1])
    return best[0], best[1]
