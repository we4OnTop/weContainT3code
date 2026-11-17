def search(problem, rng, polish):
    n = problem.n
    best = [-1e18, None]
    cnt = [0]
    LIM = 150

    def P(x):
        if cnt[0] >= LIM:
            return None
        cnt[0] += 1
        try:
            s, xp = polish(np.asarray(x, float))
        except Exception:
            return None
        if s > best[0]:
            best[0] = s
            best[1] = np.array(xp, float)
        return s

    def grow(w, noise, shrink):
        H = 2 - w
        pts = []
        for k in range(n):
            C = np.column_stack([rng.uniform(0, w, 400), rng.uniform(0, H, 400)])
            rad = np.minimum(np.minimum(C[:, 0], w - C[:, 0]), np.minimum(C[:, 1], H - C[:, 1]))
            for (px, py, pr) in pts:
                rad = np.minimum(rad, np.hypot(C[:, 0] - px, C[:, 1] - py) - pr)
            j = int(np.argmax(rad * (1 + noise * rng.random(400))))
            r = max(rad[j], 1e-3) * rng.uniform(shrink, 1.0)
            pts.append((C[j, 0], C[j, 1], r))
        out = []
        for p in pts:
            out += list(p)
        out.append(w)
        return np.array(out)

    while cnt[0] < LIM - 3:
        w = float(np.clip(rng.uniform(0.45, 1.55), 0.05, 1.95))
        P(grow(w, rng.uniform(0, 1.0), rng.uniform(0.5, 0.95)))
    if best[1] is not None:
        P(best[1])
        P(best[1])
    if best[1] is None:
        return problem.random(rng)
    return best[1]
