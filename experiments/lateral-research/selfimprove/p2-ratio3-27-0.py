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
        return s, y

    g = np.arange(-3, 5)
    grid = np.array(np.meshgrid(g, g, g)).reshape(3, -1).T.astype(float)
    fcc = grid[grid.sum(1) % 2 == 0]
    for _ in range(int(B * 0.7)):
        L = grid if rng.random() < 0.4 else fcc
        c = rng.uniform(-0.5, 0.5, 3) + 0.5 * (rng.random() < 0.5)
        idx = np.argsort(((L - c) ** 2).sum(1))[:n]
        p = L[idx] - L[idx].mean(0)
        q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        p = p @ q + rng.normal(size=p.shape) * rng.uniform(0.02, 0.2)
        run(p.ravel())
    k = 0
    while used < B:
        sig = 0.02 * 0.6 ** (k // 3)
        k += 1
        run(best[1] + rng.normal(size=best[1].shape) * sig * np.abs(best[1]).max())
    return best[1]
