def search(problem, rng, polish):
    n = problem.n
    B = 150
    main = int(B * 0.85)
    cnt = [0]
    best = [-1e18, None]
    def P(x):
        cnt[0] += 1
        s, xp = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(xp, float)
        return s, np.array(xp, float)
    def seed():
        w = rng.uniform(0.45, 0.95); H = 2 - w
        m = int(rng.integers(3, 7))
        base = [n // m] * m
        for i in rng.choice(m, n - sum(base), replace=False):
            base[i] += 1
        mc = max(base)
        r0 = 0.7 * min(w / (2 * mc), H / (2 * m))
        v = []
        for i, c in enumerate(base):
            y = (i + .5) * H / m
            off = 0.5 if i % 2 else 0.0
            for j in range(c):
                x = (j + .5 + off * (1 if c < mc else 0)) * w / max(c, 1) if c else w / 2
                v += [min(max(x, r0), w - r0), y, r0]
        return np.array(v + [w])
    cur_s, cur = P(seed())
    while cnt[0] < main:
        if rng.random() < 0.1:
            s, x = P(seed())
            if s > cur_s:
                cur_s, cur = s, x
            continue
        x = cur.copy()
        w = x[-1]
        c = x[:-1].reshape(n, 3)
        k = int(rng.integers(1, 3))
        for i in np.argsort(c[:, 2])[:k]:
            c[i] = [rng.uniform(0, w), rng.uniform(0, 2 - w), 0.01]
        c[:, :2] += rng.normal(0, 0.02, (n, 2))
        x[-1] = np.clip(w + rng.normal(0, 0.02), 0.3, 1.0)
        s, xp = P(np.concatenate([c.ravel(), [x[-1]]]))
        if s > cur_s - 1e-9:
            cur_s, cur = s, xp
    while cnt[0] < B:
        x = best[1].copy()
        x += rng.normal(0, 1e-4, x.shape)
        P(x)
    return best[1]
