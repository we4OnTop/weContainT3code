def search(problem, rng, polish):
    n = problem.n
    while True:
        cur, x = polish(problem.random(rng))
        fails = 0
        while fails < 12:
            sigma = 10 ** rng.uniform(-2.6, -0.8)
            y = x.reshape(n, 3).copy()
            y[:, :2] += rng.normal(0, sigma, (n, 2))
            y[:, :2] = np.clip(y[:, :2], 0.01, 0.99)
            y[:, 2] *= rng.uniform(0.5, 0.95)
            s, z = polish(y.ravel())
            if s > cur + 1e-9:
                cur, x, fails = s, z, 0
            else:
                fails += 1
