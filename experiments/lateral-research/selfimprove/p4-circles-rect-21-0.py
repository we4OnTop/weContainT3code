def search(problem, rng, polish):
    n = problem.n
    best = [-1e9, None]
    cnt = [0]

    def P(x):
        cnt[0] += 1
        s, xp = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(xp, dtype=float)
        return s, xp

    def seed():
        w = rng.uniform(0.6, 1.4)
        h = 2 - w
        k = int(rng.integers(3, 7))
        c = np.full(k, n // k)
        c[rng.permutation(k)[:n - c.sum()]] += 1
        v = []
        r = 0.45 * min(w / c.max(), h / k)
        for j in range(k):
            for i in range(c[j]):
                px = (i + 0.5) / c[j] * w + 0.02 * rng.normal()
                py = (j + 0.5) / k * h + 0.02 * rng.normal()
                v += [min(max(px, 0.01), w - 0.01), min(max(py, 0.01), h - 0.01),
                      r * rng.uniform(0.7, 1.1)]
        return np.array(v + [w])

    # exploration: 118 calls
    for i in range(118):
        P(problem.random(rng) if i % 6 == 5 else seed())
    # refinement: 30 calls (re-polish best, then tiny jitters), stop at 148
    P(best[1])
    while cnt[0] < 148:
        x = best[1].copy()
        x[:-1] += 1e-3 * rng.normal(size=x.size - 1) * (cnt[0] % 3 > 0)
        P(x)
    return best[0], best[1]
