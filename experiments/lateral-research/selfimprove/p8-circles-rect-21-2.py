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
    grids = [(3, 7), (3, 8), (4, 6), (4, 7), (5, 5), (5, 6)]
    cands = []
    for a, b in grids:
        k = a * b - n
        cells = [(i, j) for i in range(a) for j in range(b)]
        corners = [(0, 0), (0, b - 1), (a - 1, 0), (a - 1, b - 1)]
        for t in range(14):
            if k == 0 and t > 0:
                break
            if t == 0:
                order = corners + [c for c in cells if c not in corners]
                rem = set(order[:k])
            else:
                rem = set(cells[i] for i in rng.permutation(len(cells))[:k])
            cands.append((a, b, rem))
    order = rng.permutation(len(cands))
    sc = []
    for idx in order:
        if cnt[0] >= 112:
            break
        a, b, rem = cands[idx]
        q = b / a
        w = float(np.clip(2 * q / (1 + q), 0.3, 1.7))
        if rng.random() < 0.3:
            w = 2 - w
        h = 2 - w
        pts = [((j + 0.5) / b, (i + 0.5) / a) for i in range(a) for j in range(b) if (i, j) not in rem]
        u = np.array(pts) + rng.normal(0, 0.01, (n, 2))
        u = np.clip(u, 0.03, 0.97)
        x = np.empty(3 * n + 1)
        x[0:3 * n:3] = u[:, 0] * w
        x[1:3 * n:3] = u[:, 1] * h
        x[2:3 * n:3] = 0.35 * min(w / b, h / a)
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
