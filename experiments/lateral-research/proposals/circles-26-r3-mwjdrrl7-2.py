def search(problem, rng, polish):
    n = problem.n

    def seed():
        p = rng.random((n, 2))
        for it in range(120):
            k = 4 + 36 * it / 119
            d = p[:, None, :] - p[None, :, :]
            d2 = (d ** 2).sum(-1) + np.eye(n)
            w = d2 ** (-(k + 2) / 2)
            np.fill_diagonal(w, 0)
            f = (d * w[:, :, None]).sum(1)
            f /= np.abs(f).max() + 1e-12
            p = np.clip(p + 0.03 * (1 - it / 120) * f, 0, 1)
        d = np.sqrt(((p[:, None] - p[None]) ** 2).sum(-1) + 10 * np.eye(n)).min()
        r = d / (2 * (1 + d))
        z = np.zeros((n, 3))
        z[:, :2] = r + (1 - 2 * r) * p
        z[:, 2] = r
        return d, z

    cands = sorted((seed() for _ in range(40)), key=lambda t: -t[0])
    best_s, best = -1.0, None
    for _, z in cands[:30]:
        s, x = polish(z.ravel())
        if s > best_s:
            best_s, best = s, x
    while True:
        z = best.copy().reshape(n, 3)
        z[:, :2] += rng.normal(0, 0.02, (n, 2))
        z[:, 2] *= 0.8
        z[:, :2] = np.clip(z[:, :2], 0, 1)
        s, x = polish(z.ravel())
        if s > best_s:
            best_s, best = s, x
