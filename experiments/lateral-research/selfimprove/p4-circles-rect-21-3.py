def search(problem, rng, polish):
    n = problem.n
    best = [-1e9, None]
    cnt = [0]

    def P(x):
        cnt[0] += 1
        s, xp = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(xp, dtype=float)
        return s, xp

    for _ in range(8):
        P(problem.random(rng))

    while cnt[0] < 148:
        x = best[1]
        w = x[-1]
        h = 2 - w
        C = x[:-1].reshape(n, 3)
        order = np.argsort(C[:, 2])
        if rng.random() < 0.7:
            idx = int(order[int(rng.integers(0, 4))])
        else:
            idx = int(rng.integers(0, n))
        keep = np.arange(n) != idx
        K = C[keep]
        pts = rng.uniform(0, 1, (3000, 2)) * [w, h]
        far = np.hypot(pts[:, 0] - C[idx, 0], pts[:, 1] - C[idx, 1]) > 0.5 * C[idx, 2] + 0.02
        D = np.hypot(pts[:, None, 0] - K[None, :, 0], pts[:, None, 1] - K[None, :, 1]) - K[None, :, 2]
        clr = np.minimum(D.min(1), np.minimum(np.minimum(pts[:, 0], w - pts[:, 0]),
                                              np.minimum(pts[:, 1], h - pts[:, 1])))
        clr = np.where(far, clr, -1)
        top = np.argsort(-clr)[:5]
        j = int(top[int(rng.integers(0, len(top)))])
        new = np.array([pts[j, 0], pts[j, 1], max(clr[j], 0.01)])
        y = np.vstack([K, new]).ravel()
        y = np.append(y, w)
        P(y)
    return best[0], best[1]
