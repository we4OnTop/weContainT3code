def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    best_s, best = cur_s, cur
    while True:
        x = best.copy() if rng.random() < 0.6 else cur.copy()
        w = x[-1]
        w2 = float(np.clip(w + rng.normal(0, 0.08), 0.3, 1.0))
        fx, fy = w2 / w, (2 - w2) / (2 - w)
        P = x[:-1].reshape(n, 3)
        P[:, 0] *= fx
        P[:, 1] *= fy
        P[:, 2] *= min(fx, fy)
        P[:, :2] += rng.normal(0, 0.01, (n, 2))
        x[-1] = w2
        s, xp = polish(x)
        cur_s, cur = s, xp
        if s > best_s:
            best_s, best = s, xp
        elif rng.random() < 0.1:
            cur_s, cur = polish(problem.random(rng))
