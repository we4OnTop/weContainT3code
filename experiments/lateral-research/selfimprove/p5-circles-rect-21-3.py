def search(problem, rng, polish):
    n = problem.n
    pool = []
    k = [0]
    def P(x):
        s, xp = polish(x)
        k[0] += 1
        if s == s:
            pool.append((s, np.array(xp, float)))
    def start():
        w = rng.uniform(0.5, 1.0)
        H = 2 - w
        ax = int(rng.integers(0, 4)) if n % 2 == 0 else int(rng.choice([1, 3, 5]))
        if (n - ax) % 2:
            ax += 1
        pairs = (n - ax) // 2
        rows = int(rng.integers(3, 6))
        cnt = np.full(rows, pairs // rows)
        for i in rng.permutation(rows)[: pairs - cnt.sum()]:
            cnt[i] += 1
        r0 = 0.85 * min(w / (2 * (cnt.max() * 2 + 1)), H / (2 * rows))
        jit = rng.uniform(0, 0.3)
        out = []
        for i, ci in enumerate(cnt):
            y = H * (i + .5) / rows
            for j in range(ci):
                x = w / 2 * (j + .5) / max(ci, 1)
                x = np.clip(x + jit * r0 * rng.normal(), 0, w / 2)
                yy = np.clip(y + jit * r0 * rng.normal(), 0, H)
                r = r0 * rng.uniform(0.6, 1.0)
                out += [x, yy, r, w - x, yy, r]
        for j in range(ax):
            out += [w / 2, H * (j + .5) / ax, r0 * 0.8]
        out.append(w)
        return np.array(out)
    while k[0] < 110:
        P(start())
    pool.sort(key=lambda t: -t[0])
    top = []
    for s, x in pool:
        if all(abs(s - t[0]) > 1e-9 for t in top):
            top.append([s, x])
        if len(top) == 2:
            break
    i = 0
    while k[0] < 148 and top:
        t = top[i % len(top)]
        s, xp = polish(t[1])
        k[0] += 1
        if s == s and s > t[0]:
            t[0], t[1] = s, np.array(xp, float)
            pool.append((s, t[1]))
        i += 1
    return max(pool, key=lambda t: t[0])[1] if pool else problem.random(rng)
