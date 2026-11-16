def search(problem, rng, polish):
    n = problem.n
    T = np.array([(i, j, k) for i in range(n) for j in range(i+1, n) for k in range(j+1, n)])
    I, J, K = T[:, 0], T[:, 1], T[:, 2]
    primes = [17, 19, 23, 29, 31, 37, 41, 43, 47]
    def cheap(P):
        a, b, c = P[I], P[J], P[K]
        cr = np.abs((b[:, 0]-a[:, 0])*(c[:, 1]-a[:, 1]) - (b[:, 1]-a[:, 1])*(c[:, 0]-a[:, 0]))
        return cr.min() / (np.prod(np.ptp(P, axis=0)) + 1e-9)
    while True:
        cands = []
        for _ in range(400):
            p = primes[rng.integers(len(primes))]
            a = rng.integers(1, p)
            b = rng.integers(0, p)
            idx = rng.choice(p, n, replace=False)
            P = np.stack([idx, (a * idx * idx + b * idx) % p], 1).astype(float)
            P = P + rng.uniform(-0.3, 0.3, P.shape)
            P = (P - P.min(0)) / (np.ptp(P, axis=0) + 1e-9)
            cands.append((cheap(P), P))
        cands.sort(key=lambda t: -t[0])
        for _, P in cands[:4]:
            polish(P.ravel())
