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
    def rows():
        k = int(rng.integers(4, 8)); cn = np.full(k, n // k)
        cn[rng.choice(k, n - cn.sum(), replace=False)] += 1
        P = []
        for i, c in enumerate(cn):
            for j in range(c): P.append(((j + .5) / c, (i + .5) / k))
        P = np.array(P) + rng.normal(0, 0.015, (n, 2))
        if rng.random() < .5: P = P[:, ::-1]
        return mk(P, 0.4 / cn.max())
    def rings():
        m = int(rng.integers(2, 5)); c0 = int(rng.integers(0, 2))
        rho = np.linspace(0.14, 0.43, m); cnt = np.round((n - c0) * rho / rho.sum()).astype(int)
        cnt[-1] += n - c0 - cnt.sum()
        if cnt.min() < 1: return rows()
        P = [[.5, .5]] * c0
        for ro, c in zip(rho, cnt):
            ph = rng.random() * 6.28
            for j in range(c):
                a = ph + 6.2832 * j / c; P.append((.5 + ro * np.cos(a), .5 + ro * np.sin(a)))
        return mk(np.array(P), 0.06)
    def sym():
        Q = rng.random((n // 2, 2))
        if rng.random() < .5: Q[:, 0] *= .5; Q2 = np.column_stack([1 - Q[:, 0], Q[:, 1]])
        else: Q[:, 1] *= .5; Q2 = 1 - Q
        return mk(np.vstack([Q, Q2]), 0.05)
    gens = [rows, rings, sym]; k = 0
    while st['u'] < 90:
        run(gens[k % 3]()); k += 1
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
