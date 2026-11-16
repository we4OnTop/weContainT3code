def search(problem, rng, polish):
    n = problem.n
    pop = []
    for _ in range(10):
        pop.append(polish(problem.random(rng)))
    while True:
        i, j = rng.choice(len(pop), 2, replace=False)
        A = pop[i][1].reshape(n, 2)
        B = pop[j][1].reshape(n, 2)
        th = rng.uniform(0, 2*np.pi)
        d = np.array([np.cos(th), np.sin(th)])
        c = np.array([rng.uniform(0.1, 0.5), rng.uniform(0.1, 0.5)])
        L = A[(A - c) @ d > 0]
        R = B[(B - c) @ d <= 0]
        P = np.vstack([L, R])
        if len(P) > n:
            P = P[rng.permutation(len(P))[:n]]
        while len(P) < n:
            P = np.vstack([P, problem.random(rng)[:2]])
        P = P + rng.normal(0, 0.005, P.shape)
        P = np.clip(P, 0, 1)
        s = P.sum(1)
        m = s > 1
        P[m] /= s[m, None]
        r = polish(P.ravel())
        w = min(range(len(pop)), key=lambda k: pop[k][0])
        if r[0] > pop[w][0]:
            pop[w] = r
