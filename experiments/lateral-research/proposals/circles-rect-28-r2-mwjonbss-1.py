def search(problem, rng, polish):
    n = problem.n
    best, bx = -1.0, None
    for _ in range(3):
        s, x = polish(problem.random(rng))
        if s > best: best, bx = s, x
    cur, cx = best, bx
    while True:
        y = np.array(cx, dtype=float)
        A = y[:-1].reshape(n, 3)
        for _ in range(rng.integers(1, 4)):
            i, j = rng.choice(n, 2, replace=False)
            A[i, 2], A[j, 2] = A[j, 2], A[i, 2]
        A[:, 2] *= 0.8
        s, x = polish(y)
        if s > best: best, bx = s, x
        if s > cur or rng.random() < 0.1:
            cur, cx = s, x
        if rng.random() < 0.03:
            cur, cx = best, bx
