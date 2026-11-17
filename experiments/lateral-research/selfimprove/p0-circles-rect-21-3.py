def search(problem, rng, polish):
    n = problem.n
    pool = []
    for _ in range(8):
        pool.append(polish(problem.random(rng)))
    while True:
        a, b = rng.choice(len(pool), 2, replace=False)
        A, B = pool[a][1], pool[b][1]
        wa, wb = A[-1], B[-1]
        w = 0.5 * (wa + wb)
        h = 2 - w
        ax = int(rng.integers(0, 2))
        frac = rng.uniform(0.25, 0.75)
        cut = frac * (w if ax == 0 else h)
        circ = []
        for P in (A, B):
            C = P[:-1].reshape(-1, 3)
            for c in C:
                if (c[ax] < cut) == (P is A):
                    circ.append(c.copy())
        rng.shuffle(circ)
        while len(circ) > n:
            circ.pop(int(np.argmin([c[2] for c in circ])))
        while len(circ) < n:
            circ.append(np.array([rng.uniform(0, w), rng.uniform(0, h), 0.005]))
        C = np.array(circ)
        C[:, 0] = np.clip(C[:, 0], 0.01, w - 0.01)
        C[:, 1] = np.clip(C[:, 1], 0.01, h - 0.01)
        C[:, 2] *= 0.9
        child = np.concatenate([C.ravel(), [w]])
        s, x = polish(child)
        j = int(np.argmin([p[0] for p in pool]))
        if s > pool[j][0]:
            pool[j] = (s, x)
