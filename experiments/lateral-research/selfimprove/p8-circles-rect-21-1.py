def search(problem, rng, polish):
    n = problem.n
    cnt = [0]
    res = []
    def P(x):
        if cnt[0] >= 150:
            return None
        cnt[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            if cnt[0] >= 150:
                raise
            return None
        res.append((s, xp))
        return s, xp
    seqs = []
    def gen(rem, rows, cur):
        if rows == 0:
            if rem == 0 and max(cur) - min(cur) <= 2:
                seqs.append(tuple(cur))
            return
        for c in range(2, 9):
            if c <= rem:
                gen(rem - c, rows - 1, cur + [c])
    for R in range(3, 7):
        gen(n, R, [])
    seqs.sort(key=lambda s: (max(s) - min(s), len(s)))
    sc = []
    for seq in seqs:
        for off in (0, 1):
            if cnt[0] >= 112:
                break
            R = len(seq)
            m = max(seq)
            q = (m + 0.5) / (0.866 * R)
            w = float(np.clip(2 * q / (1 + q), 0.3, 1.7))
            h = 2 - w
            pts = []
            for i, c in enumerate(seq):
                y = (i + 0.5) / R
                for j in range(c):
                    xx = 0.5 + (j - (c - 1) / 2) / (m + 0.5)
                    if off and c == m:
                        xx += (0.25 / (m + 0.5)) * (1 if i % 2 else -1)
                    pts.append((xx, y))
            u = np.clip(np.array(pts), 0.03, 0.97)
            x = np.empty(3 * n + 1)
            x[0:3 * n:3] = u[:, 0] * w
            x[1:3 * n:3] = u[:, 1] * h
            x[2:3 * n:3] = 0.3 * min(w / (m + 0.5), h / R)
            x[-1] = w
            r = P(x)
            if r:
                sc.append(r)
    sc.sort(key=lambda t: -t[0])
    for k, (s, x) in enumerate(sc[:3]):
        lim = cnt[0] + (150 - cnt[0]) // (3 - k)
        while cnt[0] < lim:
            r = P(x)
            if r is None:
                break
            d = r[0] - s
            if r[0] > s:
                s, x = r
            if d < 1e-12:
                break
    return max(res, key=lambda t: t[0])[1] if res else problem.random(rng)
