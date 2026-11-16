def search(problem, rng, polish):
    n = problem.n
    while True:
        x = np.array(problem.random(rng), dtype=float)
        a = rng.uniform(1.0, 1.15)
        b = 1.0 / a
        P = []
        for i in range(n):
            t = rng.uniform(0, 2*np.pi, 150)
            u = np.sqrt(rng.uniform(0, 1, 150)) * 0.97
            c = np.stack([a*u*np.cos(t), b*u*np.sin(t)], 1)
            cl = 1 - np.sqrt((c[:, 0]/a)**2 + (c[:, 1]/b)**2)
            cl = cl * b
            for (px, py, pr) in P:
                cl = np.minimum(cl, np.hypot(c[:, 0]-px, c[:, 1]-py) - pr)
            k = np.argmax(cl)
            r = max(cl[k] * 0.9, 1e-3)
            P.append((c[k, 0], c[k, 1], r))
        x[:3*n] = np.array(P).ravel()
        x[-1] = a
        polish(x)
