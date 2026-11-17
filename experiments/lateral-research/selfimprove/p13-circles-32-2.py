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

    def gap(cx, cy, cr, m=3000):
        p = rng.random((m, 2))
        d = np.minimum(np.minimum(p[:, 0], 1 - p[:, 0]), np.minimum(p[:, 1], 1 - p[:, 1]))
        if len(cx):
            dd = np.hypot(p[:, 0, None] - cx[None], p[:, 1, None] - cy[None]) - cr[None]
            d = np.minimum(d, dd.min(1))
        k = d.argmax()
        return p[k, 0], p[k, 1], min(max(d[k], 0.01), 0.12)

    def build():
        cx, cy, cr = np.zeros(0), np.zeros(0), np.zeros(0)
        for _ in range(n):
            a, b, r = gap(cx, cy, cr)
            cx, cy, cr = np.append(cx, a), np.append(cy, b), np.append(cr, r)
        return np.c_[cx, cy, cr].ravel()

    s, x = P(build())
    stall = 0
    while cnt[0] < EXP:
        if stall > 12:
            s, x = P(build())
            stall = 0
            continue
        c = x.reshape(n, 3)
        k = rng.choice(np.argsort(c[:, 2])[:4])
        keep = np.delete(c, k, 0)
        a, b, r = gap(keep[:, 0], keep[:, 1], keep[:, 2])
        s2, x2 = P(np.vstack([keep, [a, b, r]]).ravel())
        if s2 > s + 1e-12:
            s, x, stall = s2, x2, 0
        else:
            stall += 1
    finish()
    return pool[0]
