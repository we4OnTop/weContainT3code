def search(problem, rng, polish):
    best = polish(problem.random(rng))
    cur = best
    for _ in range(149):
        x = cur[1]
        sc = np.std(x) + 1e-9
        y = x + rng.normal(scale=sc * rng.choice([0.02, 0.05, 0.1, 0.2, 0.35]), size=x.shape)
        s, xp = polish(y)
        if s > best[0]:
            best = (s, xp)
        if s > cur[0] or rng.random() < 0.15:
            cur = (s, xp)
    return best
