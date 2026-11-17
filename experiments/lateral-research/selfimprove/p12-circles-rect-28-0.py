def search(problem, rng, polish):
    n = problem.n
    while True:
        w = rng.uniform(0.35, 1.0)
        h = 2 - w
        k = int(rng.integers(3, 7))
        base = np.full(k, n // k)
        base[rng.permutation(k)[: n - base.sum()]] += 1
        x = []
        for i in range(k):
            c = base[i]
            for j in range(c):
                px = (j + 0.5) / c * w + rng.normal(0, 0.02)
                py = (i + 0.5) / k * h + rng.normal(0, 0.02)
                r = 0.4 * min(w / c, h / k)
                x += [px, py, r]
        x.append(w)
        polish(np.array(x))
