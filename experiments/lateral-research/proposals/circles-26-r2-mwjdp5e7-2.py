def search(problem, rng, polish):
    n = problem.n
    cur, cx = polish(problem.random(rng))
    best = cur
    T, stall = 0.03, 0
    while True:
        y = cx.reshape(n, 3).copy()
        th = rng.normal(0, 0.15)
        c, s_ = np.cos(th), np.sin(th)
        A = np.array([[c, -s_], [s_, c]]) @ (np.eye(2) + rng.normal(0, 0.12, (2, 2)))
        y[:, :2] = 0.5 + (y[:, :2] - 0.5) @ A.T
        y[:, :2] += rng.normal(0, 0.01, (n, 2))
        y[:, :2] = np.clip(y[:, :2], 0.02, 0.98)
        y[:, 2] *= 0.8
        s, x = polish(y.ravel())
        if s > cur or rng.random() < np.exp((s - cur) / max(T, 1e-6)):
            cur, cx = s, x
        if s > best + 1e-9:
            best, stall = s, 0
        else:
            stall += 1
        T *= 0.99
        if stall > 40:
            cur, cx = polish(problem.random(rng))
            best, T, stall = cur, 0.03, 0
