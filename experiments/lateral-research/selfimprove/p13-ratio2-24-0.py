def search(problem, rng, polish):
    n = problem.n
    TOTAL, used, pool = 150, [0], []
    def sc(x):
        Q = x.reshape(-1, 2)
        d = np.sqrt(((Q[:, None] - Q[None]) ** 2).sum(-1))[np.triu_indices(len(Q), 1)]
        return -(d.max() / d.min()) ** 2 if d.min() > 1e-12 else -1e18
    def P(x):
        used[0] += 1
        s, y = polish(x)
        for i, (t, _) in enumerate(pool):
            if abs(s - t) < 1e-9:
                if s > t:
                    pool[i] = (s, y)
                break
        else:
            pool.append((s, y))
        pool.sort(key=lambda a: -a[0])
        del pool[3:]
        return s, y
    def finish():
        for s, x in list(pool):
            while used[0] < TOTAL:
                s2, x2 = P(x)
                if s2 <= s + 1e-13:
                    break
                s, x = s2, x2
        return pool[0]
    cands = []
    I, J = np.meshgrid(range(-7, 8), range(-7, 8))
    I, J = I.ravel(), J.ravel()
    for s, h in ((0.5, 3 ** .5 / 2), (0, 1), (0.25, 1), (0.5, 1)):
        for th in np.linspace(0, np.pi / 3, 7, endpoint=False):
            R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
            L = np.stack([I + s * J, h * J], 1) @ R.T
            for _ in range(6):
                Q = L - rng.random(2) @ R.T
                Q = Q[np.argsort((Q ** 2).sum(1))]
                k = int(rng.integers(0, 5))
                Z = Q[:n + k]
                if k:
                    Z = np.delete(Z, rng.choice(np.arange(n // 2, n + k), k, replace=False), 0)
                x = Z.ravel()
                cands.append((sc(x), x))
    cands.sort(key=lambda a: -a[0])
    seen = []
    for s0, x in cands:
        if used[0] >= TOTAL - 38:
            break
        if any(abs(s0 - t) < 1e-9 for t in seen):
            continue
        seen.append(s0)
        P(x)
    return finish()
