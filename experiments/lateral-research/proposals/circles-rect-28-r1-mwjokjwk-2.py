def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    stall = 0
    while True:
        y = np.array(cur, dtype=float)
        P = y[:3 * n].reshape(n, 3)
        w = y[-1]
        h = 2 - w
        k = int(rng.integers(1, 5))
        order = np.argsort(P[:, 2])
        rem = order[:k]
        keep = np.ones(n, bool)
        keep[rem] = False
        for i in rem:
            S = np.column_stack([rng.uniform(0, w, 1500), rng.uniform(0, h, 1500)])
            d = np.sqrt(((S[:, None, :] - P[None, keep, :2]) ** 2).sum(-1)) - P[keep, 2][None, :]
            d = np.minimum(d.min(1), np.minimum.reduce([S[:, 0], w - S[:, 0], S[:, 1], h - S[:, 1]]))
            j = int(np.argmax(d + rng.normal(0, 0.01, len(d))))
            P[i] = [S[j, 0], S[j, 1], max(d[j], 0.005)]
            keep[i] = True
        y[:3 * n] = P.reshape(-1)
        s, z = polish(y)
        if s > cur_s:
            cur_s, cur, stall = s, z, 0
        else:
            stall += 1
            if stall > 25:
                cur_s, cur = polish(problem.random(rng))
                stall = 0
