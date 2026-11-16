def search(problem, rng, polish):
    n = problem.n
    best = (-1.0, None)
    while True:
        cur_s, cur = polish(problem.random(rng))
        if cur_s > best[0]:
            best = (cur_s, cur)
        stall = 0
        while stall < 25:
            c = cur.reshape(n, 3).copy()
            i = int(rng.integers(n))
            order = np.argsort(np.abs(c[:, 2] - c[i, 2]))[::-1]
            j = int(order[int(rng.integers(0, max(1, n // 3)))])
            if i == j:
                stall += 1
                continue
            pi, pj = c[i, :2].copy(), c[j, :2].copy()
            c[i, :2], c[j, :2] = pj, pi
            c[:, 2] *= 0.85
            s, xp = polish(c.ravel())
            if s > cur_s + 1e-9:
                cur_s, cur, stall = s, xp, 0
            else:
                stall += 1
                if s >= cur_s - 1e-9:
                    cur = xp
            if cur_s > best[0]:
                best = (cur_s, cur)
    return best
