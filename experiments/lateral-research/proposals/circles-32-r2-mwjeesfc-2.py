def search(problem, rng, polish):
    n = problem.n
    best = (-1.0, None)
    while True:
        k = int(rng.integers(3))
        h = n // 2
        p = rng.random((h, 2))
        if k == 0:
            q = np.column_stack([1 - p[:, 0], p[:, 1]])
        elif k == 1:
            q = p[:, ::-1].copy()
        else:
            q = 1 - p
        pts = np.vstack([p, q])
        if n % 2:
            ctr = np.array([[0.5, 0.5]]) if k != 1 else np.array([[0.5, 0.5]])
            pts = np.vstack([pts, ctr])
        r = rng.uniform(0.03, 0.08, len(pts))
        if k == 0:
            r[h:2 * h] = r[:h]
        elif k == 1:
            r[h:2 * h] = r[:h]
        else:
            r[h:2 * h] = r[:h]
        x = np.column_stack([pts, r]).ravel()
        s, xp = polish(x)
        if s > best[0]:
            best = (s, xp)
    return best
