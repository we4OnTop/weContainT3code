def search(problem, rng, polish):
    n = problem.n
    def relax(w):
        h = 2 - w
        P = np.column_stack([rng.uniform(0, w, n), rng.uniform(0, h, n)])
        r = np.full(n, 0.02)
        eye = np.eye(n, dtype=bool)
        for _ in range(200):
            D = P[:, None] - P[None]
            d = np.hypot(D[..., 0], D[..., 1]); d[eye] = 1e9
            ov = r[:, None] + r[None] - d
            m = ov > 0
            P = P + 0.5 * (D / d[..., None] * np.where(m, ov, 0)[..., None]).sum(1)
            r = np.where(m.any(1), r * 0.99, r * 1.02)
            P[:, 0] = np.minimum(np.maximum(P[:, 0], r), np.maximum(w - r, r))
            P[:, 1] = np.minimum(np.maximum(P[:, 1], r), np.maximum(h - r, r))
        for _ in range(30):
            r = np.maximum(np.minimum.reduce([r, P[:, 0], w - P[:, 0], P[:, 1], h - P[:, 1]]), 1e-3)
            D = P[:, None] - P[None]
            d = np.hypot(D[..., 0], D[..., 1]); d[eye] = 1e9
            r = r * np.minimum(1, d / (r[:, None] + r[None])).min(1)
        return r.sum(), np.concatenate([np.column_stack([P, r]).ravel(), [w]])
    while True:
        C = [relax(float(rng.uniform(0.4, 1.0))) for _ in range(60)]
        C.sort(key=lambda t: -t[0])
        for _, v in C[:3]:
            polish(v)
