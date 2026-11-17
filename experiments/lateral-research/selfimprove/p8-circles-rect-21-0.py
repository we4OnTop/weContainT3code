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
    def vec(u, w, f):
        h = 2 - w
        x = np.empty(3 * n + 1)
        x[0:3 * n:3] = u[:, 0] * w
        x[1:3 * n:3] = u[:, 1] * h
        x[2:3 * n:3] = f * 0.5 * np.sqrt(w * h / n)
        x[-1] = w
        return x
    def rings(ks):
        pts = []
        for j, k in enumerate(ks):
            fr = (0.12, 0.27, 0.42)[j]
            if k == 1 and j == 0:
                pts.append((0.5, 0.5))
                continue
            for t in range(k):
                a = 2 * np.pi * t / k + 0.3 * j
                pts.append((0.5 + fr * np.cos(a) * 1.15, 0.5 + fr * np.sin(a) * 1.15))
        return np.clip(np.array(pts), 0.03, 0.97)
    comps = []
    for k1 in range(0, 7):
        for k2 in range(0, 13):
            k3 = n - k1 - k2
            if 6 <= k3 <= 16:
                comps.append((abs(k2 - k1 - 6) + abs(k3 - k2 - 6), (k1, k2, k3)))
    comps.sort(key=lambda t: t[0])
    sc = []
    for _, ks in comps:
        for w in (1.0, 0.8):
            if cnt[0] >= 112:
                break
            u = rings(ks)
            if len(u) != n:
                continue
            r = P(vec(u, w, 0.7))
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
