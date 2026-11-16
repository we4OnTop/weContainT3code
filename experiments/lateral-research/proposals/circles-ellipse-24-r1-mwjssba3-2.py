def search(problem, rng, polish):
    n = problem.n
    pool = [polish(problem.random(rng)) for _ in range(6)]
    while True:
        i, j = rng.choice(len(pool), 2, replace=False)
        A = pool[i][1][:3 * n].reshape(n, 3)
        B = pool[j][1][:3 * n].reshape(n, 3)
        th = rng.uniform(0, 2 * np.pi)
        d = np.array([np.cos(th), np.sin(th)])
        t = rng.uniform(-0.4, 0.4)
        fromA = A[A[:, :2] @ d < t]
        rest = B[np.argsort(-(B[:, :2] @ d))]
        child = list(fromA)
        for row in rest:
            if len(child) >= n:
                break
            if row[:2] @ d >= t:
                child.append(row)
        for row in rest:
            if len(child) >= n:
                break
            child.append(row)
        child = np.array(child[:n])
        child[:, 2] *= 0.7
        y = np.concatenate([child.ravel(), [0.5 * (pool[i][1][-1] + pool[j][1][-1])]])
        y[:-1] += rng.normal(0, 0.005, 3 * n)
        s2, x2 = polish(y)
        worst = min(range(len(pool)), key=lambda k: pool[k][0])
        if s2 > pool[worst][0] and all(abs(s2 - p[0]) > 1e-7 for p in pool):
            pool[worst] = (s2, x2)
