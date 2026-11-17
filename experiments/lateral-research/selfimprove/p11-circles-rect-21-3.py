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
    inc_s, inc = -1e9, None
    for _ in range(3):
        s, x = P(problem.random(rng))
        if s > inc_s: inc_s, inc = s, x
    stall = 0
    while calls[0] < LIM:
        y = inc.copy(); C = y[:-1].reshape(n, 3); w = y[-1]; h = 2 - w
        i = int(rng.integers(n)); kick = int(rng.integers(4))
        if kick == 0:
            band = np.abs(C[:, 1] - C[i, 1]) <= C[i, 2] + 1e-9
            C[band, 0] += rng.uniform(-1, 1) * 2 * C[i, 2]
        elif kick == 1:
            d = np.hypot(C[:, 0] - w / 2, C[:, 1] - h / 2)
            band = np.abs(d - d[i]) <= C[i, 2] + 1e-9
            a = rng.uniform(-0.6, 0.6); c, s_ = np.cos(a), np.sin(a)
            dx = C[band, 0] - w / 2; dy = C[band, 1] - h / 2
            C[band, 0] = w / 2 + c * dx - s_ * dy; C[band, 1] = h / 2 + s_ * dx + c * dy
        elif kick == 2:
            j = int(rng.integers(n)); C[[i, j], :2] = C[[j, i], :2]
        else:
            C[:, :2] += rng.normal(0, 0.15 * C[:, 2].mean(), (n, 2))
            w = float(np.clip(w + rng.normal(0, 0.03), 0.4, 1.6))
        h = 2 - w
        C[:, 0] = np.clip(C[:, 0], 0, w); C[:, 1] = np.clip(C[:, 1], 0, h); C[:, 2] *= 0.9
        s, x = P(np.append(C.ravel(), w))
        if s > inc_s + 1e-13: inc_s, inc, stall = s, x, 0
        else:
            stall += 1
            if stall > 25:
                inc_s, inc = pool[int(rng.integers(len(pool)))]; stall = 0
    return finish()
