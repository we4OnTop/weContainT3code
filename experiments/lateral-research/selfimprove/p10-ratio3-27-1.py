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
    def relax(P, ps=(2, 4, 8, 16, 32, 64), it=60):
        P = np.array(P, float).reshape(-1, 3); m = len(P); mask = 1 - np.eye(m)
        for si, p in enumerate(ps):
            lr = 0.08 * 0.75 ** si
            for _ in range(it):
                D = P[:, None] - P[None]; d = np.sqrt((D ** 2).sum(-1)) + np.eye(m)
                s = np.median(d[mask > 0]) + 1e-12; P = P / s; D = D / s; d = np.maximum(d / s, 0.05)
                a = d ** (p - 1) * mask; b = d ** (-p - 1) * mask
                w = a / (a * d).sum() - b / (b * d).sum()
                gr = (w[:, :, None] * D / d[:, :, None]).sum(1)
                P = P - lr * gr / (np.abs(gr).max() + 1e-18); lr *= 0.96
        return P
    g = np.arange(-3, 4)
    F = np.array(np.meshgrid(g, g, g)).reshape(3, -1).T.astype(float); F = F[F.sum(1) % 2 == 0]
    def gen(i):
        if i % 3 == 2:
            o = rng.uniform(-.5, .5, 3); P = F[np.argsort(((F - o) ** 2).sum(1))[:n]] + rng.normal(0, 0.3, (n, 3))
        else:
            P = rng.normal(size=(n, 3)); P = P / np.linalg.norm(P, axis=1, keepdims=True) * rng.random((n, 1)) ** (1 / 3) * 2
        return relax(P).ravel()
    for i in range(90):
        try: x = gen(i)
        except Exception: x = problem.random(rng)
        run(x)
    for j in range(22):
        if not pool: run(problem.random(rng)); continue
        base = pool[0][1] if (rng.random() < 0.7 or len(pool) < 2) else pool[1][1]
        try: x = relax(move_worst(base, 1 + (j % 3 == 2)), ps=(16, 64), it=30).ravel()
        except Exception: x = move_worst(base)
        run(x)
    while cnt[0] < 150:
        if not pool: run(problem.random(rng)); continue
        b = pool[(cnt[0] % 2) if len(pool) > 1 else 0][1]
        run(b + rng.normal(0, 10 ** rng.uniform(-8, -5) * (np.std(b) + 1e-9), b.shape))
    return pool[0][1] if pool else problem.random(rng)
