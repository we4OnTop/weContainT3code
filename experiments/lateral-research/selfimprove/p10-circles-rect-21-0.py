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
    def start(t):
        typ = t % 3
        if typ == 0:
            w = rng.uniform(0.65, 1.0); h = 2 - w; m = int(rng.integers(3, 6))
            cnt = np.full(m, n // m); cnt[rng.permutation(m)[:n - cnt.sum()]] += 1
            C = []
            for i in range(m):
                k = cnt[i]
                for j in range(k):
                    r = 0.85 * min(w / (2 * k), h / (2 * m))
                    C.append([(j + .5) / k * w + rng.normal(0, .02), (i + .5) / m * h + rng.normal(0, .02), r])
            C = np.array(C)
        elif typ == 1:
            w = rng.uniform(0.8, 1.0); h = 2 - w
            cs = [(1, 6, 14), (1, 7, 13), (1, 8, 12), (2, 7, 12), (3, 8, 10), (1, 5, 15)][rng.integers(6)]
            C = []
            for k, ct in enumerate(cs):
                a0 = rng.uniform(0, 6.28)
                for j in range(ct):
                    f = 0 if ct == 1 else 0.85 * k / (len(cs) - 1)
                    a = a0 + 6.2832 * j / ct
                    C.append([w / 2 + f * w / 2 * np.cos(a), h / 2 + f * h / 2 * np.sin(a), 0.05])
            C = np.array(C)
        else:
            w = rng.uniform(0.7, 1.0); h = 2 - w
            q = rng.random((10, 2)) * [w / 2, h]
            C = np.vstack([[[a, b, .06] for a, b in q], [[w - a, b, .06] for a, b in q], [[w / 2, rng.random() * h, .06]]])
        return np.concatenate([C[:n].ravel(), [w]])
    t = 0
    while st['c'] < 90:
        P(start(t)); t += 1
    return finish()
