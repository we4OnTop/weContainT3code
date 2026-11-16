def search(problem, rng, polish):
    s = np.std(problem.random(rng))
    cur_s, cur = polish(problem.random(rng))
    while True:
        sig = s * rng.choice([0.01, 0.03, 0.08, 0.2])
        y = cur + rng.normal(0, sig, cur.shape)
        sc, x = polish(y)
        if sc > cur_s:
            cur_s, cur = sc, x
