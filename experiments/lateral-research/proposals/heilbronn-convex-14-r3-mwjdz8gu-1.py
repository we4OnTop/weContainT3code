def search(problem, rng, polish):
    n = problem.n
    k = n // 2
    best = -1.0
    bx = None
    while True:
        if bx is not None and rng.random() < 0.4:
            x = bx + rng.normal(0, 0.02, bx.shape)
        else:
            nax = n - 2 * k
            px = rng.uniform(0.05, 1.0, k)
            py = rng.uniform(-1, 1, k)
            pts = [(px[i], py[i]) for i in range(k)] + [(-px[i], py[i]) for i in range(k)]
            ay = rng.uniform(-1, 1, nax)
            pts += [(0.0, ay[i]) for i in range(nax)]
            # no axis-only points allowed to be 3+ on one line: with n=14 nax=0, so add jitter
            x = np.array(pts).ravel()
            x = x + rng.normal(0, 0.003, x.shape)
        s, xp = polish(x)
        if s > best:
            best, bx = s, xp
