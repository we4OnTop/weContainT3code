def search(problem, rng, polish):
    n = problem.n
    pool = []
    for _ in range(8):
        s, x = polish(problem.random(rng))
        pool.append((s, x))
    while True:
        i, j = rng.choice(len(pool), 2, replace=False)
        A = pool[i][1].reshape(n, 3)
        B = pool[j][1].reshape(n, 3)
        th = rng.uniform(0, 2 * np.pi)
        nv = np.array([np.cos(th), np.sin(th)])
        c = rng.uniform(0.3, 0.7, 2)
        ma = (A[:, :2] - c) @ nv > 0
        mb = (B[:, :2] - c) @ nv <= 0
        ch = np.vstack([A[ma], B[mb]])
        if len(ch) > n:
            ch = ch[rng.permutation(len(ch))[:n]]
        while len(ch) < n:
            ch = np.vstack([ch, [rng.uniform(0.05, 0.95), rng.uniform(0.05, 0.95), 0.01]])
        ch[:, :2] += rng.normal(0, 0.01, (n, 2))
        s, x = polish(ch.ravel())
        w = min(range(len(pool)), key=lambda k: pool[k][0])
        if s > pool[w][0]:
            pool[w] = (s, x)
