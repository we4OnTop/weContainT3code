def search(problem, rng, polish):
    best, bx = polish(problem.random(rng))
    fails = 0
    while True:
        step = rng.choice([0.005, 0.02, 0.05, 0.15])
        y = np.clip(bx + rng.normal(0, step, problem.dim), 0, 1)
        s, y = polish(y)
        if s > best:
            best, bx, fails = s, y, 0
        else:
            fails += 1
            if fails > 40:
                best, bx = polish(problem.random(rng))
                fails = 0
