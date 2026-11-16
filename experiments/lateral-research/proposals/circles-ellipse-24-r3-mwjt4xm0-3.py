def search(problem, rng, polish):
    n = problem.n
    best, bx = polish(problem.random(rng))
    stall = 0
    while True:
        x = np.array(bx, dtype=float)
        c = x[:3*n].reshape(n, 3)
        k = rng.integers(1, 4)
        for _ in range(k):
            i, j = rng.choice(n, 2, replace=False)
            c[i, 2], c[j, 2] = c[j, 2], c[i, 2]
            c[i, 2] *= 0.6
            c[j, 2] *= 0.6
        c[:, 2] *= 0.9
        x[:3*n] = c.ravel()
        sc, xn = polish(x)
        if sc > best + 1e-12:
            best, bx, stall = sc, xn, 0
        else:
            stall += 1
            if stall > 40:
                best, bx = polish(problem.random(rng))
                stall = 0
