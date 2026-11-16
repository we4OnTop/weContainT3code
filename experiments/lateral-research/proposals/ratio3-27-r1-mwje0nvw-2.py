def search(problem, rng, polish):
    n = problem.n
    pop = []
    for _ in range(12):
        sc, xp = polish(problem.random(rng))
        pop.append((sc, xp.reshape(n, 3)))

    def rot(p):
        q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        p = p - p.mean(0)
        return p @ q

    while True:
        i, j = rng.choice(len(pop), 2, replace=False)
        A = rot(pop[i][1])
        B = rot(pop[j][1])
        A = A / np.linalg.norm(A, axis=1).mean()
        B = B / np.linalg.norm(B, axis=1).mean()
        u = rng.normal(size=3)
        u /= np.linalg.norm(u)
        k = int(rng.integers(8, 20))
        ia = np.argsort(-(A @ u))[:k]
        ib = np.argsort(B @ u)[:n - k]
        child = np.vstack([A[ia], B[ib]]) + rng.normal(scale=0.01, size=(n, 3))
        sc, xp = polish(child.ravel())
        w = min(range(len(pop)), key=lambda t: pop[t][0])
        if sc > pop[w][0] and all(abs(sc - p[0]) > 1e-9 for p in pop):
            pop[w] = (sc, xp.reshape(n, 3))
    return max(pop, key=lambda t: t[0])
