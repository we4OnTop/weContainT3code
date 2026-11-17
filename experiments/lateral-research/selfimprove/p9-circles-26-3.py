def search(problem, rng, polish):
    n = problem.n; B = 150; EX = 112
    c = [0]; pool = []
    def P(x):
        c[0] += 1
        s, xp = polish(np.clip(np.asarray(x, float), 0, 1))
        for k, (t, _) in enumerate(pool):
            if abs(s - t) < 1e-9:
                if s > t: pool[k] = (s, xp)
                break
        else:
            pool.append((s, xp))
        pool.sort(key=lambda a: -a[0]); del pool[3:]
        return s, xp
    def fin():
        for s, x in list(pool):
            while c[0] < B:
                s2, x2 = P(x)
                if s2 - s < 1e-13: break
                s, x = s2, x2
        return pool[0]
    for _ in range(3):
        P(problem.random(rng))
    while c[0] < EX:
        s, x = pool[rng.integers(0, len(pool))] if rng.random() < 0.3 else pool[0]
        a = x.reshape(n, 3).copy()
        rm = a[:, 2].mean()
        k = rng.integers(0, 4)
        if k == 0:
            ax = rng.integers(0, 2); t = a[rng.integers(n), ax]
            m = abs(a[:, ax] - t) < rm
            a[m, 1 - ax] += rng.choice([-1, 1]) * rng.random() * rm * 2
        elif k == 1:
            v = a[:, :2] - 0.5; dist = np.hypot(v[:, 0], v[:, 1])
            m = abs(dist - dist[rng.integers(n)]) < rm
            th = rng.normal() * 0.4; ct, st = np.cos(th), np.sin(th)
            a[m, 0] = 0.5 + ct * v[m, 0] - st * v[m, 1]
            a[m, 1] = 0.5 + st * v[m, 0] + ct * v[m, 1]
        elif k == 2:
            i, j = rng.choice(n, 2, replace=False)
            a[[i, j], :2] = a[[j, i], :2]
        else:
            a[rng.integers(n), :2] = rng.random(2)
        a[:, :2] += rng.normal(size=(n, 2)) * 1e-3
        a[:, 2] *= 0.9
        P(a.ravel())
    return fin()
