def search(problem, rng, polish):
    n = problem.n
    pop = []
    for _ in range(20):
        pop.append(polish(problem.random(rng)))
    for _ in range(270):
        i, j = rng.choice(len(pop), 2, replace=False)
        A = pop[i][1].reshape(n, 2)
        B = pop[j][1].reshape(n, 2)
        # parent B is randomly rotated/reflected-free shift-aligned by centroid to keep geometry compatible
        B = B - B.mean(0) + A.mean(0)
        mask = rng.random(n) < 0.5
        child = np.where(mask[:, None], A, B).ravel()
        child = child + rng.normal(0, 0.01, child.shape)
        s, y = polish(child)
        w = min(range(len(pop)), key=lambda k: pop[k][0])
        if s > pop[w][0]:
            pop[w] = (s, y)
    k = max(range(len(pop)), key=lambda k: pop[k][0])
    return pop[k]
