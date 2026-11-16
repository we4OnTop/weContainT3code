def search(problem, rng, polish):
    n = problem.n
    cur_s, cur = polish(problem.random(rng))
    while True:
        P = cur.reshape(n, 3)
        D = np.linalg.norm(P[:, None] - P[None], axis=2)
        iu = np.triu_indices(n, 1)
        d = D[iu]
        mn = int(np.argmin(d))
        mx = int(np.argmax(d))
        cand = [iu[0][mn], iu[1][mn], iu[0][mx], iu[1][mx]]
        i = cand[rng.integers(4)]
        Q = P.copy()
        c = P.mean(0)
        rad = np.linalg.norm(P - c, axis=1).max()
        v = rng.normal(size=3)
        v /= np.linalg.norm(v)
        Q[i] = c + v * rad * rng.uniform(0, 1) ** (1 / 3)
        sc, x = polish(Q.ravel())
        if sc > cur_s:
            cur_s, cur = sc, x
