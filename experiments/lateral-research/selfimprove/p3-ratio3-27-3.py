def search(problem, rng, polish):
    n = problem.n
    cnt = [0]
    best = [-1e18, None]
    def run(x):
        cnt[0] += 1
        s, y = polish(x)
        y = np.array(y, float)
        if s > best[0]:
            best[0], best[1] = s, y
        return s, y
    def seed():
        h = (n - 1) // 2
        A = rng.normal(size=(h, 3))
        A /= np.linalg.norm(A, axis=1)[:, None]
        A *= rng.uniform(0.6, 1.0, size=(h, 1))
        A[:, 0] = np.abs(A[:, 0]) + 0.2
        B = A * np.array([-1, 1, 1])
        P = np.vstack([A, B, np.zeros((n - 2 * h, 3))])
        return (P + rng.normal(size=P.shape) * 0.03).ravel()
    def kick(x):
        P = x.reshape(-1, 3).copy()
        P -= P.mean(0)
        ax = rng.integers(3)
        Q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        if rng.random() < 0.5:
            Q = np.eye(3)
        R = P @ Q
        m = R[:, ax] > 0
        M = np.ones(3); M[ax] = -1
        R[~m] = R[m][rng.permutation(m.sum())[:(~m).sum()]] * M if m.sum() >= (~m).sum() else R[~m]
        P = R @ Q.T
        return (P + rng.normal(size=P.shape) * np.ptp(P) * 0.015).ravel()
    main = 128
    cur_s, cur = run(seed())
    stall = 0
    while cnt[0] < main:
        s, y = run(kick(cur))
        if s > cur_s:
            cur_s, cur, stall = s, y, 0
        else:
            stall += 1
        if stall > 12 and cnt[0] < main:
            cur_s, cur = run(seed())
            stall = 0
    sc = np.ptp(best[1]) + 1e-9
    while cnt[0] < 150:
        run(best[1] + rng.normal(size=best[1].shape) * sc * 1e-4)
    return best[0], best[1]
