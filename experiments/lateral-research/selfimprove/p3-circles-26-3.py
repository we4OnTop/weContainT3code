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
    def mirror(x, diag, side):
        x = x.copy()
        px, py = x[0::3].copy(), x[1::3].copy()
        if diag:
            src = (py > px) if side else (py <= px)
            mx, my = py, px
        else:
            src = (px > 0.5) if side else (px <= 0.5)
            mx, my = 1 - px, py
        ids = np.where(src)[0]
        k = n - len(ids)
        # keep ids as sources; rebuild the other circles as their mirrors
        others = np.where(~src)[0]
        m = min(len(ids), len(others))
        for t in range(m):
            i, j = ids[t], others[t]
            x[3 * j], x[3 * j + 1], x[3 * j + 2] = mx[i], my[i], x[3 * i + 2]
        return x
    def seed():
        x = np.zeros(n * 3)
        x[0::3] = rng.random(n); x[1::3] = rng.random(n); x[2::3] = 0.05
        return mirror(x, int(rng.integers(2)), int(rng.integers(2)))
    def kick(x):
        y = mirror(x, int(rng.integers(2)), int(rng.integers(2)))
        y[0::3] += rng.normal(0, 0.006, n); y[1::3] += rng.normal(0, 0.006, n)
        return y
    cur_s, cur = P(seed()); stall = 0
    while st["c"] < 127:
        s, xp = P(kick(cur))
        if s > cur_s + 1e-9:
            cur_s, cur, stall = s, xp, 0
        else:
            stall += 1
        if stall > 8:
            cur_s, cur = P(seed()); stall = 0
    while st["c"] < 149:
        P(st["x"] + rng.normal(0, 5e-5, n * 3))
    return st["b"], st["x"]
