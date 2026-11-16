def search(problem, rng, polish):
    n = problem.n
    pop = []
    for _ in range(8):
        pop.append(polish(problem.random(rng)))
    while True:
        a, b = rng.choice(len(pop), 2, replace=False)
        A = np.array(pop[a][1], dtype=float)
        B = np.array(pop[b][1], dtype=float)
        wa, wb = A[-1], B[-1]
        PA = A[:3 * n].reshape(n, 3)
        PB = B[:3 * n].reshape(n, 3)
        if rng.random() < 0.5:
            PA, PB, wa, wb = PB, PA, wb, wa
        w = wa
        h = 2 - w
        cut = rng.uniform(0.2, 0.8) * w
        left = PA[PA[:, 0] < cut]
        Q = PB.copy()
        Q[:, 0] = Q[:, 0] * w / wb
        Q[:, 1] = Q[:, 1] * h / (2 - wb)
        right = Q[Q[:, 0] >= cut]
        C = np.vstack([left, right])
        if len(C) > n:
            C = C[np.argsort(-C[:, 2])[:n]]
        while len(C) < n:
            C = np.vstack([C, [rng.uniform(0, w), rng.uniform(0, h), 0.01]])
        C = C.copy()
        C[:, :2] += rng.normal(0, 0.01, (n, 2))
        x = np.concatenate([C.reshape(-1), [w]])
        s, z = polish(x)
        worst = min(range(len(pop)), key=lambda i: pop[i][0])
        if s > pop[worst][0]:
            pop[worst] = (s, z)
        elif rng.random() < 0.1:
            pop[worst] = polish(problem.random(rng))
