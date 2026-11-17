def search(problem, rng, polish):
    n = problem.n
    cnt = [0]
    best = [-1e18, None]
    def run(x):
        cnt[0] += 1
        s, y = polish(x)
        y = np.array(y, float)
        if s > best[0]:
            best[0], best[1] = s, y
        return s, y
    def fib(k, r):
        i = np.arange(k) + 0.5
        z = 1 - 2 * i / k
        a = np.pi * (1 + 5 ** 0.5) * i
        rr = np.sqrt(1 - z * z)
        return r * np.stack([rr * np.cos(a), rr * np.sin(a), z], 1)
    def seed():
        c = int(rng.integers(0, 2))
        rest = n - c
        if rng.random() < 0.5:
            k1 = int(rng.integers(8, 15))
            parts = [(k1, 1.0), (rest - k1, 1.9)]
        else:
            k1 = int(rng.integers(4, 9)); k2 = int(rng.integers(8, 14))
            parts = [(k1, 0.8), (k2, 1.5), (rest - k1 - k2, 2.1)]
        P = np.vstack([fib(k, r) for k, r in parts] + ([np.zeros((1, 3))] if c else []))
        return (P + rng.normal(size=P.shape) * 0.05).ravel()
    def kick(x):
        P = x.reshape(-1, 3).copy()
        P -= P.mean(0)
        r = np.linalg.norm(P, axis=1)
        t = np.quantile(r, rng.uniform(0.2, 0.8))
        m = r > t if rng.random() < 0.5 else r <= t
        Q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        ang = rng.uniform(0.2, 1.0)
        Q = (1 - ang) * np.eye(3) + ang * Q
        U, _, Vt = np.linalg.svd(Q)
        P[m] = P[m] @ (U @ Vt).T
        return (P + rng.normal(size=P.shape) * r.max() * 0.01).ravel()
    main = 128
    cur_s, cur = run(seed())
    stall = 0
    while cnt[0] < main:
        s, y = run(kick(cur))
        if s > cur_s:
            cur_s, cur, stall = s, y, 0
        else:
            stall += 1
        if stall > 12 and cnt[0] < main:
            cur_s, cur = run(seed())
            stall = 0
    sc = np.ptp(best[1]) + 1e-9
    while cnt[0] < 150:
        run(best[1] + rng.normal(size=best[1].shape) * sc * 1e-4)
    return best[0], best[1]
