def search(problem, rng, polish):
    n = problem.n
    best, bx = -1.0, None
    calls = 0
    while calls < 190:
        kind = rng.integers(3)
        h = n // 2
        P = rng.random((h, 2))
        if kind == 0:
            P[:, 0] *= 0.5
            Q = np.column_stack([1 - P[:, 0], P[:, 1]])
        elif kind == 1:
            P = np.sort(P, axis=1)[:, ::-1].copy()
            Q = P[:, ::-1]
        else:
            P[:, 0] *= 0.5
            Q = 1 - P
        r = rng.uniform(0.05, 0.12, h)
        pts = np.vstack([P, Q])
        rr = np.concatenate([r, r])
        if n % 2:
            pts = np.vstack([pts, [[0.5, 0.5]]])
            rr = np.append(rr, 0.08)
        s, x = polish(np.column_stack([pts, rr]).ravel())
        calls += 1
        if s > best:
            best, bx = s, x
    while True:
        y = bx.reshape(n, 3).copy()
        y[:, :2] += rng.normal(0, rng.choice([0.005, 0.02, 0.04]), (n, 2))
        y[:, 2] *= 0.85
        s, x = polish(np.clip(y, 0.001, 0.999).ravel())
        if s > best:
            best, bx = s, x
