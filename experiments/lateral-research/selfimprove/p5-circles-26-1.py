def search(problem, rng, polish):
    n = problem.n
    pool = []
    used = 0
    def P(x):
        nonlocal used
        used += 1
        s, y = polish(x)
        pool.append((s, np.array(y)))
        return s, np.array(y)
    cur_s, cur = -1e9, None
    for _ in range(6):
        s, y = P(problem.random(rng))
        if s > cur_s:
            cur_s, cur = s, y
    T = 0.01
    while used < 112:
        x = cur.copy().reshape(n, 3)
        t = rng.random()
        if t < 0.4:
            m = int(rng.integers(1, 3))
            for i in np.argsort(x[:, 2])[:m]:
                x[i, :2] = rng.random(2)
                x[i, 2] = 0.01
        elif t < 0.7:
            i, j = rng.choice(n, 2, replace=False)
            x[[i, j], :2] = x[[j, i], :2]
        else:
            c = rng.random(2)
            near = np.linalg.norm(x[:, :2] - c, axis=1) < 0.3
            x[near, :2] += rng.normal(0, 0.06, (near.sum(), 2))
            x[near, 2] *= 0.7
        x[:, :2] = np.clip(x[:, :2], 0.01, 0.99)
        s, y = P(x.ravel())
        if s > cur_s or rng.random() < np.exp((s - cur_s) / T):
            cur_s, cur = s, y
        T *= 0.98
    pool.sort(key=lambda t: -t[0])
    top = [pool[0][1], pool[min(1, len(pool) - 1)][1]]
    k = 0
    while used < 148:
        x = top[k % 2].copy().reshape(n, 3)
        x[:, :2] += rng.normal(0, 1e-4, (n, 2))
        x[:, 2] *= 0.9995
        P(x.ravel())
        k += 1
    return max(pool, key=lambda t: t[0])[1]
