def search(problem, rng, polish):
    n = problem.n
    while True:
        w = rng.uniform(.4, 1.0); h = 2 - w
        r = np.sort(np.exp(rng.normal(0, rng.uniform(.1, .5), n)))[::-1]
        r = r * np.sqrt(.8 * w * h / (np.pi * (r ** 2).sum()))
        placed = np.zeros((n, 3))
        for k in range(n):
            rk = r[k]
            ok = np.zeros(300, bool)
            for _ in range(8):
                pts = np.column_stack([rng.uniform(rk, max(w - rk, rk + 1e-9), 300),
                                       rng.uniform(rk, max(h - rk, rk + 1e-9), 300)])
                ok = np.ones(300, bool)
                if k:
                    d = np.hypot(pts[:, None, 0] - placed[None, :k, 0],
                                 pts[:, None, 1] - placed[None, :k, 1])
                    ok = (d >= placed[None, :k, 2] + rk).all(1)
                if ok.any():
                    break
                rk *= .9
            if ok.any():
                idx = np.flatnonzero(ok)
                m = idx[int(np.argmin(pts[idx, 1] + .05 * rng.random(len(idx))))]
                placed[k] = [pts[m, 0], pts[m, 1], rk]
            else:
                placed[k] = [pts[0, 0], pts[0, 1], 1e-3]
        polish(np.append(placed.ravel(), w))
