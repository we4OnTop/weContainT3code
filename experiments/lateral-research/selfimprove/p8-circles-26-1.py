def _rad(c, sw=12):
    n = len(c)
    d = np.sqrt(((c[:, None] - c[None]) ** 2).sum(2)) + 9 * np.eye(n)
    w = np.minimum(np.minimum(c[:, 0], 1 - c[:, 0]), np.minimum(c[:, 1], 1 - c[:, 1]))
    r = np.zeros(n)
    for _ in range(sw):
        for i in range(n):
            r[i] = max(0.0, min(w[i], (d[i] - r).min()))
    return r

def _relax(c, steps=40, r=0.098):
    c = c.copy()
    for _ in range(steps):
        d = c[:, None] - c[None]
        dist = np.sqrt((d ** 2).sum(2)) + np.eye(len(c))
        o = np.maximum(0, 2 * r - dist)
        np.fill_diagonal(o, 0)
        c = c + 0.5 * ((o / dist)[:, :, None] * d).sum(1)
        c = np.clip(c, r, 1 - r)
    return c

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
    specs = []
    for R in range(4, 8):
        for a in range(3, 8):
            for bits in range(2 ** R):
                cs = [a + ((bits >> i) & 1) for i in range(R)]
                if n <= sum(cs) <= n + 3:
                    for o in (0, 1):
                        specs.append((tuple(cs), o))
    if len(specs) > 150:
        specs = [specs[i] for i in rng.choice(len(specs), 150, replace=False)]
    cands = []
    for cs, o in specs:
        R = len(cs)
        pts = []
        for i, k in enumerate(cs):
            sh = 0.5 / k if (i + o) % 2 else 0.0
            for j in range(k):
                pts.append([(j + 0.5) / k + sh - 0.25 / k, (i + 0.5) / R])
        pts = np.clip(np.array(pts), 0.05, 0.95)
        for _ in range(2):
            keep = np.sort(rng.choice(len(pts), n, replace=False))
            c = _relax(pts[keep])
            cands.append((_rad(c).sum(), cs + (o,), c))
    return _drive(problem, rng, polish, cands, 8)
