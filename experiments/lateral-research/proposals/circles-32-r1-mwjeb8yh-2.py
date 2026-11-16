def search(problem, rng, polish):
    n = problem.n
    cs, cx = polish(problem.random(rng))
    best, bx = cs, cx
    T = 0.05
    for t in range(299):
        y = cx.copy().reshape(n, 3)
        k = int(rng.integers(2, 6))
        if rng.random() < 0.5:
            idx = np.argsort(y[:, 2])[:k]
        else:
            idx = rng.choice(n, k, replace=False)
        keep = np.ones(n, bool)
        keep[idx] = False
        for i in idx:
            cand = rng.random((300, 2))
            o = y[keep]
            d = np.sqrt(((cand[:, None, :] - o[None, :, :2]) ** 2).sum(-1)) - o[None, :, 2]
            d = np.minimum(d.min(1), np.minimum(cand, 1 - cand).min(1))
            j = int(np.argmax(d))
            y[i, :2] = cand[j]
            y[i, 2] = max(d[j], 0.005) * 0.9
            keep[i] = True
        s, x = polish(y.ravel())
        temp = T * (1 - t / 300) + 1e-6
        if s > cs or rng.random() < np.exp((s - cs) / temp):
            cs, cx = s, x
        if s > best:
            best, bx = s, x
    return bx
