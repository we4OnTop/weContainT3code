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
    def sym(t):
        w = rng.uniform(0.55, 1.0); h = 2 - w; cl = t % 3
        r0 = rng.uniform(0.05, 0.1)
        if cl == 0:  # 180-degree rotation, 10 pairs + centre
            q = rng.random((10, 2)) * [w, h]
            C = [[a, b, r0] for a, b in q] + [[w - a, h - b, r0] for a, b in q] + [[w / 2, h / 2, r0]]
        elif cl == 1:  # vertical mirror, 10 pairs + one on axis
            q = rng.random((10, 2)) * [w / 2, h]
            C = [[a, b, r0] for a, b in q] + [[w - a, b, r0] for a, b in q] + [[w / 2, rng.random() * h, r0]]
        else:  # both mirrors, 5 quadrant orbits + centre
            q = rng.random((5, 2)) * [w / 2, h / 2]
            C = []
            for a, b in q:
                C += [[a, b, r0], [w - a, b, r0], [a, h - b, r0], [w - a, h - b, r0]]
            C += [[w / 2, h / 2, r0]]
        return np.concatenate([np.array(C)[:n].ravel(), [w]])
    t = 0
    while st['c'] < 90:
        P(sym(t)); t += 1
    return finish()
