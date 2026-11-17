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

    def lattice(kind, th, shift, off):
        s = 0.3
        i, j = np.meshgrid(np.arange(-30, 31), np.arange(-30, 31))
        i = i.ravel().astype(float)
        j = j.ravel().astype(float)
        c, sn = np.cos(th), np.sin(th)
        while s > 0.05:
            m = s / 2
            x = i * s + (j % 2) * shift * s
            y = j * s * (0.8660254 if kind == 0 else 1.0)
            X = 0.5 + c * x - sn * y + off[0] * s
            Y = 0.5 + sn * x + c * y + off[1] * s
            k = (X >= m) & (X <= 1 - m) & (Y >= m) & (Y <= 1 - m)
            if k.sum() >= n:
                return X[k], Y[k], s
            s -= 0.004
        return None

    cfgs = [(0, t, 0.5) for t in np.linspace(0, np.pi / 3, 7)]
    cfgs += [(1, t, sh) for t in np.linspace(0, np.pi / 2, 7) for sh in (0.0, 0.5, 0.25)]
    while cnt[0] < EXP:
        for kind, th, sh in cfgs:
            if cnt[0] >= EXP:
                break
            res = lattice(kind, th, sh, rng.uniform(-0.5, 0.5, 2))
            if res is None:
                continue
            X, Y, s = res
            keep = np.sort(rng.choice(len(X), n, replace=False))
            P(np.c_[X[keep], Y[keep], np.full(n, 0.45 * s)].ravel())
    finish()
    return pool[0]
