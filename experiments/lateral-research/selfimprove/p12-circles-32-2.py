def search(problem, rng, polish):
    n = problem.n
    cur, cx = polish(problem.random(rng))
    best, bx = cur, cx
    while True:
        x = bx.copy().reshape(n, 3)
        k = int(rng.integers(1, 6))
        order = np.argsort(x[:, 2] + rng.normal(0, 0.02, n))
        rem = order[:k]
        keep = np.ones(n, bool)
        keep[rem] = False
        for i in rem:
            P = rng.random((1500, 2))
            d = np.sqrt(((P[:, None, :] - x[keep][None, :, :2]) ** 2).sum(-1)) - x[keep][None, :, 2]
            d = d.min(1)
            d = np.minimum(d, np.minimum(P, 1 - P).min(1))
            j = int(np.argmax(d))
            x[i] = [P[j, 0], P[j, 1], max(d[j], 0.01) * 0.9]
            keep[i] = True
        s, xp = polish(x.ravel())
        if s > best:
            best, bx = s, xp
        elif rng.random() < 0.1:
            _, bx = best, bx
            bx = xp if rng.random() < 0.2 else bx
