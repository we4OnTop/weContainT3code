def search(problem, rng, polish):
    n = problem.n
    st = {"b": -1.0, "x": None, "c": 0}
    def P(x):
        x = np.asarray(x, float).copy()
        x[0::3] = np.clip(x[0::3], 0, 1); x[1::3] = np.clip(x[1::3], 0, 1)
        x[2::3] = np.clip(x[2::3], 0.005, 0.5)
        st["c"] += 1
        s, xp = polish(x)
        if s > st["b"]:
            st["b"], st["x"] = s, np.array(xp, float)
        return s, np.array(xp, float)
    def seed():
        k = int(rng.choice([5, 6]))
        base = n // k
        cnt = np.full(k, base)
        for i in rng.permutation(k)[: n - base * k]:
            cnt[i] += 1
        x = np.zeros(n * 3); p = 0
        for i, c in enumerate(cnt):
            for j in range(c):
                x[3 * p] = (j + 0.5 + (0.25 if i % 2 else 0)) / (c + 0.25)
                x[3 * p + 1] = (i + 0.5) / k
                x[3 * p + 2] = 0.05
                p += 1
        x[0::3] += rng.normal(0, 0.01, n); x[1::3] += rng.normal(0, 0.01, n)
        return x
    def kick(x):
        x = x.copy()
        y0 = x[1::3][int(rng.integers(n))]
        ids = np.where(np.abs(x[1::3] - y0) < 0.08)[0]
        x[0::3][ids] += rng.normal(0, 0.08)
        x[2::3][ids] *= rng.uniform(0.7, 1.1)
        x[0::3] += rng.normal(0, 0.004, n); x[1::3] += rng.normal(0, 0.004, n)
        return x
    cur_s, cur = P(seed()); stall = 0
    while st["c"] < 127:
        s, xp = P(kick(cur))
        if s > cur_s + 1e-9 or rng.random() < 0.05:
            if s > cur_s + 1e-9:
                stall = 0
            else:
                stall += 1
            cur_s, cur = s, xp
        else:
            stall += 1
        if stall > 12:
            cur_s, cur = P(seed()); stall = 0
    while st["c"] < 149:
        P(st["x"] + rng.normal(0, 1e-4, n * 3))
    return st["b"], st["x"]
