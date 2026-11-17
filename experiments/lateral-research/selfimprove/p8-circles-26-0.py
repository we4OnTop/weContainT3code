def _rad(c, sw=12):
    n = len(c)
    d = np.sqrt(((c[:, None] - c[None]) ** 2).sum(2)) + 9 * np.eye(n)
    w = np.minimum(np.minimum(c[:, 0], 1 - c[:, 0]), np.minimum(c[:, 1], 1 - c[:, 1]))
    r = np.zeros(n)
    for _ in range(sw):
        for i in range(n):
            r[i] = max(0.0, min(w[i], (d[i] - r).min()))
    return r

def _drive(problem, rng, polish, cands, ntop=8):
    st = {'c': 0, 's': -1.0, 'x': None}
    def P(x):
        if st['c'] >= 150:
            return None
        st['c'] += 1
        try:
            s, y = polish(np.asarray(x, float))
        except Exception:
            return None
        if s > st['s']:
            st['s'], st['x'] = s, y
        return s, y
    n = problem.n
    order = sorted(range(len(cands)), key=lambda i: -cands[i][0])
    seen, pick = set(), []
    for i in order:
        if cands[i][1] not in seen:
            seen.add(cands[i][1]); pick.append(i)
    pick += [i for i in order if i not in pick]
    res = []
    for i in pick[:ntop]:
        c = cands[i][2]
        v = np.empty(n * 3); v[0::3] = c[:, 0]; v[1::3] = c[:, 1]; v[2::3] = 0.95 * _rad(c)
        r = P(v)
        if r:
            res.append(r)
    res.sort(key=lambda t: -t[0])
    for s, y in res[:3]:
        prev = s
        for _ in range(40):
            r = P(y)
            if r is None or r[0] - prev < 1e-13:
                break
            prev, y = r[0], r[1]
    if st['x'] is None:
        r = P(problem.random(rng))
    return st['x']

def search(problem, rng, polish):
    n = problem.n
    cands = []
    def comps(k, tot, lo):
        if k == 1:
            if lo <= tot <= 14:
                yield [tot]
            return
        for a in range(lo, 15):
            if a * k > tot:
                break
            for rest in comps(k - 1, tot - a, a):
                yield [a] + rest
    for c0 in (0, 1):
        for m in (2, 3, 4):
            for cs in comps(m, n - c0, 3):
                for _ in range(2):
                    pts = [[0.5, 0.5]] if c0 else []
                    for k, cnt in enumerate(cs, 1):
                        R = 0.40 * k / m
                        ph = rng.uniform(0, 6.2832)
                        for j in range(cnt):
                            a = ph + 6.2832 * j / cnt
                            pts.append([0.5 + R * np.cos(a), 0.5 + R * np.sin(a)])
                    c = np.clip(np.array(pts), 0.02, 0.98)
                    cands.append((_rad(c).sum(), (c0, tuple(cs)), c))
    return _drive(problem, rng, polish, cands, 8)
