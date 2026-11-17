def search(problem, rng, polish):
    n = problem.n
    bs, bx = polish(problem.random(rng))
    cur_s, cur_x = bs, bx
    stall = 0
    while True:
        y = cur_x.copy().reshape(n, 3)
        k = int(rng.integers(1, 4))
        idx = rng.choice(n, k, replace=False)
        y[idx, :2] = rng.random((k, 2))
        y[idx, 2] = 0.01
        y[:, :2] += rng.normal(0, 0.005, (n, 2))
        s, x = polish(y.ravel())
        if s > cur_s:
            cur_s, cur_x, stall = s, x, 0
        else:
            stall += 1
        if stall > 15:
            cur_s, cur_x = polish(problem.random(rng))
            stall = 0
