def search(problem, rng, polish):
    n = problem.n
    pool = [polish(problem.random(rng)) for _ in range(10)]
    while True:
        pool.sort(key=lambda t: -t[0])
        pool = pool[:12]
        C = np.vstack([p[1].reshape(n, 3) for p in pool[:6]])
        order = np.argsort(-(C[:, 2] * rng.uniform(0.6, 1.4, len(C))))
        chosen = []
        tol = rng.uniform(0.6, 0.95)
        for i in order:
            ci = C[i]
            ok = True
            for j in chosen:
                cj = C[j]
                if np.hypot(ci[0] - cj[0], ci[1] - cj[1]) < tol * (ci[2] + cj[2]):
                    ok = False
                    break
            if ok:
                chosen.append(i)
                if len(chosen) == n:
                    break
        z = np.zeros((n, 3))
        k = len(chosen)
        if k:
            z[:k] = C[chosen]
        z[k:, :2] = rng.random((n - k, 2))
        z[k:, 2] = 0.02
        s, x = polish(z.ravel())
        if all(abs(s - p[0]) > 1e-9 for p in pool):
            pool.append((s, x))
