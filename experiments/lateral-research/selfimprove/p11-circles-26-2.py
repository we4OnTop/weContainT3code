class Done(Exception): pass

def search(problem, rng, polish):
    n = problem.n
    cnt = [0]
    pool = []
    def ok(x):
        v = x.reshape(-1, 3); p = v[:, :2]; r = v[:, 2]
        if (r < 0).any() or (p - r[:, None] < -1e-7).any() or (p + r[:, None] > 1 + 1e-7).any():
            return False
        d = np.hypot(p[:, None, 0] - p[None, :, 0], p[:, None, 1] - p[None, :, 1]) - r[:, None] - r[None, :]
        d[np.diag_indices(len(r))] = 1
        return d.min() >= -1e-7
    def P(x, lim=112):
        if cnt[0] >= lim: raise Done
        cnt[0] += 1
        s, y = polish(np.clip(np.asarray(x, float), 0, 1))
        y = np.asarray(y, float)
        if not np.isfinite(s) or not ok(y): return -1.0, y
        sig = np.sort(y[2::3])
        for i, (s2, y2) in enumerate(pool):
            if np.abs(np.sort(y2[2::3]) - sig).max() < 1e-6:
                if s > s2: pool[i] = (s, y)
                break
        else:
            pool.append((s, y))
        pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, y
    def finish(explore):
        try: explore()
        except Done: pass
        cur = list(pool)
        try:
            while cur and cnt[0] < 150:
                nxt = []
                for s0, x in cur:
                    s, y = P(x, 150)
                    if s > s0 + 1e-13: nxt.append((s, y))
                cur = nxt
        except Done: pass
        return pool[0] if pool else None

    def gap(C, k):
        def rad(p):
            r = np.minimum(np.minimum(p[:, 0], 1 - p[:, 0]), np.minimum(p[:, 1], 1 - p[:, 1]))
            if len(C):
                dd = np.hypot(p[:, None, 0] - C[None, :, 0], p[:, None, 1] - C[None, :, 1]) - C[None, :, 2]
                r = np.minimum(r, dd.min(1))
            return r
        pts = rng.random((4000, 2))
        r = rad(pts)
        top = np.argsort(-r)[:k]
        b = pts[top[rng.integers(len(top))]]
        q = np.vstack([pts[top], np.clip(b + rng.normal(0, 0.02, (2000, 2)), 0, 1)])
        rq = rad(q); j = rq.argmax()
        return q[j], max(rq[j], 1e-3)
    def build(k, keep=None):
        C = np.zeros((0, 3)) if keep is None else keep
        while len(C) < n:
            p, r = gap(C, k)
            C = np.vstack([C, [p[0], p[1], r]])
        return C
    def explore():
        best = (-1.0, None)
        for t in range(6):
            s, y = P(build(1 + 3 * t).ravel())
            if s > best[0] or best[1] is None: best = (s, y)
        while True:
            v = best[1].reshape(-1, 3).copy()
            p = v[:, :2]; r = v[:, 2]
            d = np.hypot(p[:, None, 0] - p[None, :, 0], p[:, None, 1] - p[None, :, 1]) - r[:, None] - r[None, :]
            d[np.diag_indices(n)] = 1
            tight = (d < 1e-9).sum(1) + (np.minimum(p - r[:, None], 1 - p - r[:, None]) < 1e-9).sum(1)
            if rng.random() < 0.5:
                i = int(rng.choice(np.flatnonzero(tight == tight.max())))
            else:
                i = int(np.argsort(r)[rng.integers(0, 3)])
            C = np.delete(v, i, 0)
            s, y = P(build(1 + int(rng.integers(0, 4)), C).ravel())
            if s > best[0]: best = (s, y)
    return finish(explore)
