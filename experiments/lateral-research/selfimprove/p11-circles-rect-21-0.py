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
    I = np.arange(-40, 41)
    ii, jj = np.meshgrid(I, I); ii = ii.ravel(); jj = jj.ravel()
    def lattice(kind, w, h, th, off):
        d = 0.7
        while True:
            if kind == 0: a = d * (ii + 0.5 * jj); b = d * 0.8660254 * jj
            else: a = d * ii; b = d * jj
            X = np.cos(th) * a - np.sin(th) * b + w / 2 + off[0] * d
            Y = np.sin(th) * a + np.cos(th) * b + h / 2 + off[1] * d
            m = 0.4 * d
            k = (X >= m) & (X <= w - m) & (Y >= m) & (Y <= h - m)
            if k.sum() >= n or d < 0.06: return X[k], Y[k], d
            d *= 0.97
    while calls[0] < LIM:
        w = 1.0 if rng.random() < 0.25 else rng.uniform(0.7, 1.0); h = 2 - w
        th = rng.choice([0, np.pi / 6, np.pi / 12]) if rng.random() < 0.5 else rng.uniform(0, np.pi / 3)
        X, Y, d = lattice(int(rng.integers(2)), w, h, th, rng.uniform(-0.5, 0.5, 2))
        if len(X) > n:
            k = rng.choice(len(X), n, replace=False); X, Y = X[k], Y[k]
        while len(X) < n:
            X = np.append(X, rng.uniform(0, w)); Y = np.append(Y, rng.uniform(0, h))
        P(np.append(np.column_stack([X, Y, np.full(n, 0.45 * d)]).ravel(), w))
    return finish()
