def search(problem, rng, polish):
    n = problem.n
    def relax(P, R, steps=250):
        eye = np.eye(n)
        for _ in range(steps):
            d = P[:, None, :] - P[None, :, :]
            dist = np.sqrt((d ** 2).sum(-1)) + eye
            ov = np.maximum(R[:, None] + R[None, :] - dist, 0)
            np.fill_diagonal(ov, 0)
            F = ((ov / dist)[:, :, None] * d).sum(1)
            P = np.clip(P + 0.5 * F, R[:, None], 1 - R[:, None])
        return P
    while True:
        m = rng.uniform(0.06, 0.16)
        R = np.clip(rng.normal(m, m * rng.uniform(0.05, 0.4), n), 0.02, 0.3)
        P = relax(rng.random((n, 2)), R)
        x = np.column_stack([P, R * 0.9]).ravel()
        polish(x)
