def search(problem, rng, polish):
    n = problem.n
    I, J, K = (np.array(t) for t in zip(*[(i, j, k) for i in range(n) for j in range(i+1, n) for k in range(j+1, n)]))
    PI, PJ = (np.array(t) for t in zip(*[(i, j) for i in range(n-1) for j in range(i+1, n-1)]))
    s, x = polish(problem.random(rng))
    best = (s, x)
    cur = best
    while True:
        P = cur[1].reshape(n, 2)
        a = np.abs((P[J, 0]-P[I, 0])*(P[K, 1]-P[I, 1]) - (P[K, 0]-P[I, 0])*(P[J, 1]-P[I, 1])) / 2
        low = np.argsort(a)[:3]
        verts = np.concatenate([[I[t], J[t], K[t]] for t in low])
        r = int(rng.choice(verts))
        Q = np.delete(P, r, axis=0)
        lo, hi = Q.min(0), Q.max(0)
        pad = 0.15 * (hi - lo)
        C = rng.uniform(lo - pad, hi + pad, (3000, 2))
        A = Q[PI]; B = Q[PJ]
        ar = np.abs((B[None, :, 0]-A[None, :, 0])*(C[:, None, 1]-A[None, :, 1]) - (C[:, None, 0]-A[None, :, 0])*(B[None, :, 1]-A[None, :, 1])).min(1)
        top = np.argsort(-ar)[:5]
        c = C[int(rng.choice(top))]
        Y = np.vstack([Q, c])
        s, x = polish(Y.ravel())
        if s > best[0]:
            best = (s, x)
        if s >= cur[0] or rng.random() < 0.1:
            cur = (s, x)
