def search(problem, rng, polish):
    n = problem.n
    cnt = [0]; pool = []
    def run(x):
        if cnt[0] >= 150: return None
        cnt[0] += 1
        try:
            s, y = polish(np.asarray(x, float).ravel())
        except (ValueError, ArithmeticError, np.linalg.LinAlgError):
            return None
        if not np.isfinite(s): return None
        pool.append((s, np.array(y, float))); pool.sort(key=lambda t: -t[0]); del pool[6:]
        return s
    def move_worst(x, k=1):
        P = np.array(x, float).reshape(n, 3)
        for _ in range(k):
            D = np.sqrt(((P[:, None] - P[None]) ** 2).sum(-1)); np.fill_diagonal(D, np.nan)
            i = int(np.nanargmin(np.nanmin(D, 1))) if rng.random() < 0.5 else int(np.nanargmax(np.nanmax(D, 1)))
            Q = np.delete(P, i, 0); c = Q.mean(0); R = np.sqrt(((Q - c) ** 2).sum(1)).max()
            C = rng.normal(size=(300, 3)); C = C / np.linalg.norm(C, axis=1, keepdims=True) * R * rng.random((300, 1)) ** (1 / 3) + c
            P[i] = C[np.argmax(np.sqrt(((C[:, None] - Q[None]) ** 2).sum(-1)).min(1))]
        return P.ravel()
    def fib(k, r=1.0):
        if k == 0: return np.zeros((0, 3))
        z = 1 - 2 * (np.arange(k) + .5) / k; ph = np.pi * (3 - 5 ** .5) * np.arange(k); s = np.sqrt(1 - z * z)
        return r * np.stack([s * np.cos(ph), s * np.sin(ph), z], 1)
    g = np.arange(-3, 4)
    C = np.array(np.meshgrid(g, g, g)).reshape(3, -1).T.astype(float)
    F = C[C.sum(1) % 2 == 0]; B = np.vstack([C, C + .5]); s3 = 3 ** .5
    H = np.array([[i + j / 2 + (h % 2) * .5, j * s3 / 2 + (h % 2) * s3 / 6, h * (2 / 3) ** .5]
                  for h in range(-3, 4) for i in range(-4, 5) for j in range(-4, 5)])
    opts = [[9, 9, 9], [1, 8, 9, 8, 1], [3, 6, 9, 6, 3], [1, 6, 8, 6, 5, 1], [4, 7, 8, 7, 1], [1, 7, 11, 7, 1], [6, 7, 8, 6], [3, 8, 8, 8]]
    def cut(L):
        o = rng.uniform(-.5, .5, 3)
        return L[np.argsort(((L - o) ** 2).sum(1))[:n]]
    def rings():
        cs = opts[rng.integers(len(opts))]; L = len(cs); P = []
        for k, c in enumerate(cs):
            z = (k - (L - 1) / 2) * 0.85; r = 0 if c == 1 else c / (2 * np.pi)
            a = 2 * np.pi * (np.arange(c) + rng.random()) / c
            P += [[r * np.cos(t), r * np.sin(t), z] for t in a]
        return np.array(P)
    def gen(i):
        k = i % 7
        if k == 0: P = cut(C)
        elif k == 1: P = cut(F)
        elif k == 2: P = cut(B)
        elif k == 3: P = cut(H)
        elif k == 4: P = rings()
        elif k == 5: P = np.vstack([np.zeros((1, 3)), fib(26, 1.6)])
        else: P = np.vstack([np.zeros((1, 3)), fib(12, 1.0), fib(14, 1.9)])
        P = np.asarray(P, float)[:n]
        return (P + rng.normal(0, 10 ** rng.uniform(-3, -1.2), P.shape)).ravel()
    for i in range(90):
        try: x = gen(i)
        except Exception: x = problem.random(rng)
        run(x)
    for j in range(22):
        if not pool: run(problem.random(rng)); continue
        base = pool[0][1] if (rng.random() < 0.7 or len(pool) < 2) else pool[1][1]
        x = move_worst(base, 1 + (j % 3 == 2)); run(x + rng.normal(0, 1e-3 * (np.std(x) + 1e-9), x.shape))
    while cnt[0] < 150:
        if not pool: run(problem.random(rng)); continue
        b = pool[(cnt[0] % 2) if len(pool) > 1 else 0][1]
        run(b + rng.normal(0, 10 ** rng.uniform(-8, -5) * (np.std(b) + 1e-9), b.shape))
    return pool[0][1] if pool else problem.random(rng)
