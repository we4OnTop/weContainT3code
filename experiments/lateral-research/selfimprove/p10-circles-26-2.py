def search(problem, rng, polish):
    n = problem.n
    st = {'u': 0, 'b': -1e9, 'x': None}
    pool = []
    def run(x):
        if st['u'] >= 150: return None
        st['u'] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            if st['u'] >= 150: raise
            return None
        xp = np.array(xp); pool.append((s, xp))
        if s > st['b']: st['b'], st['x'] = s, xp
        return s, xp
    def mk(C, r):
        return np.column_stack([np.clip(C, 0.01, 0.99), r * np.ones(len(C))]).ravel()
    def gap(C, r, m=2000):
        Q = rng.random((m, 2)); c = np.minimum(Q, 1 - Q).min(1)
        if len(C):
            c = np.minimum(c, (np.sqrt(((Q[:, None] - C[None]) ** 2).sum(2)) - r[None]).min(1))
        return Q, c
    def perturb():
        if st['x'] is None: return problem.random(rng)
        x = st['x'].reshape(n, 3).copy()
        i = rng.choice(np.argsort(x[:, 2])[:3]); mk_ = np.arange(n) != i
        Q, c = gap(x[mk_, :2], x[mk_, 2]); j = np.argmax(c)
        x[i, :2] = Q[j]; x[i, 2] = max(c[j], 0.01) * 0.9
        return x.ravel()
    def grow():
        C = np.zeros((0, 2)); r = np.zeros(0); m = int(rng.integers(1, 7)); lo = rng.uniform(0.5, 0.95)
        for _ in range(n):
            Q, c = gap(C, r, 1500)
            j = rng.choice(np.argsort(-c)[:m])
            C = np.vstack([C, Q[j]]); r = np.append(r, max(c[j], 0.01) * rng.uniform(lo, 1))
        return mk(C, r)
    while st['u'] < 90:
        run(grow())
    def top2():
        out = []
        for s, x in sorted(pool, key=lambda t: -t[0]):
            if all(abs(s - o[0]) > 1e-7 for o in out): out.append((s, x))
            if len(out) == 2: break
        return out
    while st['u'] < 112:
        run(perturb())
    t = 0
    while st['u'] < 150 and pool:
        tp = top2(); s, x = tp[t % len(tp)]; t += 1
        y = x.reshape(n, 3).copy(); y[:, :2] += rng.normal(0, 10 ** -rng.uniform(3, 5), (n, 2)); y[:, 2] *= 0.999
        run(y.ravel())
    return st['x'] if st['x'] is not None else problem.random(rng)
