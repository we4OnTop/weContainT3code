def search(problem, rng, polish):
    n = problem.n; calls = [0]; pool = []; LIM = 112
    def P(x):
        calls[0] += 1
        s, xp = polish(np.asarray(x, float))
        xp = np.array(xp, float)
        if np.isfinite(s):
            j = [i for i, t in enumerate(pool) if abs(t[0] - s) <= 1e-9]
            if not j: pool.append((s, xp))
            elif s > pool[j[0]][0]: pool[j[0]] = (s, xp)
            pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, xp
    def finish():
        moved = True
        while moved and calls[0] < 150:
            moved = False
            for s0, x0 in list(pool):
                if calls[0] >= 150: break
                s, _ = P(x0)
                if s - s0 > 1e-13: moved = True
        return pool[0][1]
    def comps(rem, k, lo):
        if k == 1: return [(rem,)] if rem >= lo else []
        out = []
        for a in range(lo, rem // k + 1):
            out += [(a,) + t for t in comps(rem - a, k - 1, a)]
        return out
    allc = [(c0,) + t for c0 in (0, 1) for k in (2, 3, 4) for t in comps(n - c0, k, 3)]
    while calls[0] < LIM:
        for ci in rng.permutation(len(allc)):
            if calls[0] >= LIM: break
            c0, rings = allc[ci][0], allc[ci][1:]
            w = 1.0 if rng.random() < 0.3 else rng.uniform(0.7, 1.0); h = 2 - w
            K = len(rings); pts = []
            if c0: pts.append((w / 2, h / 2))
            for k, c in enumerate(rings, 1):
                a = (w / 2 - 0.05) * k / K; b = (h / 2 - 0.05) * k / K
                t = 2 * np.pi * np.arange(c) / c + rng.uniform(0, 2 * np.pi)
                pts += list(zip(w / 2 + a * np.cos(t), h / 2 + b * np.sin(t)))
            p = np.array(pts) + rng.normal(0, 1e-3, (n, 2))
            D = np.hypot(*(p[:, None] - p[None]).transpose(2, 0, 1)) + 9 * np.eye(n)
            r = min(0.2, 0.45 * D.min())
            P(np.append(np.column_stack([p, np.full(n, r)]).ravel(), w))
    return finish()
