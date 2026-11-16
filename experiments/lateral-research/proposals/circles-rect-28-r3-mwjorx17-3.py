def search(problem, rng, polish):
    n = problem.n
    while True:
        w = rng.uniform(.45, 1.0); h = 2 - w
        m = n // 2
        rr = np.sqrt(.8 * w * h / (np.pi * n))
        mode = int(rng.integers(3))
        r = rr * rng.uniform(.6, 1.4, m)
        if mode == 1:
            x = rng.uniform(0, w, m); y = rng.uniform(0, h / 2, m)
            x2, y2 = x, h - y
        else:
            x = rng.uniform(0, w / 2, m); y = rng.uniform(0, h, m)
            x2 = w - x
            y2 = y if mode == 0 else h - y
        C = np.zeros((n, 3))
        C[:m] = np.column_stack([x, y, r])
        C[m:2*m] = np.column_stack([x2, y2, r])
        if n % 2:
            C[-1] = [w / 2, h / 2, rr * .5]
        polish(np.append(C.ravel(), w))
