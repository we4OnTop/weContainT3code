def search(problem, rng, polish):
    n = problem.n
    best, bx = -1e9, None
    for _ in range(25):
        s, x = polish(problem.random(rng))
        if s > best:
            best, bx = s, x
    cur, cx = best, bx
    while True:
        sig = rng.choice([0.01, 0.03, 0.06])
        y = cx.copy()
        y[:-1] += rng.normal(0, sig, len(y) - 1)
        y[2:-1:3] = np.abs(y[2:-1:3]) + 0.005
        y[-1] = np.clip(y[-1] + rng.normal(0, sig), 0.3, 1.7)
        s, x = polish(y)
        if s > cur - 0.003 * rng.random():
            cur, cx = s, x
        if s > best:
            best, bx = s, x
            cur, cx = s, x
