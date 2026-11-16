def search(problem, rng, polish):
    n = problem.n

    def rotmat(axis, a):
        axis = axis / np.linalg.norm(axis)
        K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
        return np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K

    gbest = (-np.inf, None)
    while True:
        cur, xc = polish(problem.random(rng))
        xc = xc.reshape(n, 3)
        stall = 0
        while stall < 25:
            c = xc - xc.mean(0)
            u = rng.normal(size=3)
            side = (c @ u) > rng.normal() * 0.3 * c.std()
            if side.sum() < 2 or side.sum() > n - 2:
                stall += 1
                continue
            R = rotmat(rng.normal(size=3), rng.uniform(0.3, 2 * np.pi - 0.3))
            y = c.copy()
            y[side] = y[side] @ R.T
            y += rng.normal(scale=0.01, size=y.shape)
            sc, xp = polish(y.ravel())
            if sc > cur + 1e-12:
                stall = 0
            else:
                stall += 1
            if sc >= cur:
                cur, xc = sc, xp.reshape(n, 3)
        if cur > gbest[0]:
            gbest = (cur, xc.ravel())
    return gbest
