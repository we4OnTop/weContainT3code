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
    def kick(x):
        P = x.reshape(-1, 3).copy()
        D = np.linalg.norm(P[:, None] - P[None], axis=2)
        np.fill_diagonal(D, 1e18)
        i, j = np.unravel_index(np.argmin(D), D.shape)
        k = i if np.sort(D[i])[1] < np.sort(D[j])[1] else j
        Q = np.delete(P, k, 0)
        c = Q.mean(0)
        R = np.linalg.norm(Q - c, axis=1).max()
        C = c + rng.normal(size=(300, 3)) * R / 2
        C = C[np.linalg.norm(C - c, axis=1) <= R]
        if len(C) == 0:
            C = c + rng.normal(size=(1, 3)) * R / 2
        g = np.linalg.norm(C[:, None] - Q[None], axis=2).min(1)
        Q = np.vstack([Q, C[np.argmax(g)]])
        return (Q + rng.normal(size=Q.shape) * R * 0.02).ravel()
    main = 128
    cur_s, cur = run(problem.random(rng))
    while cnt[0] < main:
        s, y = run(kick(cur))
        if s > cur_s - 0.02 * abs(cur_s) * rng.random():
            cur_s, cur = s, y
        if rng.random() < 0.1 and cnt[0] < main:
            cur_s, cur = run(problem.random(rng))
    sc = np.ptp(best[1]) + 1e-9
    while cnt[0] < 150:
        run(best[1] + rng.normal(size=best[1].shape) * sc * 1e-4)
    return best[0], best[1]
