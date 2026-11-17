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
    def gap(C, w, h, avoid=None):
        P = np.column_stack([rng.uniform(0, w, 800), rng.uniform(0, h, 800)])
        rad = np.minimum.reduce([P[:, 0], w - P[:, 0], P[:, 1], h - P[:, 1]])
        if len(C):
            d = np.hypot(P[:, None, 0] - C[None, :, 0], P[:, None, 1] - C[None, :, 1]) - C[None, :, 2]
            rad = np.minimum(rad, d.min(1))
        if avoid is not None:
            rad = np.where(np.hypot(P[:, 0] - avoid[0], P[:, 1] - avoid[1]) < avoid[2], -1, rad)
        k = rad.argmax()
        return np.array([P[k, 0], P[k, 1], max(rad[k], 1e-3)])
    def build(w):
        C = np.zeros((0, 3))
        for _ in range(n): C = np.vstack([C, gap(C, w, 2 - w)])
        return np.r_[C.ravel(), w]
    def tight(x):
        C = x[:-1].reshape(n, 3); w = x[-1]; h = 2 - w
        k = 1 * (C[:, 0] - C[:, 2] < 1e-9) + 1 * (w - C[:, 0] - C[:, 2] < 1e-9) \
            + 1 * (C[:, 1] - C[:, 2] < 1e-9) + 1 * (h - C[:, 1] - C[:, 2] < 1e-9)
        D = np.hypot(C[:, None, 0] - C[None, :, 0], C[:, None, 1] - C[None, :, 1]) - C[:, None, 2] - C[None, :, 2]
        np.fill_diagonal(D, 1.0)
        return k + (D < 1e-9).sum(1)
    cur = run(build(rng.uniform(0.7, 1.0))); stag = 0
    while cnt[0] < ex:
        s0, x0 = cur; w = x0[-1]; C = x0[:-1].reshape(n, 3).copy()
        if rng.random() < 0.6: i = int(np.argmax(tight(x0) + rng.random(n)))
        else: i = int(np.argmin(C[:, 2] + rng.random(n) * 0.02))
        old = C[i].copy(); C = np.delete(C, i, 0)
        C = np.vstack([C, gap(C, w, 2 - w, old)])
        s, x = run(np.r_[C.ravel(), w])
        if s > s0 + 1e-13: cur = (s, x); stag = 0
        else:
            stag += 1
            if stag >= 15 and cnt[0] < ex:
                cur = run(build(rng.uniform(0.6, 1.0))); stag = 0
    return finish()
