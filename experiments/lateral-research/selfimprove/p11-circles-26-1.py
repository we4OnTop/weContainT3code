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

    def comps(rem, k, lo):
        if k == 1: return [[rem]] if lo <= rem <= 18 else []
        out = []
        for c in range(lo, rem // k + 1):
            for t in comps(rem - c, k - 1, c): out.append([c] + t)
        return out
    def explore():
        cands = []
        for c0 in (0, 1):
            for m in (2, 3, 4):
                for c in comps(n - c0, m, 3): cands.append((c0, c))
        def dev(t):
            c0, c = t; m = len(c)
            return sum(abs(ck - (n - c0) * (k + 1) / (m * (m + 1) / 2.0)) for k, ck in enumerate(c))
        cands.sort(key=dev)
        t = 0
        while True:
            c0, c = cands[t % len(cands)]; t += 1
            m = len(c)
            Rm = 0.5 - rng.uniform(0.05, 0.1)
            ctr = 0.5 + (rng.random(2) - 0.5) * (0.0 if t <= len(cands) else 0.06)
            pts = [ctr] if c0 else []
            for k, ck in enumerate(c):
                R = Rm * (k + 1) / m
                ph = rng.random() * 2 * np.pi
                for q in range(ck):
                    ang = ph + 2 * np.pi * q / ck
                    pts.append(ctr + R * np.array([np.cos(ang), np.sin(ang)]))
            P(np.column_stack([np.array(pts), np.full(len(pts), 0.04)]).ravel())
    return finish(explore)
