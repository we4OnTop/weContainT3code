def search(problem, rng, polish):
    n = problem.n
    h = n // 2
    while True:
        x0 = np.array(problem.random(rng), dtype=float)
        C = x0[:3 * n].reshape(n, 3).copy()
        C[h:2 * h, 0] = -C[:h, 0]
        C[h:2 * h, 1] = -C[:h, 1]
        C[h:2 * h, 2] = C[:h, 2]
        if n % 2:
            C[-1] = [0.0, 0.0, 0.05]
        C[:, :2] += rng.normal(0, 0.003, (n, 2))
        x = np.concatenate([C.ravel(), [x0[-1]]])
        polish(x)
