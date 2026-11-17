def search(problem, rng, polish):
    n = problem.n
    pool = []
    cnt = [0]
    LIM, EXP = 150, 112

    def P(x):
        cnt[0] += 1
        s, y = polish(np.asarray(x, float))
        y = np.asarray(y, float)
        for i, (t, _) in enumerate(pool):
            if abs(s - t) <= 1e-9:
                if s > t:
                    pool[i] = (s, y)
                break
        else:
            pool.append((s, y))
        pool.sort(key=lambda a: -a[0])
        del pool[3:]
        return s, y

    def finish():
        act = [[t, y, False] for t, y in pool]
        while cnt[0] < LIM and not all(a[2] for a in act):
            for a in act:
                if a[2] or cnt[0] >= LIM:
                    continue
                s, z = P(a[1])
                if abs(s - a[0]) < 1e-13:
                    a[2] = True
                if s >= a[0]:
                    a[0], a[1] = s, z

    s, x = P(problem.random(rng))
    stall = 0
    while cnt[0] < EXP:
        if stall > 25:
            s, x = P(problem.random(rng))
            stall = 0
            continue
        c = x.reshape(n, 3).copy()
        kind = rng.integers(4)
        if kind == 0:
            ax = rng.integers(2)
            v = c[rng.integers(n), ax]
            band = np.abs(c[:, ax] - v) < 0.08
            c[band, 1 - ax] += rng.choice([-1, 1]) * rng.uniform(0.3, 1) * 2 * c[:, 2].mean()
        elif kind == 1:
            dx, dy = c[:, 0] - 0.5, c[:, 1] - 0.5
            d = np.hypot(dx, dy)
            m = np.abs(d - rng.choice(d)) < 0.1
            a = rng.uniform(-0.6, 0.6)
            ca, sa = np.cos(a), np.sin(a)
            c[m, 0] = 0.5 + ca * dx[m] - sa * dy[m]
            c[m, 1] = 0.5 + sa * dx[m] + ca * dy[m]
        elif kind == 2:
            i, j = rng.choice(n, 2, replace=False)
            c[[i, j], 2] = c[[j, i], 2]
        else:
            c[np.argmin(c[:, 2]), :2] = rng.random(2)
        c[:, :2] = np.clip(c[:, :2], 0.02, 0.98)
        c[:, 2] *= 0.9
        s2, x2 = P(c.ravel())
        if s2 > s + 1e-12:
            s, x, stall = s2, x2, 0
        else:
            stall += 1
            if s2 > s - 0.02 and rng.random() < 0.1:
                s, x = s2, x2
    finish()
    return pool[0]
