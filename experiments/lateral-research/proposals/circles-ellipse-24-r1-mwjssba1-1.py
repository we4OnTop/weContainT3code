def search(problem, rng, polish):
    n = problem.n
    s, x = polish(problem.random(rng))
    best_s, best_x = s, x
    fails = 0
    while True:
        y = x.copy()
        c = y[:3 * n].reshape(n, 3)
        a = y[-1]
        b = 1.0 / a
        i = rng.choice(np.argsort(c[:, 2])[:4])
        others = np.delete(c, i, axis=0)
        pts = rng.uniform(-1, 1, (400, 2)) * np.array([a, b]) * 0.95
        d = np.sqrt(((pts[:, None, :] - others[None, :, :2]) ** 2).sum(-1)) - others[None, :, 2]
        gap = d.min(1)
        # choose among the best few gaps for diversity
        j = rng.choice(np.argsort(-gap)[:5])
        c[i, :2] = pts[j]
        c[i, 2] = 0.01
        s2, x2 = polish(y)
        if s2 > s + 1e-9:
            s, x = s2, x2
            fails = 0
        else:
            fails += 1
        if s > best_s:
            best_s, best_x = s, x
        if fails > 12:
            s, x = polish(problem.random(rng))
            fails = 0
