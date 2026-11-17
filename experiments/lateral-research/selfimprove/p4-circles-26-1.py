def search(problem, rng, polish):
    n = problem.n
    best = [-1.0, None]
    calls = [0]
    def P(x):
        if calls[0] >= 149:
            return None
        calls[0] += 1
        s, xp = polish(x)
        xp = np.array(xp, float)
        if s > best[0]:
            best[0], best[1] = s, xp
        return s
    def relax(p, mus, iters):
        p = p.copy()
        m = len(p)
        mo = np.zeros_like(p)
        v = np.zeros_like(p)
        t = 0
        eye = np.eye(m)
        for mu in mus:
            for _ in range(iters):
                t += 1
                X, Y, R = p[:, 0], p[:, 1], p[:, 2]
                dx = X[:, None] - X[None]
                dy = Y[:, None] - Y[None]
                d = np.sqrt(dx * dx + dy * dy) + eye
                o = np.maximum(R[:, None] + R[None] - d, 0)
                np.fill_diagonal(o, 0)
                gx = -2 * mu * (o * dx / d).sum(1)
                gy = -2 * mu * (o * dy / d).sum(1)
                gr = -1 + 2 * mu * o.sum(1)
                wl = np.maximum(R - X, 0); wr = np.maximum(X + R - 1, 0)
                wb = np.maximum(R - Y, 0); wt = np.maximum(Y + R - 1, 0)
                gx += 2 * mu * (wr - wl)
                gy += 2 * mu * (wt - wb)
                gr += 2 * mu * (wl + wr + wb + wt)
                g = np.stack([gx, gy, gr], 1)
                mo = 0.9 * mo + 0.1 * g
                v = 0.999 * v + 0.001 * g * g
                p -= 0.008 * (mo / (1 - 0.9 ** t)) / (np.sqrt(v / (1 - 0.999 ** t)) + 1e-8)
                p[:, :2] = np.clip(p[:, :2], 0, 1)
                p[:, 2] = np.maximum(p[:, 2], 0.001)
        return p
    for t in range(118):
        z = problem.random(rng).reshape(n, 3).copy()
        z[:, 2] = 0.02
        z = relax(z, (3, 10, 40, 200, 1000), 150)
        P(z.ravel())
    for t in range(30):
        z = best[1].reshape(n, 3).copy()
        z[:, :2] += rng.normal(0, 0.01 * (1 + t % 3), (n, 2))
        z = relax(z, (200, 1000), 100)
        P(z.ravel())
    return best[0], best[1]
