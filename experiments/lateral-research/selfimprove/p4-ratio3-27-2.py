def search(problem, rng, polish):
    n = problem.n
    best = [-np.inf, None]
    calls = [0]
    def P(x):
        if calls[0] >= 149:
            return
        calls[0] += 1
        s, y = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(y, dtype=float)
    def rot(a):
        c, s = np.cos(a), np.sin(a)
        return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.]])
    def ball(m):
        v = rng.normal(size=(m, 3)); v /= np.linalg.norm(v, axis=1)[:, None]
        return v * rng.random((m, 1)) ** (1 / 3)
    def make(kind):
        if kind == 0:    # C3: 9 orbits
            B = ball(9)
            return np.vstack([B @ rot(2 * np.pi * k / 3).T for k in range(3)])
        if kind == 1:    # inversion: 13 pairs + centre
            B = ball(13)
            return np.vstack([B, -B, np.zeros((1, 3))])
        if kind == 2:    # C2 about z: 13 pairs + 1 axis point
            B = ball(13)
            Bp = B * np.array([-1, -1, 1.])
            return np.vstack([B, Bp, [[0, 0, rng.uniform(-1, 1)]]])
        B = ball(8)      # C3 with 3 axis points
        ax = np.zeros((3, 3)); ax[:, 2] = rng.uniform(-1, 1, 3)
        return np.vstack([B @ rot(2 * np.pi * k / 3).T for k in range(3)] + [ax])
    # exploration: 100 symmetric starts, tiny noise so symmetry can break
    for t in range(100):
        X = make(t % 4)
        P((X + rng.normal(0, 0.01, X.shape)).ravel())
    # refinement: perturb best
    t = 0
    while calls[0] < 149:
        t += 1
        if best[1] is None:
            P(make(0).ravel()); continue
        sc = np.abs(best[1]).mean() + 1e-9
        P(best[1] if calls[0] >= 147 else best[1] + rng.normal(0, [0.01, 0.03, 0.06][t % 3] * sc, best[1].shape))
    return best[0], best[1]
