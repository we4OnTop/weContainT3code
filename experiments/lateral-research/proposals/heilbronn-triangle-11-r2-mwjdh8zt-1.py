def search(problem, rng, polish):
    n = problem.n
    best = (-1, None)
    for _ in range(300):
        pts = []
        while len(pts) < n:
            C = problem.random(rng)
            C = np.concatenate([problem.random(rng) for _ in range(1)])
            M = 600
            cand = np.array([problem.random(rng)[:2] for _ in range(M)])
            if len(pts) < 2:
                pts.append(cand[0])
                continue
            Q = np.array(pts)
            m = np.full(M, np.inf)
            for i in range(len(Q)):
                for j in range(i+1, len(Q)):
                    a = np.abs((Q[j, 0]-Q[i, 0])*(cand[:, 1]-Q[i, 1]) - (Q[j, 1]-Q[i, 1])*(cand[:, 0]-Q[i, 0]))
                    m = np.minimum(m, a)
            top = np.argsort(-m)[:3]
            pts.append(cand[rng.choice(top)])
        s, x = polish(np.array(pts).ravel())
        if s > best[0]:
            best = (s, x)
    return best
