def search(problem, rng, polish):
    n = problem.n; B = 150; ex = 112; pool = []; cnt = [0]
    def run(x):
        cnt[0] += 1
        s, xp = polish(np.asarray(x, float)); xp = np.array(xp)
        for i, p in enumerate(pool):
            if abs(s - p[0]) < 1e-9:
                if s > p[0]: pool[i] = (s, xp)
                break
        else:
            pool.append((s, xp))
        pool.sort(key=lambda t: -t[0]); del pool[3:]
        return s, xp
    def finish():
        while cnt[0] < B and pool:
            moved = False
            for s0, x0 in list(pool):
                if cnt[0] >= B: break
                s, _ = run(x0)
                if abs(s - s0) > 1e-13: moved = True
            if not moved: break
        return pool[0]
    def kick(x):
        C = x[:-1].reshape(n, 3).copy(); w = float(x[-1]); h = 2 - w
        rb = C[:, 2].mean(); t = int(rng.integers(4))
        if t == 0:  # row/column shift
            ax = int(rng.integers(2)); i = int(rng.integers(n))
            m = np.abs(C[:, 1 - ax] - C[i, 1 - ax]) < C[i, 2]
            C[m, ax] += rng.choice([-1, 1]) * rng.uniform(0.3, 1.2) * rb
        elif t == 1:  # ring rotation
            c0, c1 = w / 2, h / 2
            d = np.hypot(C[:, 0] - c0, C[:, 1] - c1); d0 = d[rng.integers(n)]
            m = np.abs(d - d0) < 1.5 * rb
            a = rng.choice([-1, 1]) * rng.uniform(0.3, 1.0) * rb / max(d0, rb)
            dx = C[m, 0] - c0; dy = C[m, 1] - c1
            C[m, 0] = c0 + dx * np.cos(a) - dy * np.sin(a)
            C[m, 1] = c1 + dx * np.sin(a) + dy * np.cos(a)
        elif t == 2:  # swap a big and a small element
            cand = rng.choice(n, 6, replace=False); i = cand[0]
            j = cand[1:][np.argmax(np.abs(C[cand[1:], 2] - C[i, 2]))]
            C[[i, j], :2] = C[[j, i], :2]
        else:  # aspect change
            nw = float(np.clip(w + rng.normal(0, 0.03), 0.3, 1.7))
            C[:, 0] *= nw / w; C[:, 1] *= (2 - nw) / h; w = nw; h = 2 - w
        C[:, 2] *= 0.9
        C[:, 0] = np.clip(C[:, 0], 0.01, w - 0.01); C[:, 1] = np.clip(C[:, 1], 0.01, h - 0.01)
        return np.r_[C.ravel(), w]
    cur = None
    for _ in range(5):
        r = run(problem.random(rng))
        if cur is None or r[0] > cur[0]: cur = r
    while cnt[0] < ex:
        s, x = run(kick(cur[1]))
        if s >= cur[0] or rng.random() < np.exp((s - cur[0]) / 0.003): cur = (s, x)
        if rng.random() < 0.3 and pool: cur = pool[0]
    return finish()
