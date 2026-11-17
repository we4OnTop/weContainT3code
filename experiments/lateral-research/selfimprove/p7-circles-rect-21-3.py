def search(problem, rng, polish):
    n = problem.n
    best = [-1e18, None]
    cnt = [0]
    LIM = 150

    def P(x):
        if cnt[0] >= LIM:
            return None
        cnt[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            return None
        if s > best[0]:
            best[0] = s
            best[1] = np.array(xp, float)
        return s

    def hop(x):
        c = np.array(x[:3 * n], float).reshape(n, 3)
        w = float(x[-1])
        w = float(np.clip(w + rng.normal(0, 0.03), 0.1, 1.9))
        H = 2 - w
        c[:, 0] = np.clip(c[:, 0], 0, w)
        c[:, 1] = np.clip(c[:, 1], 0, H)
        k = int(rng.integers(1, 5))
        if rng.random() < 0.5:
            rem = np.argsort(c[:, 2])[:k]
        else:
            rem = rng.choice(n, size=k, replace=False)
        act = np.ones(n, bool)
        act[rem] = False
        c[:, :2] += rng.normal(0, 0.01, (n, 2))
        c[:, 2] *= 0.9
        for i in rem:
            C = np.column_stack([rng.uniform(0, w, 400), rng.uniform(0, H, 400)])
            rad = np.minimum(np.minimum(C[:, 0], w - C[:, 0]), np.minimum(C[:, 1], H - C[:, 1]))
            for j in np.where(act)[0]:
                rad = np.minimum(rad, np.hypot(C[:, 0] - c[j, 0], C[:, 1] - c[j, 1]) - c[j, 2])
            m = int(np.argmax(rad))
            c[i] = [C[m, 0], C[m, 1], max(rad[m], 1e-3) * 0.95]
            act[i] = True
        return np.concatenate([c.ravel(), [w]])

    n0 = 12
    for _ in range(n0):
        if cnt[0] >= LIM - 3:
            break
        P(problem.random(rng))
    cur = best[1]
    curs = best[0]
    while cnt[0] < LIM - 3 and cur is not None:
        try:
            cand = hop(cur)
        except Exception:
            cand = problem.random(rng)
        s = P(cand)
        if s is not None and (s > curs or rng.random() < 0.1):
            curs = s
            cur = best[1] if s >= best[0] else cur
            if s >= best[0]:
                curs = s
    if best[1] is not None:
        P(best[1])
        P(best[1])
    if best[1] is None:
        return problem.random(rng)
    return best[1]
