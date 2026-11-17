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
    def T(Q, t):
        if t == 0: return 1 - Q
        if t == 1: return Q[:, ::-1]
        return np.column_stack([1 - Q[:, 0], Q[:, 1]])
    def half(Q, t):
        if t == 0: return np.sqrt(((Q - .5) ** 2).sum(1))
        if t == 1: return np.abs(Q[:, 0] - Q[:, 1]) / 1.4142
        return np.abs(.5 - Q[:, 0])
    def symgrow(t):
        C = np.zeros((0, 2)); r = np.zeros(0); m = int(rng.integers(1, 6))
        for _ in range(n // 2):
            Q, c = gap(C, r, 1500); c = np.minimum(c, half(Q, t))
            j = rng.choice(np.argsort(-c)[:m]); q = Q[j:j + 1]; rr = max(c[j], 0.01) * rng.uniform(.6, 1)
            C = np.vstack([C, q, T(q, t)]); r = np.append(r, [rr, rr])
        return mk(C, r)
    def c4():
        G = rng.uniform(-.45, .45, (6, 2)); a, b = G[:, 0], G[:, 1]
        P = np.vstack([np.column_stack(z) for z in [(a, b), (-b, a), (-a, -b), (b, -a)]]) + .5
        P = np.vstack([P, rng.random((n - 24, 2))])
        return mk(P, np.r_[np.full(24, 0.05), np.full(n - 24, 0.01)])
    k = 0
    while st['u'] < 90:
        run(c4() if k % 4 == 3 else symgrow(k % 4)); k += 1
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
