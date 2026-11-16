def search(problem, rng, polish):
    n = problem.n
    I, J, K = (np.array(t) for t in zip(*[(i, j, k) for i in range(n) for j in range(i+1, n) for k in range(j+1, n)]))
    def hull(P):
        P = P[np.lexsort((P[:, 1], P[:, 0]))]
        def half(Q):
            h = []
            for p in Q:
                while len(h) > 1 and (h[-1][0]-h[-2][0])*(p[1]-h[-2][1]) - (h[-1][1]-h[-2][1])*(p[0]-h[-2][0]) <= 0:
                    h.pop()
                h.append(p)
            return h
        H = np.array(half(P)[:-1] + half(P[::-1])[:-1])
        x, y = H[:, 0], H[:, 1]
        return abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2
    def sc(P):
        a = np.abs((P[J, 0]-P[I, 0])*(P[K, 1]-P[I, 1]) - (P[K, 0]-P[I, 0])*(P[J, 1]-P[I, 1])) / 2
        return a.min() / max(hull(P), 1e-12)
    best = (-1, None)
    while True:
        P = problem.random(rng).reshape(n, 2).copy()
        cur = sc(P)
        steps = 4000
        T0 = 0.01
        for t in range(steps):
            T = T0 * (1 - t/steps) + 1e-5
            step = 0.3 * (1 - t/steps) + 0.01
            i = int(rng.integers(n))
            old = P[i].copy()
            P[i] = old + step * rng.standard_normal(2)
            new = sc(P)
            if new >= cur or rng.random() < np.exp((new - cur) / T):
                cur = new
            else:
                P[i] = old
        s, x = polish(P.ravel())
        if s > best[0]:
            best = (s, x)
