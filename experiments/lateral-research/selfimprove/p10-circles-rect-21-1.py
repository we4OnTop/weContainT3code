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
    def seed(t):
        if t % 2 == 0:
            x = np.array(problem.random(rng), float); x[-1] = np.clip(x[-1], 0.5, 1.5)
            c = x[:-1].reshape(n, 3); c[:, 2] = np.clip(np.abs(c[:, 2]), 0.02, 0.1)
            return x
        w = 1.0; h = 1.0; m = int(rng.integers(3, 6))
        cnt = np.full(m, n // m); cnt[rng.permutation(m)[:n - cnt.sum()]] += 1
        C = [[(j + .5) / cnt[i] * w + rng.normal(0, .02), (i + .5) / m * h, .8 * min(w / (2 * cnt[i]), h / (2 * m))]
             for i in range(m) for j in range(cnt[i])]
        return np.concatenate([np.array(C).ravel(), [w]])
    t = 0
    while st['c'] < 90:
        x = seed(t); t += 1
        ws = np.linspace(0.6, 1.0, 9) if t % 4 < 2 else np.linspace(1.0, 0.6, 9)
        x = x.copy(); x[:-1].reshape(n, 3)[:, 2] *= 0.7
        for wn in ws:
            if st['c'] >= 90: break
            w0 = x[-1]; fx = wn / w0; fy = (2 - wn) / (2 - w0)
            c = x[:-1].reshape(n, 3).copy()
            c[:, 0] *= fx; c[:, 1] *= fy; c[:, 2] *= 0.9 * min(fx, fy, 1.0)
            r = P(np.concatenate([c.ravel(), [wn]]))
            if r is None: continue
            x = r[1]
    return finish()
