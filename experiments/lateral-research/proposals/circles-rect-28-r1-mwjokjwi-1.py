def search(problem, rng, polish):
    n = problem.n
    while True:
        w = rng.uniform(0.35, 1.0)
        h = 2 - w
        c = int(rng.integers(3, 9))
        rows = int(np.ceil(n / c))
        pts = []
        for i in range(rows):
            off = 0.5 if i % 2 else 0.0
            for j in range(c):
                pts.append(((j + 0.25 + off * 0.5 + 0.25) / (c + 0.5) * w,
                            (i + 0.5) / rows * h))
        pts = np.array(pts)
        pts = pts[rng.permutation(len(pts))[:n]] if len(pts) > n else pts
        pts = pts + rng.normal(0, 0.01 + 0.03 * rng.random(), pts.shape)
        pts[:, 0] = np.clip(pts[:, 0], 0, w)
        pts[:, 1] = np.clip(pts[:, 1], 0, h)
        r = 0.4 * min(w / (c + 0.5), h / rows)
        x = np.zeros(problem.dim)
        P = x[:3 * n].reshape(n, 3)
        P[:, :2] = pts
        P[:, 2] = r
        x[:3 * n] = P.reshape(-1)
        x[-1] = w
        polish(x)
