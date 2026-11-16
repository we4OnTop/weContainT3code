def search(problem, rng, polish):
    n = problem.n
    best, bx = polish(problem.random(rng))
    cur, cx = best, bx
    sig = 0.08; fails = 0
    while True:
        y = np.array(cx, dtype=float)
        w = y[-1]; w2 = float(np.clip(w + rng.normal(0, sig), 0.15, 1.85))
        fx, fy = w2 / w, (2 - w2) / (2 - w)
        A = y[:-1].reshape(n, 3)
        A[:, 0] *= fx; A[:, 1] *= fy; A[:, 2] *= min(fx, fy)
        A[:, :2] += rng.normal(0, 0.01, (n, 2))
        y[-1] = w2
        s, x = polish(y)
        if s > cur + 1e-9:
            cur, cx = s, x; fails = 0; sig = min(0.3, sig * 1.2)
            if s > best: best, bx = s, x
        else:
            fails += 1; sig = max(0.01, sig * 0.9)
        if fails > 12:
            cur, cx = polish(problem.random(rng)); fails = 0; sig = 0.08
