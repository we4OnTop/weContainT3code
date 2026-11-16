def search(problem, rng, polish):
    n = problem.n
    def build(w):
        h = 2 - w
        P = np.zeros((0, 2)); R = np.zeros(0)
        for _ in range(n):
            q = np.column_stack([rng.uniform(0, w, 400), rng.uniform(0, h, 400)])
            m = np.minimum.reduce([q[:, 0], w - q[:, 0], q[:, 1], h - q[:, 1]])
            if len(R):
                d = np.hypot(q[:, None, 0] - P[None, :, 0], q[:, None, 1] - P[None, :, 1]) - R[None]
                m = np.minimum(m, d.min(1))
            m = np.maximum(m, 1e-3)
            top = np.argsort(-m)[:5]
            i = rng.choice(top)
            P = np.vstack([P, q[i]]); R = np.append(R, m[i] * rng.uniform(0.6, 1.0))
        return np.concatenate([np.column_stack([P, R]).ravel(), [w]])
    best = -1.0; bw = 0.7
    for w in np.linspace(0.3, 1.0, 12):
        s, x = polish(build(w))
        if s > best: best, bw = s, w
    sig = 0.1
    while True:
        w = float(np.clip(bw + rng.normal(0, sig), 0.2, 1.0))
        s, x = polish(build(w))
        if s > best: best, bw = s, w
        else: sig = max(0.01, sig * 0.97)
