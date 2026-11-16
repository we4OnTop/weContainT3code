def search(problem, rng, polish):
    n = problem.n
    while True:
        P = rng.normal(size=(3, 3))
        P = P / np.linalg.norm(P, axis=1, keepdims=True)
        while len(P) < n:
            c = P.mean(0)
            R = np.linalg.norm(P - c, axis=1).max() * rng.uniform(0.9, 1.3)
            C = rng.normal(size=(400, 3))
            C = C / np.linalg.norm(C, axis=1, keepdims=True) * R * rng.random((400, 1)) ** (1 / 3) + c
            D = np.linalg.norm(C[:, None] - P[None], axis=-1)
            pd = np.linalg.norm(P[:, None] - P[None], axis=-1)
            pd = pd[np.triu_indices(len(P), 1)]
            mx = np.maximum(pd.max(), D.max(1))
            mn = np.minimum(pd.min(), D.min(1))
            ratio = mx / np.maximum(mn, 1e-9)
            top = np.argsort(ratio)[:4]
            P = np.vstack([P, C[rng.choice(top)]])
        polish(P.ravel())
