def search(problem, rng, polish):
    n = problem.n
    while True:
        k = int(rng.integers(2, 6))
        c = -(-n // k)
        w = rng.uniform(0.7, 1.3)
        h = 2 - w
        if rng.random() < 0.5:
            w, h = h, w
        pts = []
        for i in range(k):
            off = (0.5 * (i % 2) if rng.random() < 0.8 else 0.0)
            for j in range(c):
                pts.append(((j + 0.5 + off * 0.6) / (c + 0.3) * w, (i + 0.5) / k * h))
        idx = rng.permutation(len(pts))[:n]
        r0 = 0.4 * min(w / (c + 0.5), h / k)
        v = np.zeros(problem.dim)
        for t, i in enumerate(idx):
            px, py = pts[i]
            v[3 * t] = np.clip(px + rng.normal(0, 0.02), 0.01, w - 0.01)
            v[3 * t + 1] = np.clip(py + rng.normal(0, 0.02), 0.01, h - 0.01)
            v[3 * t + 2] = r0 * rng.uniform(0.6, 1.0)
        v[-1] = w
        polish(v)
