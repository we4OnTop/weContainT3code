def search(problem, rng, polish):
    n = problem.n
    B = 148
    used = 0
    best = [-np.inf, None]

    def run(x):
        nonlocal used
        used += 1
        s, y = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(y)
        return s, y

    def cheap(p):
        d = np.sqrt(((p[:, None] - p[None]) ** 2).sum(-1))
        d = d[np.triu_indices(len(p), 1)]
        return d.max() / max(d.min(), 1e-9)

    def sym():
        kind = int(rng.integers(3))
        if kind == 0:  # inversion: 13 pairs + centre
            a = rng.normal(size=(13, 3)) * rng.uniform(0.6, 1.2)
            return np.vstack([a, -a, np.zeros((1, 3))])
        if kind == 1:  # C3 about z: 9 orbits
            a = rng.normal(size=(9, 3)) * rng.uniform(0.6, 1.2)
            out = []
            for t in (0, 2 * np.pi / 3, 4 * np.pi / 3):
                c, s = np.cos(t), np.sin(t)
                out.append(a @ np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]]).T)
            return np.vstack(out)
        a = rng.normal(size=(13, 3)) * rng.uniform(0.6, 1.2)  # C2 about z + 1 on axis
        b = a * np.array([-1, -1, 1])
        return np.vstack([a, b, np.array([[0, 0, rng.normal()]])])

    for _ in range(int(B * 0.7)):
        cands = [sym() for _ in range(10)]
        p = min(cands, key=cheap)
        p = p + rng.normal(size=p.shape) * 0.03
        run(p.ravel())
    k = 0
    while used < B:
        sig = 0.01 * 0.6 ** (k // 3)
        k += 1
        run(best[1] + rng.normal(size=best[1].shape) * sig * np.abs(best[1]).max())
    return best[1]
