def search(problem, rng, polish):
    n = problem.n
    best = (-1e18, None)
    hist = []
    k = 0
    while True:
        if k < 40 or rng.random() < 0.2:
            a = rng.uniform(1.0, 1.5)
        else:
            top = sorted(hist, key=lambda t: -t[0])[:5]
            a = float(np.clip(top[rng.integers(len(top))][1] + rng.normal(0, 0.02), 1.0, 1.5))
        x = np.array(problem.random(rng), dtype=float)
        x[-1] = a
        s, xp = polish(x)
        hist.append((s, float(xp[-1])))
        if s > best[0]:
            best = (s, xp)
        k += 1
