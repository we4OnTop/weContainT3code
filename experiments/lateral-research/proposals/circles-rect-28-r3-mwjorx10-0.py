def search(problem, rng, polish):
    n = problem.n
    pool = []
    def ins(s, x):
        if all(abs(s - p[0]) > 1e-9 for p in pool):
            pool.append((s, x))
            pool.sort(key=lambda p: -p[0])
            del pool[8:]
    for _ in range(8):
        ins(*polish(problem.random(rng)))
    while True:
        i, j = rng.choice(len(pool), 2, replace=False)
        a = np.asarray(pool[i][1]); b = np.asarray(pool[j][1])
        A = a[:3*n].reshape(n, 3); B = b[:3*n].reshape(n, 3)
        wa = a[-1]; wb = b[-1]
        ua = A.copy(); ua[:, 0] /= wa; ua[:, 1] /= (2 - wa)
        ub = B.copy(); ub[:, 0] /= wb; ub[:, 1] /= (2 - wb)
        if rng.random() < .5: ub[:, 0] = 1 - ub[:, 0]
        if rng.random() < .5: ub[:, 1] = 1 - ub[:, 1]
        used = np.zeros(n, bool)
        perm = np.zeros(n, int)
        for k in np.argsort(-A[:, 2]):
            d = np.hypot(ub[:, 0] - ua[k, 0], ub[:, 1] - ua[k, 1])
            d[used] = 9
            m = int(np.argmin(d)); used[m] = True; perm[k] = m
        t = rng.uniform(.25, .75)
        w = (1 - t) * wa + t * wb
        h = 2 - w
        C = np.empty((n, 3))
        C[:, 0] = ((1 - t) * ua[:, 0] + t * ub[perm, 0]) * w
        C[:, 1] = ((1 - t) * ua[:, 1] + t * ub[perm, 1]) * h
        C[:, 2] = 0.9 * ((1 - t) * ua[:, 2] + t * ub[perm, 2])
        ins(*polish(np.append(C.ravel(), w)))
