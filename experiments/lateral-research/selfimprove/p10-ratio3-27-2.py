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
    def relax(P, ps, it):
        P = np.array(P, float).reshape(-1, 3); m = len(P); mask = 1 - np.eye(m)
        if m < 3: return P
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
    def fib(k, r=1.0):
        z = 1 - 2 * (np.arange(k) + .5) / k; ph = np.pi * (3 - 5 ** .5) * np.arange(k); s = np.sqrt(1 - z * z)
        return r * np.stack([s * np.cos(ph), s * np.sin(ph), z], 1)
    def grow(P):
        P = np.array(P, float).reshape(-1, 3)
        while len(P) < n:
            c = P.mean(0); R = (np.sqrt(((P - c) ** 2).sum(1)).max() if len(P) > 1 else 1.0) * 1.05 + 1e-9
            C = rng.normal(size=(400, 3)); C = C / np.linalg.norm(C, axis=1, keepdims=True) * R * rng.random((400, 1)) ** (1 / 3) + c
            gp = np.sqrt(((C[:, None] - P[None]) ** 2).sum(-1)).min(1)
            top = np.argsort(-gp)[:5]
            P = np.vstack([P, C[top[rng.integers(5)] if rng.random() < 0.3 else top[0]]])
            P = relax(P, (4, 16), 25)
        return relax(P, (8, 32, 64), 40)
    def start():
        m0 = [1, 2, 4, 7, 13][rng.integers(5)]
        if m0 == 13: P = np.vstack([np.zeros((1, 3)), fib(12)])
        elif m0 == 7: P = np.vstack([np.zeros((1, 3)), np.eye(3), -np.eye(3)])
        else: P = rng.normal(size=(m0, 3))
        return P + rng.normal(0, 0.05, P.shape)
    def gen(i): return grow(start()).ravel()
    for i in range(90):
        try: x = gen(i)
        except Exception: x = problem.random(rng)
        run(x)
    for j in range(22):
        if not pool: run(problem.random(rng)); continue
        base = (pool[0][1] if (rng.random() < 0.7 or len(pool) < 2) else pool[1][1]).reshape(n, 3)
        D = np.sqrt(((base[:, None] - base[None]) ** 2).sum(-1)); np.fill_diagonal(D, np.inf)
        drop = {int(np.argmin(D.min(1)))} | set(rng.choice(n, 1 + j % 3, replace=False).tolist())
        try: x = grow(np.delete(base, list(drop), 0)).ravel()
        except Exception: x = base.ravel() + rng.normal(0, 1e-3, n * 3)
        run(x)
    while cnt[0] < 150:
        if not pool: run(problem.random(rng)); continue
        b = pool[(cnt[0] % 2) if len(pool) > 1 else 0][1]
        run(b + rng.normal(0, 10 ** rng.uniform(-8, -5) * (np.std(b) + 1e-9), b.shape))
    return pool[0][1] if pool else problem.random(rng)
