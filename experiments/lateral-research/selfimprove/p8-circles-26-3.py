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
    classes = [('mx', m) for m in (0, 2, 4, 6)] + [('dg', m) for m in (0, 2, 4, 6)] + [('c2', 0)]
    def orbit(kind, ax, u, v):
        if ax:
            return [[0.5, u]] if kind == 'mx' else [[u, u]]
        if kind == 'mx':
            return [[u, v], [1 - u, v]]
        if kind == 'dg':
            return [[u, v], [v, u]]
        return [[u, v], [1 - u, 1 - v]]
    cands = []
    for kind, m in classes:
        for _ in range(2):
            orbs = [True] * m + [False] * ((n - m) // 2)
            rng.shuffle(orbs)
            pts = np.zeros((0, 2))
            for ax in orbs:
                bs, bp = -1, None
                for _ in range(12):
                    u, v = rng.uniform(0.04, 0.96, 2)
                    new = np.array(orbit(kind, ax, u, v))
                    t = np.vstack([pts, new])
                    s = _rad(t, 6).sum()
                    if s > bs:
                        bs, bp = s, t
                pts = bp
            cands.append((_rad(pts).sum(), (kind, m), pts))
    return _drive(problem, rng, polish, cands, 8)
