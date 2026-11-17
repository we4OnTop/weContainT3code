def search(problem, rng, polish):
    n = problem.n; B = 150; EX = 112
    c = [0]; pool = []
    def P(x):
        c[0] += 1
        s, xp = polish(np.clip(np.asarray(x, float), 0, 1))
        for k, (t, _) in enumerate(pool):
            if abs(s - t) < 1e-9:
                if s > t: pool[k] = (s, xp)
                break
        else:
            pool.append((s, xp))
        pool.sort(key=lambda a: -a[0]); del pool[3:]
        return s, xp
    def fin():
        for s, x in list(pool):
            while c[0] < B:
                s2, x2 = P(x)
                if s2 - s < 1e-13: break
                s, x = s2, x2
        return pool[0]
    def insert(pts, rs):
        Q = rng.random((3000, 2))
        w = np.minimum(Q, 1 - Q).min(1)
        if len(pts):
            dd = np.hypot(Q[:, None, 0] - pts[None, :, 0], Q[:, None, 1] - pts[None, :, 1])
            w = np.minimum(w, (dd - rs[None]).min(1))
        i = np.argsort(-w)[rng.integers(0, 4)]
        return Q[i], max(w[i], 1e-3)
    def build():
        pts = np.zeros((0, 2)); rs = np.zeros(0)
        for _ in range(n):
            q, r = insert(pts, rs)
            pts = np.vstack([pts, q]); rs = np.append(rs, r)
        return np.column_stack([pts, rs]).ravel()
    for _ in range(6):
        P(build())
    while c[0] < EX:
        s, x = pool[0]
        a = x.reshape(n, 3)
        d = np.hypot(a[:, None, 0] - a[None, :, 0], a[:, None, 1] - a[None, :, 1]) - a[:, None, 2] - a[None, :, 2]
        act = ((d < 1e-9) & ~np.eye(n, dtype=bool)).sum(1).astype(float)
        for ax in (0, 1):
            act += (a[:, ax] - a[:, 2] < 1e-9) + (1 - a[:, ax] - a[:, 2] < 1e-9)
        if rng.random() < 0.3:
            i = rng.integers(n)
        else:
            i = int(np.argmax(act + rng.random(n) * 0.9))
        keep = np.delete(a, i, 0)
        q, r = insert(keep[:, :2], keep[:, 2])
        P(np.vstack([keep, [q[0], q[1], r]]).ravel())
    return fin()
