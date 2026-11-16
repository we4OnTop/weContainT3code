def search(problem, rng, polish):
    n = problem.n
    T = np.array([(i, j, k) for i in range(n) for j in range(i+1, n) for k in range(j+1, n)])
    I, J, K = T[:, 0], T[:, 1], T[:, 2]
    while True:
        x = problem.random(rng).reshape(n, 2)
        x = (x - x.mean(0)) / (x.std() + 1e-9)
        iters = 300
        for it in range(iters):
            a, b, c = x[I], x[J], x[K]
            cr = (b[:, 0]-a[:, 0])*(c[:, 1]-a[:, 1]) - (b[:, 1]-a[:, 1])*(c[:, 0]-a[:, 0])
            H = np.prod(np.ptp(x, axis=0)) + 1e-9  # bounding box as stop-gradient normaliser
            z = np.abs(cr) / 2 / H
            beta = 20 * (200 ** (it / iters))
            w = np.exp(-beta * (z - z.min()))
            w /= w.sum()
            f = w * np.sign(cr) / 2
            g = np.zeros_like(x)
            np.add.at(g, I, np.stack([f*(b[:, 1]-c[:, 1]), f*(c[:, 0]-b[:, 0])], 1))
            np.add.at(g, J, np.stack([f*(c[:, 1]-a[:, 1]), f*(a[:, 0]-c[:, 0])], 1))
            np.add.at(g, K, np.stack([f*(a[:, 1]-b[:, 1]), f*(b[:, 0]-a[:, 0])], 1))
            x = x + 0.05 * (1 - it / iters + 0.1) * g / (np.linalg.norm(g) + 1e-12) * np.sqrt(n)
            x = (x - x.mean(0)) / (x.std() + 1e-9)
        polish(x.ravel())
