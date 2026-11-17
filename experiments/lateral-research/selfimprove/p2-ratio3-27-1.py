def search(problem, rng, polish):
    n = problem.n
    B = 148
    used = 0
    best = [-np.inf, None]

    def run(x):
        nonlocal used
        used += 1
        s, y = polish(x)
        if s > best[0]:
            best[0], best[1] = s, np.array(y)
        return s, y

    def fib(m):
        i = np.arange(m) + 0.5
        z = 1 - 2 * i / m
        r = np.sqrt(1 - z * z)
        t = np.pi * (1 + 5 ** 0.5) * i
        P = np.c_[r * np.cos(t), r * np.sin(t), z]
        q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        return P @ q

    for _ in range(int(B * 0.7)):
        c = int(rng.random() < 0.6)
        rest = n - c
        if rng.random() < 0.5:
            m1 = int(rng.integers(8, 15))
            m2 = rest - m1
            parts = [fib(m1) * 1.0, fib(m2) * rng.uniform(1.6, 2.4)]
        else:
            m1 = int(rng.integers(4, 9))
            m2 = int(rng.integers(8, 14))
            m3 = rest - m1 - m2
            parts = [fib(m1), fib(m2) * rng.uniform(1.4, 1.9), fib(m3) * rng.uniform(2.0, 3.0)]
        if c:
            parts.append(np.zeros((1, 3)))
        p = np.vstack(parts)
        p = p + rng.normal(size=p.shape) * rng.uniform(0.02, 0.15)
        run(p.ravel())
    k = 0
    while used < B:
        sig = 0.01 * 0.5 ** (k // 2)
        k += 1
        run(best[1] + rng.normal(size=best[1].shape) * sig * np.abs(best[1]).max())
    return best[1]
