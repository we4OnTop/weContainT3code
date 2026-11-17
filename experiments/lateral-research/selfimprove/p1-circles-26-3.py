def search(problem, rng, polish):
    n = problem.n
    pop = [polish(problem.random(rng)) for _ in range(12)]
    while True:
        a, b = rng.choice(len(pop), 2, replace=False)
        A = pop[a][1].reshape(n, 3); B = pop[b][1].reshape(n, 3)
        th = rng.random() * 2 * np.pi
        nv = np.array([np.cos(th), np.sin(th)])
        off = 0.5 + rng.normal(0, 0.1)
        sa = (A[:, :2] - 0.5) @ nv + 0.5 > off
        sb = (B[:, :2] - 0.5) @ nv + 0.5 <= off
        C = np.vstack([A[sa], B[sb]])
        if len(C) > n:
            C = C[np.argsort(-C[:, 2])[:n]]
        elif len(C) < n:
            m = n - len(C)
            extra = np.hstack([rng.random((m, 2)), np.full((m, 1), 0.01)])
            C = np.vstack([C, extra])
        C = C.copy()
        C[:, :2] += rng.normal(0, 0.003, (n, 2))
        s, x = polish(C.ravel())
        w = int(np.argmin([p[0] for p in pop]))
        if s > pop[w][0]:
            pop[w] = (s, x)
