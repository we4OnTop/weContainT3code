def search(problem, rng, polish):
    while True:
        q = problem.random(rng).reshape(-1, 2)[:5]
        t = rng.uniform(0.05, 0.45)
        P = np.vstack([q, q[:, ::-1], [[t, t]]])
        P = P + rng.normal(0, 1e-3, P.shape)
        polish(np.clip(P, 0, 1).ravel())
