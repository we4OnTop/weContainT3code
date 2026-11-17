def search(problem, rng, polish):
    n = problem.n
    pool = []
    used = 0
    def go(x):
        nonlocal used
        used += 1
        s, xp = polish(x)
        pool.append((s, xp))
        pool.sort(key=lambda t: -t[0])
        del pool[3:]
    def square():
        a = int(rng.integers(5, 7))
        b = int(np.ceil(n / a)) + int(rng.integers(0, 2))
        pts = []
        for j in range(b):
            sh = rng.uniform(0, 0.5) / a if rng.random() < 0.5 else 0.0
            for i in range(a):
                pts.append([(i + 0.5 + sh) / (a + 0.3), (j + 0.5) / b])
        pts = np.array(pts)
        pts = pts[rng.permutation(len(pts))[:n]]
        pts = np.clip(pts + rng.normal(0, 0.01, pts.shape), 0.03, 0.97)
        x = np.zeros((n, 3))
        x[:, :2] = pts
        x[:, 2] = 0.07
        return x.ravel()
    for _ in range(100):
        go(square())
    while used < 150:
        s, x = pool[0] if rng.random() < 0.6 else pool[int(rng.integers(len(pool)))]
        y = x.reshape(n, 3).copy()
        k = int(np.argmin(y[:, 2]))
        C = rng.uniform(0.03, 0.97, (200, 2))
        o = np.delete(y, k, axis=0)
        d = np.sqrt(((C[:, None, :] - o[None, :, :2]) ** 2).sum(2)) - o[None, :, 2]
        y[k, :2] = C[int(np.argmax(d.min(1)))]
        y[k, 2] = 0.03
        go(y.ravel())
    return pool[0][1]
