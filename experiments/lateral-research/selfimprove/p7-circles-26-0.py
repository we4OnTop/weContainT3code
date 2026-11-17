def search(problem, rng, polish):
    n = problem.n
    best = [-1e9, None]
    calls = [0]

    def P(x, lim=146):
        if calls[0] >= lim:
            return None
        calls[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            if calls[0] >= 150:
                raise
            return None
        if s > best[0]:
            best[0] = s
            best[1] = np.array(xp, float)
        return s

    def rows_start():
        k = int(rng.integers(4, 7))
        c = np.full(k, n // k)
        for i in rng.permutation(k)[: n - c.sum()]:
            c[i] += 1
        for _ in range(int(rng.integers(0, 3))):
            a, b = rng.integers(0, k, 2)
            if a != b and c[a] > 3:
                c[a] -= 1
                c[b] += 1
        stag = rng.random() < 0.7
        r0 = 0.45 / max(c.max(), k)
        v = []
        for i in range(k):
            off = (0.5 * (i % 2) / c[i]) if stag else 0.0
            for j in range(c[i]):
                x = (j + 0.5) / c[i] * (1 - (0.5 / c[i] if stag else 0)) + off * 0.5
                y = (i + 0.5) / k
                v += [x, y, r0]
        v = np.array(v)
        v.reshape(-1, 3)[:, :2] += rng.normal(0, 0.01, (n, 2))
        v.reshape(-1, 3)[:, :2] = np.clip(v.reshape(-1, 3)[:, :2], 0.05, 0.95)
        if rng.random() < 0.5:
            v.reshape(-1, 3)[:, [0, 1]] = v.reshape(-1, 3)[:, [1, 0]]
        return v

    while calls[0] < 120:
        try:
            P(rows_start())
        except Exception:
            if calls[0] >= 150:
                raise
    # jitter around best
    while calls[0] < 146 and best[1] is not None:
        v = best[1].copy()
        v.reshape(-1, 3)[:, :2] += rng.normal(0, 0.03, (n, 2))
        v.reshape(-1, 3)[:, 2] *= 0.8
        P(v)
    if best[1] is None:
        P(problem.random(rng), 149)
    for _ in range(2):
        if best[1] is not None:
            P(best[1], 150)
    return best[1]
