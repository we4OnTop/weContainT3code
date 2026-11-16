def search(problem, rng, polish):
    best_s, best = polish(problem.random(rng))
    for _ in range(400):
        step = rng.choice([0.01, 0.03, 0.08, 0.2])
        s, y = polish(best + rng.normal(0, step, best.shape))
        if s > best_s:
            best_s, best = s, y
    return best_s, best
