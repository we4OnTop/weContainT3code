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

    def kick(v):
        v = v.reshape(-1, 3).copy()
        t = rng.integers(4)
        if t == 0:
            ax = int(rng.integers(2)); c = rng.random(); w = rng.uniform(0.1, 0.3)
            m = np.abs(v[:, ax] - c) < w / 2
            v[m, 1 - ax] += rng.choice([-1, 1]) * rng.uniform(0.5, 1.5) * v[:, 2].mean()
        elif t == 1:
            ctr = np.array([0.5, 0.5]) if rng.random() < 0.5 else v[rng.integers(n), :2].copy()
            d = np.hypot(v[:, 0] - ctr[0], v[:, 1] - ctr[1])
            R = d[rng.integers(n)]
            m = np.abs(d - R) < 0.08
            a = rng.uniform(-0.5, 0.5)
            q = v[m, :2] - ctr
            v[m, :2] = ctr + q @ np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
        elif t == 2:
            i, j = rng.choice(n, 2, replace=False)
            v[[i, j], :2] = v[[j, i], :2]
        else:
            v[:, :2] += rng.normal(0, 0.02, (n, 2))
        v[:, 2] *= 0.85
        return np.clip(v, 0, 1).ravel()
    def explore():
        inc = (-1.0, None)
        for _ in range(4):
            s, y = P(problem.random(rng))
            if s > inc[0]: inc = (s, y)
        while True:
            if inc[1] is None: s, y = P(problem.random(rng))
            else: s, y = P(kick(inc[1]))
            if s > inc[0]: inc = (s, y)
            elif pool and rng.random() < 0.1: inc = pool[int(rng.integers(len(pool)))]
    return finish(explore)
