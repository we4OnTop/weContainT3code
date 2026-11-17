def search(problem, rng, polish):
    n = problem.n
    B = 148
    used = 0
    best = [-np.inf, None]

    def run(x):
        nonlocal used
        used += 1
        s, y = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(y)
        return s, np.array(y)

    g = np.arange(-3, 5)
    grid = np.array(np.meshgrid(g, g, g)).reshape(3, -1).T.astype(float)
    fcc = grid[grid.sum(1) % 2 == 0]
    for _ in range(12):
        c = rng.uniform(-0.5, 0.5, 3)
        idx = np.argsort(((fcc - c) ** 2).sum(1))[:n]
        p = fcc[idx] - fcc[idx].mean(0)
        p = p + rng.normal(size=p.shape) * rng.uniform(0.03, 0.15)
        run(p.ravel())
    cur = best[1].copy()
    cs = best[0]
    while used < int(B * 0.9):
        p = cur.reshape(-1, 3).copy()
        d = np.sqrt(((p[:, None] - p[None]) ** 2).sum(-1))
        np.fill_diagonal(d, np.inf)
        mode = rng.random()
        if mode < 0.5:
            i, j = np.unravel_index(np.argmin(d), d.shape)
            w = i if rng.random() < 0.5 else j
        elif mode < 0.8:
            w = int(np.argmax(((p - p.mean(0)) ** 2).sum(1)))
        else:
            w = int(rng.integers(n))
        rest = np.delete(p, w, axis=0)
        R = np.sqrt(((p - p.mean(0)) ** 2).sum(1)).max()
        cand = rng.normal(size=(300, 3))
        cand = cand / np.linalg.norm(cand, axis=1)[:, None] * R * rng.random((300, 1)) ** (1 / 3)
        cand = cand + p.mean(0)
        md = np.sqrt(((cand[:, None] - rest[None]) ** 2).sum(-1)).min(1)
        p[w] = cand[int(np.argmax(md))]
        s, y = run((p + rng.normal(size=p.shape) * 0.01 * R).ravel())
        if s >= cs:
            cs, cur = s, y
    k = 0
    while used < B:
        sig = 0.005 * 0.5 ** (k // 2)
        k += 1
        run(best[1] + rng.normal(size=best[1].shape) * sig * np.abs(best[1]).max())
    return best[1]
