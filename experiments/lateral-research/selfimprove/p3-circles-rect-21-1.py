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
        w = rng.uniform(0.6, 1.0); H = 2 - w
        opts = [[1, 6, 14], [1, 6, 10, 4], [3, 8, 10], [1, 5, 15], [7, 14], [4, 17], [1, 7, 13], [2, 8, 11]]
        cs = opts[int(rng.integers(len(opts)))]
        R = min(w, H) / 2
        v = []; lab = []
        for k, c in enumerate(cs):
            rad = R * (k + (0.5 if cs[0] == 1 and k == 0 else 1)) / len(cs) * (0 if (c == 1 and k == 0) else 1)
            ph = rng.uniform(0, 6.283)
            for j in range(c):
                a = ph + 6.283 * j / c
                v += [w / 2 + rad * np.cos(a) * (w / min(w, H)) * 0.8 if False else w / 2 + rad * np.cos(a),
                      H / 2 + rad * np.sin(a), 0.02]
                lab.append(k)
        return np.array(v + [w]), np.array(lab)
    x0, lab = seed()
    cur_s, cur = P(x0)
    while cnt[0] < main:
        if rng.random() < 0.12:
            x0, lab = seed()
            s, x = P(x0)
            cur_s, cur = s, x
            continue
        x = cur.copy()
        c = x[:-1].reshape(n, 3)
        w = x[-1]
        k = int(rng.integers(0, lab.max() + 1))
        idx = lab == k
        a = rng.uniform(-1, 1) * 3.1416 / max(2, idx.sum() // 2)
        dx = c[idx, 0] - w / 2; dy = c[idx, 1] - (2 - w) / 2
        c[idx, 0] = w / 2 + dx * np.cos(a) - dy * np.sin(a)
        c[idx, 1] = (2 - w) / 2 + dx * np.sin(a) + dy * np.cos(a)
        c[:, :2] += rng.normal(0, 0.005, (n, 2))
        nw = float(np.clip(w + rng.normal(0, 0.03), 0.3, 1.0))
        s, xp = P(np.concatenate([c.ravel(), [nw]]))
        if s > cur_s - 1e-9:
            cur_s, cur = s, xp
    while cnt[0] < B:
        P(best[1] + rng.normal(0, 1e-4, best[1].shape))
    return best[1]
