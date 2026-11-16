def search(problem, rng, polish):
    n = problem.n
    pool = [polish(problem.random(rng)) for _ in range(8)]
    while True:
        a, b = rng.choice(len(pool), 2, replace=False)
        A = pool[a][1].reshape(n, 3)
        B = pool[b][1].reshape(n, 3)
        th = rng.random() * 2 * np.pi
        d = np.array([np.cos(th), np.sin(th)])
        c = 0.3 + 0.4 * rng.random(2)
        sa = (A[:, :2] - c) @ d > 0
        sb = (B[:, :2] - c) @ d <= 0
        child = np.vstack([A[sa], B[sb]])
        if len(child) > n:
            child = child[rng.choice(len(child), n, replace=False)]
        while len(child) < n:
            child = np.vstack([child, [*rng.random(2), 0.01]])
        child[:, :2] += rng.normal(0, 0.005, (n, 2))
        child[:, :2] = np.clip(child[:, :2], 0, 1)
        s, x = polish(child.ravel())
        worst = min(range(len(pool)), key=lambda i: pool[i][0])
        if s > pool[worst][0] and all(abs(s - p[0]) > 1e-9 for p in pool):
            pool[worst] = (s, x)
