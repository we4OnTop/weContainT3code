def search(problem, rng, polish):
    n = problem.n; B = 150; E = 112; st = [0]; pool = []
    def run(x):
        st[0] += 1
        s, y = polish(np.asarray(x, float).ravel())
        if np.isfinite(s) and np.all(np.isfinite(y)):
            for i, (ps, py) in enumerate(pool):
                if abs(ps - s) < 1e-9 * max(1.0, abs(s)):
                    if s > ps: pool[i] = (s, y)
                    break
            else:
                pool.append((s, y))
            pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, y
    def finish():
        while st[0] < B and pool:
            imp = False
            for s0, x0 in list(pool):
                if st[0] >= B: return
                s, _ = run(x0)
                if s - s0 > 1e-13: imp = True
            if not imp: return
    comps = []
    for c0 in (0, 1):
        rem = n - c0
        for n1 in range(4, 17):
            n2 = rem - n1
            if n1 <= n2 <= 30: comps.append((c0, [n1, n2]))
            for m2 in range(n1, rem - n1):
                m3 = rem - n1 - m2
                if m2 <= m3 <= 24: comps.append((c0, [n1, m2, m3]))
    def fib(k):
        i = np.arange(k) + .5
        ph = np.arccos(1 - 2 * i / k); th = np.pi * (1 + 5 ** .5) * i
        return np.stack([np.sin(ph) * np.cos(th), np.sin(ph) * np.sin(th), np.cos(ph)], 1)
    order = []
    while st[0] < E:
        if not order:
            order = list(rng.permutation(len(comps)))
        c0, cnt = comps[order.pop()]
        P = [np.zeros((1, 3))] if c0 else []
        r = 0.0 if c0 else -0.85
        for k in cnt:
            r = max(np.sqrt(k * .866 / (4 * np.pi)), r + .85) * rng.uniform(.95, 1.1)
            q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
            P.append(r * fib(k) @ q)
        P = np.vstack(P)
        run(P + rng.normal(size=P.shape) * .03)
    finish()
    return pool[0] if pool else None
