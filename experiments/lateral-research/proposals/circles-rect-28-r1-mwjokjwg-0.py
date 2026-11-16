def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    best_s = cur_s
    while True:
        y = np.array(cur, dtype=float)
        P = y[:3 * n].reshape(n, 3)
        w = y[-1]
        P[:, :2] += rng.normal(0, 0.02, (n, 2))
        k = int(rng.integers(1, 4))
        idx = rng.choice(n, k, replace=False)
        P[idx, 0] = rng.uniform(0, w, k)
        P[idx, 1] = rng.uniform(0, 2 - w, k)
        P[idx, 2] = 0.01
        y[:3 * n] = P.reshape(-1)
        y[-1] = min(max(w + rng.normal(0, 0.02), 0.2), 1.8)
        s, z = polish(y)
        if s > cur_s or rng.random() < np.exp((s - cur_s) / 0.02):
            cur_s, cur = s, z
        best_s = max(best_s, s)
