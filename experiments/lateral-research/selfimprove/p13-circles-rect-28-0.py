def search(problem, rng, polish):
    n = problem.n; B = 150; ex = 112; pool = []; cnt = [0]
    def run(x):
        cnt[0] += 1
        s, xp = polish(np.asarray(x, float)); xp = np.array(xp)
        for i, p in enumerate(pool):
            if abs(s - p[0]) < 1e-9:
                if s > p[0]: pool[i] = (s, xp)
                break
        else:
            pool.append((s, xp))
        pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, xp
    def finish():
        while cnt[0] < B and pool:
            moved = False
            for s0, x0 in list(pool):
                if cnt[0] >= B: break
                s, _ = run(x0)
                if abs(s - s0) > 1e-13: moved = True
            if not moved: break
        return pool[0]
    ii = np.arange(-40, 41); I, J = np.meshgrid(ii, ii); I = I.ravel() * 1.0; J = J.ravel() * 1.0
    def pts(kind, a, ang, off, s, w, h):
        X = (I + s * (J % 2)) * a; Y = J * a * (0.866 if kind == 0 else 1.0)
        c, sn = np.cos(ang), np.sin(ang)
        Xr = X * c - Y * sn + off[0]; Yr = X * sn + Y * c + off[1]
        m = 0.45 * a
        k = (Xr >= m) & (Xr <= w - m) & (Yr >= m) & (Yr <= h - m)
        return np.column_stack([Xr[k], Yr[k]])
    ws = [1.0, 0.9, 0.8, 0.7, 0.95, 0.85, 0.6, 0.75]
    angs = np.deg2rad([0, 15, 30, 45, 60, 75, 90])
    def make(t):
        w = min(1.0, ws[t % len(ws)] + rng.uniform(-0.03, 0.03)); h = 2 - w
        kind = (t // len(ws)) % 3
        s = 0.5 if kind == 0 else (0.0 if kind == 1 else rng.uniform(0.1, 0.5))
        ang = angs[rng.integers(len(angs))]
        off = rng.uniform(0, 0.2, 2) + np.array([w / 2, h / 2]) * 0
        for a in np.linspace(0.5, 0.1, 80):
            P = pts(kind, a, ang, off, s, w, h)
            if len(P) >= n: break
        if len(P) > n:
            P = np.delete(P, rng.choice(len(P), len(P) - n, replace=False), 0)
        while len(P) < n:
            P = np.vstack([P, [rng.uniform(0, w), rng.uniform(0, h)]])
        return np.r_[np.column_stack([P, np.full(n, 0.45 * a)]).ravel(), w]
    t = 0
    while cnt[0] < ex:
        run(make(t)); t += 1
    return finish()
