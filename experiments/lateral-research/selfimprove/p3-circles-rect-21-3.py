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
        k = n // 2
        px = rng.uniform(0, w / 2, k); py = rng.uniform(0, H, k)
        c = np.zeros((n, 3))
        c[:k, 0] = px; c[k:2 * k, 0] = w - px
        c[:k, 1] = py; c[k:2 * k, 1] = py
        c[2 * k:, 0] = w / 2; c[2 * k:, 1] = rng.uniform(0, H, n - 2 * k)
        c[:, 2] = 0.02
        return np.concatenate([c.ravel(), [w]])
    cur_s, cur = P(seed())
    while cnt[0] < main:
        if rng.random() < 0.1:
            s, x = P(seed())
            if s > cur_s:
                cur_s, cur = s, x
            continue
        c = cur[:-1].reshape(n, 3).copy()
        w = cur[-1]
        if rng.random() < 0.5:
            half = c[c[:, 0] < w / 2]
            mir = half.copy(); mir[:, 0] = w - mir[:, 0]
        else:
            half = c[c[:, 0] >= w / 2]
            mir = half.copy(); mir[:, 0] = w - mir[:, 0]
        if rng.random() < 0.5:
            mir[:, 1] = (2 - w) - mir[:, 1]
        allc = np.vstack([half, mir])
        if len(allc) > n:
            allc = allc[np.argsort(-allc[:, 2])[:n]]
        while len(allc) < n:
            allc = np.vstack([allc, [rng.uniform(0, w), rng.uniform(0, 2 - w), 0.01]])
        allc[:, :2] += rng.normal(0, 0.01, (n, 2))
        allc[:, 2] *= 0.8
        s, xp = P(np.concatenate([allc.ravel(), [w]]))
        if s > cur_s - 1e-9:
            cur_s, cur = s, xp
    while cnt[0] < B:
        P(best[1] + rng.normal(0, 1e-4, best[1].shape))
    return best[1]
