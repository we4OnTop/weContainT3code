def search(problem, rng, polish):
    n = problem.n
    pop = []
    for _ in range(12):
        s, x = polish(problem.random(rng))
        pop.append((s, x))
    for _ in range(288):
        i, j = rng.choice(len(pop), 2, replace=False)
        A = pop[i][1].reshape(n, 3)
        B = pop[j][1].reshape(n, 3)
        th = rng.random() * np.pi
        nv = np.array([np.cos(th), np.sin(th)])
        c = 0.3 + 0.4 * rng.random()
        pa = (A[:, :2] - 0.5) @ nv + 0.5 < c
        pb = (B[:, :2] - 0.5) @ nv + 0.5 >= c
        ch = np.vstack([A[pa], B[pb]])
        if len(ch) > n:
            ch = ch[np.argsort(-ch[:, 2])[:n]]
        elif len(ch) < n:
            extra = np.column_stack([rng.random((n - len(ch), 2)), np.full(n - len(ch), 0.01)])
            ch = np.vstack([ch, extra])
        ch = ch.copy()
        ch[:, 2] *= 0.8
        s, x = polish(ch.ravel())
        w = min(range(len(pop)), key=lambda k: pop[k][0])
        if s > pop[w][0] and all(abs(s - p[0]) > 1e-7 for p in pop):
            pop[w] = (s, x)
    return max(pop, key=lambda p: p[0])[1]
