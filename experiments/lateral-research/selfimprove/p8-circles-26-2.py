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
    for a in range(2, 7):
        for b in range(a, 17):
            if not (n <= a * b <= n + 6):
                continue
            for stg in (0, 1):
                pts = []
                for i in range(a):
                    for j in range(b):
                        y = (j + 0.5 * (i % 2) * stg + 0.5) / (b + 0.5 * stg)
                        pts.append([(i + 0.5) / a, y])
                full = np.array(pts)
                # variant 1: greedy best-removal
                idx = list(range(len(full)))
                while len(idx) > n:
                    bs, bi = -1, None
                    for t in idx:
                        s = _rad(full[[u for u in idx if u != t]], 6).sum()
                        if s > bs:
                            bs, bi = s, t
                    idx.remove(bi)
                c = full[idx]
                cands.append((_rad(c).sum(), (a, b, stg, 0), c))
                # variant 2: best of random removal subsets
                bs, bc = -1, None
                for _ in range(20):
                    k = np.sort(rng.choice(len(full), n, replace=False))
                    s = _rad(full[k], 6).sum()
                    if s > bs:
                        bs, bc = s, full[k]
                cands.append((_rad(bc).sum(), (a, b, stg, 1), bc))
    return _drive(problem, rng, polish, cands, 8)
