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
        w = rng.uniform(0.5, 1.0); H = 2 - w
        m = int(rng.integers(3, 6))
        base = [n // m] * m
        for i in rng.choice(m, n - sum(base), replace=False):
            base[i] += 1
        r0 = 0.6 * min(w / (2 * max(base)), H / (2 * m))
        v = []; lab = []
        for i, c in enumerate(base):
            for j in range(c):
                v += [(j + .5) * w / c, (i + .5) * H / m, r0]
                lab.append(i)
        return np.array(v + [w]), np.array(lab)
    x0, lab = seed()
    cur_s, cur = P(x0)
    while cnt[0] < main:
        if rng.random() < 0.1:
            x0, lab = seed()
            cur_s, cur = P(x0)
            continue
        x = cur.copy()
        c = x[:-1].reshape(n, 3)
        w = x[-1]
        m = lab.max() + 1
        i = int(rng.integers(0, m))
        idx = lab == i
        sh = rng.uniform(-0.5, 0.5) * w / max(1, idx.sum())
        c[idx, 0] = np.clip(c[idx, 0] + sh, 0, w)
        if rng.random() < 0.3 and m > 1:
            j = int(rng.integers(0, m))
            c[idx, 1], c[lab == j, 1] = c[idx, 1].mean() * 0 + c[lab == j, 1].mean(), c[lab == j, 1] * 0 + c[idx, 1].mean()
        c[:, :2] += rng.normal(0, 0.01, (n, 2))
        c[:, 2] *= 0.7
        s, xp = P(np.concatenate([c.ravel(), [w]]))
        if s > cur_s - 1e-9:
            cur_s, cur = s, xp
    while cnt[0] < B:
        P(best[1] + rng.normal(0, 1e-4, best[1].shape))
    return best[1]
