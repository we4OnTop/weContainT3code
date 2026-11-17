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

    def rows_start():
        k = int(rng.integers(2, 7))
        base = n // k
        c = [base] * k
        for _ in range(n - base * k):
            c[int(rng.integers(k))] += 1
        for _ in range(int(rng.integers(0, 3))):
            a, b = rng.integers(k, size=2)
            if c[a] > 1:
                c[a] -= 1
                c[b] += 1
        w = rng.uniform(0.5, 1.5)
        H = 2 - w
        if rng.random() < 0.5:
            w, H = H, w
            w = min(max(w, 0.05), 1.95)
            H = 2 - w
        stag = rng.random() < 0.5
        out = []
        for i, ci in enumerate(c):
            y = (i + 0.5) * H / k
            off = (0.25 if (stag and i % 2) else 0.0)
            for j in range(ci):
                x = (j + 0.5 + off) * w / (ci + (0.5 if stag else 0))
                r = 0.8 * min(w / (2 * ci), H / (2 * k))
                out += [x + rng.normal(0, 0.01), y + rng.normal(0, 0.01), r * rng.uniform(0.7, 1.0)]
        out.append(w)
        return np.array(out)

    while cnt[0] < LIM - 3:
        P(rows_start())
    if best[1] is not None:
        P(best[1])
        P(best[1])
    if best[1] is None:
        return problem.random(rng)
    return best[1]
