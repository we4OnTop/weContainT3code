def search(problem, rng, polish):
    n = problem.n
    best, bx = polish(problem.random(rng))
    while True:
        P = bx.reshape(n, 2)
        P = P - P.mean(0)
        P = P / (np.abs(P).max() + 1e-12)
        s = rng.uniform(0.05, 0.6)
        for _ in range(50):
            h = rng.normal(0, s, 2)
            w = 1 + P @ h
            if w.min() > 0.3:
                break
        else:
            w = np.ones(n)
            h = np.zeros(2)
        Q = P / w[:, None]
        Q = Q + rng.normal(0, 0.005, Q.shape)
        sc, xp = polish(Q.ravel())
        if sc > best:
            best, bx = sc, xp
        elif rng.random() < 0.05:
            sc, xp = polish(problem.random(rng))
            if sc > best * 0.7:
                best, bx = sc, xp
