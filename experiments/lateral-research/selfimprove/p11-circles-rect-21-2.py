def search(problem, rng, polish):
    n = problem.n; calls = [0]; pool = []; LIM = 112
    def P(x):
        calls[0] += 1
        s, xp = polish(np.asarray(x, float))
        xp = np.array(xp, float)
        if np.isfinite(s):
            j = [i for i, t in enumerate(pool) if abs(t[0] - s) <= 1e-9]
            if not j: pool.append((s, xp))
            elif s > pool[j[0]][0]: pool[j[0]] = (s, xp)
            pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, xp
    def finish():
        moved = True
        while moved and calls[0] < 150:
            moved = False
            for s0, x0 in list(pool):
                if calls[0] >= 150: break
                s, _ = P(x0)
                if s - s0 > 1e-13: moved = True
        return pool[0][1]
    def hole(C, w, h):
        cx = rng.uniform(0, w, 600); cy = rng.uniform(0, h, 600)
        rad = np.minimum(np.minimum(cx, w - cx), np.minimum(cy, h - cy))
        if len(C):
            rad = np.minimum(rad, (np.hypot(cx[:, None] - C[:, 0], cy[:, None] - C[:, 1]) - C[:, 2]).min(1))
        k = rad.argmax()
        return np.array([cx[k], cy[k], max(rad[k], 1e-3)])
    while calls[0] < LIM:
        w = rng.uniform(0.7, 1.0); C = np.zeros((0, 3))
        for _ in range(n): C = np.vstack([C, hole(C, w, 2 - w)])
        s, x = P(np.append(C.ravel(), w))
        for _ in range(15):
            if calls[0] >= LIM: break
            C = x[:-1].reshape(n, 3).copy(); w = x[-1]
            i = int(rng.choice(np.argsort(C[:, 2])[:3]))
            g = hole(np.delete(C, i, 0), w, 2 - w); g[2] *= 0.95; C[i] = g
            s2, x2 = P(np.append(C.ravel(), w))
            if s2 > s: s, x = s2, x2
    return finish()
