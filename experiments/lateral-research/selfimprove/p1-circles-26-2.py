def search(problem, rng, polish):
    n = problem.n
    cur_s, cur_x = polish(problem.random(rng))
    while True:
        y = cur_x.copy().reshape(n, 3)
        k = int(rng.integers(1, 4))
        order = np.argsort(y[:, 2])
        pick = order[:k] if rng.random() < 0.7 else rng.choice(n, k, replace=False)
        for i in pick:
            others = np.delete(y, i, axis=0)
            P = rng.random((1500, 2))
            d = np.sqrt(((P[:, None, :] - others[None, :, :2]) ** 2).sum(-1)) - others[:, 2]
            clr = np.minimum(d.min(1), np.minimum(P, 1 - P).min(1))
            top = np.argsort(-clr)[:5]
            j = top[int(rng.integers(0, len(top)))]
            y[i, :2] = P[j]
            y[i, 2] = max(clr[j], 0.005)
        s, x = polish(y.ravel())
        if s > cur_s - 0.002 * rng.random():
            cur_s, cur_x = s, x
