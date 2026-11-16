def search(problem, rng, polish):
    n = problem.n
    pop = []
    for _ in range(8):
        pop.append(polish(problem.random(rng)))
    while True:
        i, j = rng.choice(len(pop), 2, replace=False)
        A = pop[i][1].reshape(n, 3)
        B = pop[j][1].reshape(n, 3).copy()
        if rng.random() < 0.5:
            B[:, [0, 1]] = B[:, [1, 0]]
        if rng.random() < 0.5:
            B[:, 0] = 1 - B[:, 0]
        if rng.random() < 0.5:
            B[:, 1] = 1 - B[:, 1]
        used = np.zeros(n, bool)
        M = np.zeros_like(B)
        for k in rng.permutation(n):
            d = ((B[:, :2] - A[k, :2]) ** 2).sum(1)
            d[used] = 9
            m = d.argmin()
            used[m] = True
            M[k] = B[m]
        w = rng.uniform(0.2, 0.8)
        C = (1 - w) * A + w * M
        C[:, 2] *= 0.8
        s, z = polish(C.ravel())
        worst = min(range(len(pop)), key=lambda q: pop[q][0])
        if s > pop[worst][0] and all(abs(s - p[0]) > 1e-7 for p in pop):
            pop[worst] = (s, z)
        elif rng.random() < 0.1:
            pop[worst] = polish(problem.random(rng))
