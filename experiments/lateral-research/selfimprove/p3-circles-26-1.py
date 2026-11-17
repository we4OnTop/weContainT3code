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
        opts = [(1, 6, 12, 7), (0, 6, 12, 8), (1, 7, 18), (0, 8, 18), (1, 8, 17), (2, 8, 16), (1, 5, 11, 9)]
        cn = opts[int(rng.integers(len(opts)))]
        pts = []
        rad = np.linspace(0, 0.42, len(cn) + (1 if cn[0] == 1 else 0))
        ri = 1 if cn[0] == 1 else 0
        if cn[0] == 1:
            pts.append((0.5, 0.5))
            cn = cn[1:]
        for m, c in enumerate(cn):
            R = 0.14 * (m + 1) + 0.04 if len(cn) > 2 else 0.2 + 0.2 * m
            R = min(R, 0.43)
            a0 = rng.random() * 6.283
            for t in range(c):
                a = a0 + 6.283 * t / c
                pts.append((0.5 + R * np.cos(a), 0.5 + R * np.sin(a)))
        pts = np.array(pts)[:n]
        while len(pts) < n:
            pts = np.vstack([pts, rng.random(2)])
        x = np.zeros(n * 3)
        x[0::3] = pts[:, 0] + rng.normal(0, 0.01, n)
        x[1::3] = pts[:, 1] + rng.normal(0, 0.01, n)
        x[2::3] = 0.05
        return x
    def kick(x):
        x = x.copy()
        d = np.hypot(x[0::3] - 0.5, x[1::3] - 0.5)
        o = np.argsort(d)
        a, b = sorted(rng.choice(n, 2, replace=False))
        b = max(b, a + 4)
        ids = o[a:b + 1]
        th = rng.normal(0, 0.5)
        dx, dy = x[0::3][ids] - 0.5, x[1::3][ids] - 0.5
        x[0::3][ids] = 0.5 + dx * np.cos(th) - dy * np.sin(th)
        x[1::3][ids] = 0.5 + dx * np.sin(th) + dy * np.cos(th)
        x[0::3] += rng.normal(0, 0.004, n); x[1::3] += rng.normal(0, 0.004, n)
        return x
    cur_s, cur = P(seed()); stall = 0
    while st["c"] < 127:
        s, xp = P(kick(cur))
        if s > cur_s + 1e-9:
            cur_s, cur, stall = s, xp, 0
        else:
            stall += 1
        if stall > 10:
            cur_s, cur = P(seed()); stall = 0
    while st["c"] < 149:
        P(st["x"] + rng.normal(0, 5e-5, n * 3))
    return st["b"], st["x"]
