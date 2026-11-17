def search(problem, rng, polish):
    n = problem.n
    calls = [0]
    best = [-1.0, None]
    def P(x):
        if calls[0] >= 149:
            return None
        calls[0] += 1
        s, xp = polish(x)
        xp = np.array(xp, float)
        if s > best[0]:
            best[0], best[1] = s, xp
        return s, xp
    cur = [-1.0, None]
    for _ in range(10):
        z = problem.random(rng).reshape(n, 3).copy()
        z[:, 2] = np.minimum(z[:, 2], 0.05)
        s, xp = P(z.ravel())
        if s > cur[0]:
            cur = [s, xp]
    def hole(C):
        pts = rng.random((3000, 2))
        free = np.minimum(np.minimum(pts[:, 0], 1 - pts[:, 0]), np.minimum(pts[:, 1], 1 - pts[:, 1]))
        d = np.sqrt(((pts[:, None, :] - C[None, :, :2]) ** 2).sum(2)) - C[None, :, 2]
        free = np.minimum(free, d.min(1))
        top = np.argsort(-free)[:5]
        i = int(rng.choice(top))
        return pts[i], max(free[i], 0.005)
    while calls[0] < 149:
        C = cur[1].reshape(n, 3).copy()
        if rng.random() < 0.3:
            i = int(rng.integers(n))
        else:
            i = int(rng.choice(np.argsort(C[:, 2])[:3]))
        pos, rad = hole(np.delete(C, i, axis=0))
        C[i] = [pos[0], pos[1], rad * 0.9]
        if rng.random() < 0.3:
            j = int(rng.integers(n))
            C[j, :2] += rng.normal(0, 0.02, 2)
            C[:, :2] = np.clip(C[:, :2], 0, 1)
        s, xp = P(C.ravel())
        if s >= cur[0] - 1e-9:
            cur = [s, xp]
    return best[0], best[1]
