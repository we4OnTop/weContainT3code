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

    combos = []
    for c0 in (0, 1):
        for a in range(12, 23):
            for b in range(4, 15):
                d = n - c0 - a - b
                if 0 <= d <= 8:
                    combos.append((c0, d, b, a))
    order = rng.permutation(len(combos))
    k = 0
    while cnt[0] < EXP and combos:
        c0, d, b, a = combos[order[k % len(combos)]]
        k += 1
        pts = [(0.5, 0.5)] * c0
        rad = [0.4 * 0.95, 0.4 * 0.65, 0.4 * 0.33]
        for cnum, R in zip((a, b, d), rad):
            ph = rng.uniform(0, 2 * np.pi)
            for t in range(cnum):
                ang = ph + 2 * np.pi * t / cnum
                pts.append((0.5 + R * np.cos(ang), 0.5 + R * np.sin(ang)))
        pts = np.clip(np.array(pts), 0.05, 0.95)
        P(np.c_[pts, np.full(n, 0.07)].ravel())
    finish()
    return pool[0]
