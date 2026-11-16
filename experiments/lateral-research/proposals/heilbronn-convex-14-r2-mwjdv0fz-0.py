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
        H = half(P)[:-1] + half(P[::-1])[:-1]
        H = np.array(H)
        x, y = H[:, 0], H[:, 1]
        return abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2
    def sc(x):
        P = x.reshape(n, 2)
        a = np.abs((P[J, 0]-P[I, 0])*(P[K, 1]-P[I, 1]) - (P[K, 0]-P[I, 0])*(P[J, 1]-P[I, 1])) / 2
        return a.min() / max(hull(P), 1e-12)
    def make():
        h = int(rng.integers(5, 10))
        ang = np.sort(rng.uniform(0, 2*np.pi, h))
        rad = 1 + 0.05*rng.standard_normal(h)
        A = np.c_[rad*np.cos(ang), rad*np.sin(ang)]
        m = n - h
        r = 0.85*np.sqrt(rng.uniform(0, 1, m))
        t = rng.uniform(0, 2*np.pi, m)
        B = np.c_[r*np.cos(t), r*np.sin(t)]
        P = np.vstack([A, B]) * rng.uniform(0.7, 1.3, 2)
        return P.ravel()
    best = (-1, None)
    while True:
        cands = [make() for _ in range(300)]
        cands.sort(key=sc, reverse=True)
        for c in cands[:3]:
            s, x = polish(c)
            if s > best[0]:
                best = (s, x)
