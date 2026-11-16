def search(problem, rng, polish):
    n = problem.n
    T = np.array([(i, j, k) for i in range(n) for j in range(i + 1, n) for k in range(j + 1, n)])
    def cr(P):
        a, b, c = P[:, T[:, 0]], P[:, T[:, 1]], P[:, T[:, 2]]
        return np.abs((b[..., 0] - a[..., 0]) * (c[..., 1] - a[..., 1]) - (c[..., 0] - a[..., 0]) * (b[..., 1] - a[..., 1]))
    best, bx = polish(problem.random(rng))
    cur = bx
    fails = 0
    while True:
        P = cur.reshape(n, 2)
        k = np.argmin(cr(P[None])[0])
        v = rng.choice(T[k])
        C = 1500
        u = rng.random((C, 2))
        f = u.sum(axis=1) > 1
        u[f] = 1 - u[f]
        Q = np.repeat(P[None], C, axis=0)
        Q[:, v] = u
        j = np.argmax(cr(Q).min(axis=1))
        s, y = polish(Q[j].ravel())
        if s > best:
            best, bx, fails = s, y, 0
            cur = y
        else:
            fails += 1
            cur = bx if fails % 5 else np.clip(bx + rng.normal(0, 0.05, problem.dim), 0, 1)
            if fails > 40:
                best, bx = polish(problem.random(rng))
                cur, fails = bx, 0
