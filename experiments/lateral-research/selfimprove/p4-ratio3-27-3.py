def search(problem, rng, polish):
    n = problem.n
    best = [-np.inf, None]
    calls = [0]
    def P(x):
        if calls[0] >= 149:
            return None
        calls[0] += 1
        s, y = polish(x)
        y = np.array(y, dtype=float)
        if s > best[0]:
            best[0], best[1] = s, y
        return s, y
    def pd(X):
        d = np.sqrt(((X[:, None] - X[None]) ** 2).sum(-1))
        return d
    def sc(X):
        d = pd(X)[np.triu_indices(len(X), 1)]
        return -(d.max() / max(d.min(), 1e-12)) ** 2
    def cands(X, m):
        c = X.mean(0)
        R = pd(X).max() / 2 + 1e-9
        v = rng.normal(size=(m, 3)); v /= np.linalg.norm(v, axis=1)[:, None]
        return c + R * v * rng.random((m, 1)) ** (1 / 3)
    def greedy():
        X = np.zeros((1, 3)); X = np.vstack([X, rng.normal(size=(1, 3))])
        while len(X) < n:
            C = cands(X, 300)
            vals = [sc(np.vstack([X, c])) for c in C]
            X = np.vstack([X, C[int(np.argmax(vals))]])
        return X
    # exploration: 6 greedy-grown starts
    for t in range(6):
        P(greedy().ravel())
    cur_s, cur = best[0], best[1].copy()
    # remove-and-reinsert loop on the worst element
    stall = 0
    while calls[0] < 149:
        if calls[0] >= 147:
            P(best[1]); continue
        X = cur.reshape(n, 3)
        d = pd(X) + np.eye(n) * 1e9
        dm = d.copy(); dm[dm > 1e8] = -1
        iu = np.triu_indices(n, 1)
        flat = np.argsort(d[iu])
        bad = set()
        for q in flat[:3]:
            bad.update([iu[0][q], iu[1][q]])
        for q in flat[-3:]:
            bad.update([iu[0][q], iu[1][q]])
        i = int(rng.choice(sorted(bad)))
        Y = np.delete(X, i, axis=0)
        C = cands(Y, 400)
        vals = np.array([sc(np.vstack([Y, c])) for c in C])
        top = np.argsort(-vals)[:5]
        Z = np.vstack([Y, C[int(rng.choice(top))]])
        res = P(Z.ravel())
        if res is None:
            break
        s, y = res
        if s >= cur_s - 1e-12:
            stall = 0 if s > cur_s + 1e-9 else stall + 1
            cur_s, cur = s, y
        else:
            stall += 1
        if stall > 15:
            cur_s, cur = best[0], best[1].copy()
            stall = 0
    return best[0], best[1]
