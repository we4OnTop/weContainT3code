def search(problem, rng, polish):
    n = problem.n
    for _ in range(150):
        rows = int(rng.integers(5, 7)); cols = int(rng.integers(5, 7))
        pts = [((j + 0.5 * (i % 2) + 0.25) / (cols + 0.5), (i + 0.5) / rows)
               for i in range(rows) for j in range(cols)]
        pts = np.array(pts)
        pts = pts[rng.permutation(len(pts))[:n]]
        if len(pts) < n:
            pts = np.vstack([pts, rng.random((n - len(pts), 2))])
        pts = np.clip(pts + rng.normal(0, 0.01, pts.shape), 0.02, 0.98)
        r = np.full((n, 1), 0.4 / max(rows, cols))
        polish(np.hstack([pts, r]).ravel())
