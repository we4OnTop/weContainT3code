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
    a = np.arange(-4, 5)
    g = np.array(np.meshgrid(a, a, a)).reshape(3, -1).T.astype(float)
    i2 = np.array(np.meshgrid(a, a)).reshape(2, -1).T.astype(float)
    def hexl(ab):
        pts = []
        for k in a:
            off = np.array([0.5, 0.5 / 3 ** .5]) * ((k % 2) if ab else 0)
            xy = i2[:, 0:1] * [1, 0] + i2[:, 1:2] * [.5, 3 ** .5 / 2] + off
            z = np.full((len(xy), 1), k * (2 / 3) ** .5 if ab else float(k))
            pts.append(np.hstack([xy, z]))
        return np.vstack(pts)
    lats = [g, g[g.sum(1) % 2 == 0] / 2 ** .5, np.vstack([g, g + .5]) * (2 / 3 ** .5), hexl(True), hexl(False)]
    shifts = np.array([[0, 0, 0], [.5, 0, 0], [.5, .5, 0], [.5, .5, .5], [0, 0, .5]], float)
    it = 0
    while st[0] < E:
        L = lats[it % 5]
        c = shifts[(it // 5) % 5] + (rng.uniform(-.3, .3, 3) if it >= 25 else 0)
        if it >= 25:
            q, _ = np.linalg.qr(rng.normal(size=(3, 3))); w = rng.uniform(.7, 1.4, 3)
        else:
            q = np.eye(3); w = np.ones(3)
        d = np.linalg.norm(((L - c) @ q) * w, axis=1) + rng.uniform(0, .02, len(L))
        x = L[np.argsort(d)[:n]]
        run(x + rng.normal(size=x.shape) * .03)
        it += 1
    finish()
    return pool[0] if pool else None
