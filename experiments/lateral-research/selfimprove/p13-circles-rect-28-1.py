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
    def make(counts, w):
        h = 2 - w; cx, cy = w / 2, h / 2; m = len(counts) - 1; r = 0.05; P = []
        if counts[0]: P.append((cx, cy))
        for i in range(1, m + 1):
            f = 0.9 * i / m; ph = rng.uniform(0, 6.2832); c = counts[i]
            for k in range(c):
                a = ph + 6.2832 * k / c
                P.append((cx + w / 2 * f * np.cos(a), cy + h / 2 * f * np.sin(a)))
        P = np.array(P)
        P[:, 0] = np.clip(P[:, 0], r, w - r); P[:, 1] = np.clip(P[:, 1], r, h - r)
        return np.r_[np.column_stack([P, np.full(len(P), r)]).ravel(), w]
    def base():
        m = int(rng.integers(2, 5)); c0 = int(rng.integers(0, 2)); tot = n - c0
        c = [max(3, int(round(i * tot / (m * (m + 1) / 2)))) for i in range(1, m + 1)]
        c[-1] += tot - sum(c)
        return [c0] + c
    best = [-1.0, None, 0.9]
    while cnt[0] < ex:
        if cnt[0] < 12 or best[1] is None:
            counts = base(); w = rng.uniform(0.6, 1.0)
        else:
            counts = list(best[1]); w = best[2]
            if rng.random() < 0.2:
                if counts[0]: counts[0] = 0; counts[-1] += 1
                elif counts[-1] > 3: counts[0] = 1; counts[-1] -= 1
            else:
                a, b = rng.choice(len(counts) - 1, 2, replace=False) + 1
                if counts[a] > 3: counts[a] -= 1; counts[b] += 1
            if rng.random() < 0.5: w = float(np.clip(w + rng.normal(0, 0.05), 0.5, 1.0))
        if sum(counts) != n: continue
        s, xp = run(make(counts, w))
        if s > best[0]: best = [s, counts, float(xp[-1])]
    return finish()
