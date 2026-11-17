def search(problem, rng, polish):
    n = problem.n
    pool = []
    for _ in range(6):
        pool.append(polish(problem.random(rng)))
    while True:
        i, j = rng.choice(len(pool), 2, replace=False)
        A = pool[i][1].reshape(n, 3)
        B = pool[j][1].reshape(n, 3)
        th = rng.uniform(0, np.pi)
        nv = np.array([np.cos(th), np.sin(th)])
        c = rng.uniform(0.3, 0.7)
        ma = (A[:, :2] @ nv) < c
        mb = (B[:, :2] @ nv) >= c
        ch = np.vstack([A[ma], B[mb]])
        if len(ch) > n:
            ch = ch[rng.choice(len(ch), n, replace=False)]
        while len(ch) < n:
            ch = np.vstack([ch, [*rng.random(2), 0.02]])
        ch[:, 2] *= 0.85
        ch[:, :2] += rng.normal(0, 0.005, (n, 2))
        s, xp = polish(ch.ravel())
        pool.append((s, xp))
        pool.sort(key=lambda t: -t[0])
        pool = pool[:8]
