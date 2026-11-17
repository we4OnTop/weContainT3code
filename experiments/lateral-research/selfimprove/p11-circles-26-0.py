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

    def explore():
        while True:
            hexa = rng.random() < 0.6
            s = 0.5 if hexa else 0.0
            if rng.random() < 0.25: s = float(rng.choice([0.25, 0.75, 0.33]))
            h = 0.8660254 if hexa else 1.0
            if rng.random() < 0.7: th = float(rng.choice([0, 15, 30, 45, 60, 75])) * np.pi / 180
            else: th = rng.random() * np.pi / 2
            c, sn = np.cos(th), np.sin(th)
            a = 0.3; m = 0.04
            off = (rng.random(2) - 0.5) * 0.3
            for _ in range(80):
                K = int(1.6 / a) + 2
                i, j = np.meshgrid(np.arange(-K, K + 1), np.arange(-K, K + 1))
                ux = (i + j * s).ravel() * a; uy = (j * h).ravel() * a
                q = np.stack([c * ux - sn * uy, sn * ux + c * uy], 1) + 0.5 + off * a
                mask = ((q >= m) & (q <= 1 - m)).all(1)
                if mask.sum() >= n: break
                a *= 0.96
            pts = q[mask]
            k = len(pts) - n
            if k > 0:
                if rng.random() < 0.5:
                    key = np.abs(pts - 0.5).max(1) + rng.random(len(pts)) * a * 0.5
                    drop = np.argsort(-key)[:k]
                else:
                    drop = rng.choice(len(pts), k, replace=False)
                pts = np.delete(pts, drop, 0)
            P(np.column_stack([pts, np.full(len(pts), 0.45 * a)]).ravel())
    return finish(explore)
