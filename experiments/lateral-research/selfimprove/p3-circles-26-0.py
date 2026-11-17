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
        rows = int(rng.choice([5, 6]))
        cols = 31 // rows if rows == 5 else 5
        pts = []
        for i in range(rows):
            off = 0.5 / (cols + 1) if i % 2 else 0
            for j in range(cols + 1):
                pts.append(((j + 0.5) / (cols + 0.5) * 0.95 + off, (i + 0.5) / rows))
        pts = np.array(pts)
        idx = rng.permutation(len(pts))[:n] if len(pts) >= n else rng.integers(0, len(pts), n)
        x = np.zeros(n * 3)
        x[0::3] = pts[idx, 0] + rng.normal(0, 0.01, n)
        x[1::3] = pts[idx, 1] + rng.normal(0, 0.01, n)
        x[2::3] = 0.05
        return x
    def kick(x):
        x = x.copy()
        r = x[2::3]
        k = int(np.argmin(r + rng.random(n) * 0.02))
        o = np.arange(n) != k
        cand = rng.random((300, 2))
        d = np.hypot(cand[:, 0:1] - x[0::3][o], cand[:, 1:2] - x[1::3][o]) - r[o]
        clear = np.minimum(d.min(1), np.minimum(cand.min(1), 1 - cand.max(1)))
        c = cand[int(np.argmax(clear))]
        x[3 * k], x[3 * k + 1], x[3 * k + 2] = c[0], c[1], max(clear.max(), 0.01)
        x[0::3] += rng.normal(0, 0.005, n); x[1::3] += rng.normal(0, 0.005, n)
        return x
    cur_s, cur = P(seed()); stall = 0
    while st["c"] < 127:
        s, xp = P(kick(cur))
        if s > cur_s + 1e-9:
            cur_s, cur, stall = s, xp, 0
        else:
            stall += 1
        if stall > 12:
            cur_s, cur = P(seed()); stall = 0
    while st["c"] < 149:
        P(st["x"] + rng.normal(0, 1e-4, n * 3))
    return st["b"], st["x"]
