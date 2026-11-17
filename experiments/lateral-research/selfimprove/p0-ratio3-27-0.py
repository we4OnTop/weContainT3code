def search(problem, rng, polish):
    n = problem.n
    best = (-np.inf, None)
    for _ in range(150):
        k = int(rng.integers(0, 2))
        m = n - k
        a = int(rng.integers(m // 3, 2 * m // 3 + 1))
        d = rng.normal(size=(n, 3))
        d /= np.linalg.norm(d, axis=1)[:, None]
        r = np.empty(n)
        r[:k] = 0.0
        r[k:k + a] = 1.0
        r[k + a:] = rng.uniform(1.4, 2.4)
        x = (d * r[:, None] + rng.normal(scale=0.05, size=(n, 3))).ravel()
        s, xp = polish(x)
        if s > best[0]:
            best = (s, xp)
    return best
