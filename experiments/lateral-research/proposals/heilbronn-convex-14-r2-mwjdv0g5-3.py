def search(problem, rng, polish):
    n = problem.n
    m = n // 2
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
    def build(r, phi):
        t = 2*np.pi*np.arange(m)/m
        A = np.c_[np.cos(t), np.sin(t)]
        B = r*np.c_[np.cos(t+phi), np.sin(t+phi)]
        P = np.vstack([A, B])
        if len(P) < n:
            P = np.vstack([P, [[0.0, 0.0]]])
        return P
    params = [(rng.uniform(0.2, 0.95), rng.uniform(0, 2*np.pi/m)) for _ in range(1500)]
    ranked = sorted(params, key=lambda p: -sc(build(*p)))
    best = (-1, None)
    k = 0
    while True:
        r, phi = ranked[k % 20]
        k += 1
        P = build(r, phi) + (0.005 + 0.02*rng.random()) * rng.standard_normal((n, 2))
        s, x = polish(P.ravel())
        if s > best[0]:
            best = (s, x)
