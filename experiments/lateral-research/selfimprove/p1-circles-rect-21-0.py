def search(problem, rng, polish):
    n = problem.n
    best, bx = -1e18, None
    while True:
        w = rng.uniform(0.55, 1.0)
        h = 2 - w
        k = int(np.ceil(np.sqrt(n * w / h)))
        rows = int(np.ceil(n / k))
        pts = [((i % k + 0.5) / k * w, (i // k + 0.5) / rows * h) for i in range(n)]
        pts = np.array(pts)
        pts += rng.normal(0, 0.15 * min(w / k, h / rows), pts.shape)
        r = 0.7 * min(w / k, h / rows) / 2 * rng.uniform(0.6, 1.0, n)
        x = np.concatenate([np.column_stack([pts, r]).ravel(), [w]])
        s, xp = polish(x)
        if s > best:
            best, bx = s, xp
