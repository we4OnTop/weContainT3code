def search(problem, rng, polish):
    n = problem.n
    t = np.linspace(0.01, 0.99, 48)
    G = np.stack(np.meshgrid(t, t), -1).reshape(-1, 2)
    while True:
        k = int(rng.integers(int(0.3 * n), int(0.75 * n)))
        P = rng.random((k, 2))
        for _ in range(15):
            a = ((G[:, None] - P[None]) ** 2).sum(-1).argmin(1)
            for i in range(k):
                m = a == i
                if m.any():
                    P[i] = G[m].mean(0)
        D = np.sqrt(((P[:, None] - P[None]) ** 2).sum(-1)) + np.eye(k) * 9
        r = 0.95 * np.minimum(D.min(1) / 2, np.minimum(P, 1 - P).min(1))
        C = [(p[0], p[1], q) for p, q in zip(P, r)]
        for _ in range(n - k):
            S = rng.random((500, 2))
            cl = np.minimum(S, 1 - S).min(1)
            for c in C:
                cl = np.minimum(cl, np.hypot(S[:, 0] - c[0], S[:, 1] - c[1]) - c[2])
            m = cl.argmax()
            C.append((S[m, 0], S[m, 1], max(cl[m], 1e-3) * 0.9))
        polish(np.array(C).ravel())
