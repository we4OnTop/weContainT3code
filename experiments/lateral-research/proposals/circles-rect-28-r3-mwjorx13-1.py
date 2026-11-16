def search(problem, rng, polish):
    n = problem.n
    s, x = polish(problem.random(rng))
    best = (s, x); cur = (s, x); stall = 0
    while True:
        y = np.array(cur[1], dtype=float)
        C = y[:3*n].reshape(n, 3)
        o = np.argsort(C[:, 2])
        if rng.random() < .5:
            i = o[rng.integers(0, 5)]; j = o[-1 - rng.integers(0, 6)]
            rj = C[j, 2]
            a = rng.uniform(0, 6.283)
            dx = .45 * rj * np.cos(a); dy = .45 * rj * np.sin(a)
            cx, cy = C[j, 0], C[j, 1]
            C[i] = [cx - dx, cy - dy, .7 * rj]
            C[j] = [cx + dx, cy + dy, .7 * rj]
        else:
            sm = o[:8]
            p = sm[rng.integers(0, 8)]
            dd = np.hypot(C[sm, 0] - C[p, 0], C[sm, 1] - C[p, 1])
            dd[sm == p] = 9
            q = sm[int(np.argmin(dd))]
            C[p] = [(C[p, 0] + C[q, 0]) / 2, (C[p, 1] + C[q, 1]) / 2, np.hypot(C[p, 2], C[q, 2])]
            w = y[-1]
            C[q] = [rng.uniform(0, w), rng.uniform(0, 2 - w), 1e-3]
        C[:, 2] *= .97
        s, x = polish(y)
        if s > cur[0] - 0.002 * rng.random():
            cur = (s, x)
        if s > best[0] + 1e-9:
            best = (s, x); stall = 0
        else:
            stall += 1
            if stall > 40:
                cur = best; stall = 0
