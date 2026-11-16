def search(problem, rng, polish):
    n = problem.n
    while True:
        x = np.array(problem.random(rng), dtype=float)
        a = rng.uniform(1.0, 1.2)
        b = 1.0 / a
        t = rng.uniform(0, 2*np.pi, n)
        u = np.sqrt(rng.uniform(0, 1, n)) * 0.8
        p = np.stack([a*u*np.cos(t), b*u*np.sin(t)], 1)
        w = rng.lognormal(0, rng.uniform(0.1, 0.6), n)
        r = 0.02 * w
        for it in range(300):
            r = r * 1.02
            d = p[:, None, :] - p[None, :, :]
            dist = np.sqrt((d**2).sum(2)) + np.eye(n)
            ov = (r[:, None] + r[None, :] - dist)
            np.fill_diagonal(ov, 0)
            ov = np.maximum(ov, 0)
            p = p + 0.5 * ((ov / dist)[:, :, None] * d).sum(1) * 0.5
            e = np.sqrt((p[:, 0]/a)**2 + (p[:, 1]/b)**2)
            out = e > 1 - r * 1.0
            s = np.where(out, (1 - r) / np.maximum(e, 1e-9), 1.0)
            p = p * s[:, None]
            if ov.max() > 0.02:
                r = r * 0.99
        x[:3*n] = np.column_stack([p, r * 0.9]).ravel()
        x[-1] = a
        polish(x)
