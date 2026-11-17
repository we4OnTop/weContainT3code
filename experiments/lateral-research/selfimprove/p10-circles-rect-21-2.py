def search(problem, rng, polish):
    n = problem.n
    st = {'c': 0, 'b': -1e18, 'x': None, 'pool': []}
    def P(x):
        if st['c'] >= 150: return None
        st['c'] += 1
        try: s, y = polish(np.asarray(x, float))
        except Exception: return None
        y = np.asarray(y, float); st['pool'].append((s, y))
        if s > st['b']: st['b'], st['x'] = s, y
        return s, y
    def gap(x, k=400):
        w = x[-1]; h = 2 - w; c = x[:-1].reshape(n, 3)
        p = rng.random((k, 2)) * [w, h]
        d = np.min(np.hypot(p[:, None, 0] - c[None, :, 0], p[:, None, 1] - c[None, :, 1]) - c[None, :, 2], axis=1)
        d = np.minimum(d, np.minimum(np.minimum(p[:, 0], w - p[:, 0]), np.minimum(p[:, 1], h - p[:, 1])))
        i = np.argmax(d); return p[i], max(d[i], 1e-3)
    def mv(x):
        y = x.copy(); c = y[:-1].reshape(n, 3)
        i = np.argsort(c[:, 2])[rng.integers(3)]; c[i, 2] = 0
        p, d = gap(y); c[i] = [p[0], p[1], d * 0.9]; return y
    def finish():
        while st['x'] is not None and st['c'] < 112: P(mv(st['x']))
        k = 0
        while st['c'] < 150 and st['pool']:
            top = sorted(st['pool'], key=lambda t: -t[0])
            top = [top[0]] + [t for t in top if abs(t[0] - top[0][0]) > 1e-9][:1]
            y = top[k % len(top)][1]; k += 1
            P(y + rng.normal(0, 1e-6, y.size))
        return st['x'] if st['x'] is not None else problem.random(rng)
    def grow():
        w = rng.uniform(0.6, 1.0); h = 2 - w
        C = np.zeros((0, 3)); top = int(rng.integers(2, 7))
        for _ in range(n):
            p = rng.random((300, 2)) * [w, h]
            d = np.minimum(np.minimum(p[:, 0], w - p[:, 0]), np.minimum(p[:, 1], h - p[:, 1]))
            if len(C):
                d = np.minimum(d, (np.hypot(p[:, None, 0] - C[None, :, 0], p[:, None, 1] - C[None, :, 1]) - C[None, :, 2]).min(1))
            i = rng.choice(np.argsort(-d)[:top])
            C = np.vstack([C, [p[i, 0], p[i, 1], max(d[i], 1e-3) * 0.9]])
        return np.concatenate([C.ravel(), [w]])
    while st['c'] < 90:
        P(grow())
    return finish()
