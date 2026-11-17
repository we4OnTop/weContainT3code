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
    pairs = [(k, a) for k in (2, 3, 4, 5, 6, 8, 9, 13) for a in (0, 1, 2, 3) if n - a >= k and (n - a) % k == 0]
    def gen(i):
        k, a = pairs[rng.integers(len(pairs))]; m = (n - a) // k
        dih = rng.random() < 0.4
        za = (np.linspace(-1, 1, a) if a > 1 else np.zeros(a)) * rng.uniform(.6, 1.6)
        pts = [[0.0, 0.0, z] for z in za]
        rs = 0.5 + k / (2 * np.pi) * 1.5; zs = 1.0 + 0.15 * m
        def orb(r, th, z):
            return [[r * np.cos(th + 2 * np.pi * j / k), r * np.sin(th + 2 * np.pi * j / k), z] for j in range(k)]
        if dih:
            for _ in range(m // 2):
                r, th, z = rng.uniform(.25, 1) * rs, rng.uniform(0, 2 * np.pi), rng.uniform(-1, 1) * zs
                pts += orb(r, th, z) + orb(r, -th, -z)
            if m % 2: pts += orb(rng.uniform(.5, 1) * rs, 0, 0)
        else:
            for _ in range(m):
                pts += orb(rng.uniform(.25, 1) * rs, rng.uniform(0, 2 * np.pi), rng.uniform(-1, 1) * zs)
        P = np.array(pts, float)
        return (P + rng.normal(0, 1e-3, P.shape)).ravel()
    for i in range(90):
        try: x = gen(i)
        except Exception: x = problem.random(rng)
        if x.size != n * 3: x = problem.random(rng)
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
