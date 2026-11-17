def search(problem, rng, polish):
    n=problem.n; cnt=[0]; pool=[]
    def P(x):
        s,xp=polish(np.asarray(x,float)); cnt[0]+=1
        xp=np.array(xp,float)
        if np.isfinite(s):
            for i,p in enumerate(pool):
                if abs(s-p[0])<=1e-9:
                    if s>p[0]: pool[i]=(s,xp)
                    break
            else:
                pool.append((s,xp))
            pool.sort(key=lambda p:-p[0]); del pool[3:]
        return s,xp
    def fin():
        c=[p[1] for p in pool]; sc=[p[0] for p in pool]; dn=[False]*len(c); k=0
        while cnt[0]<150 and not all(dn):
            i=k%len(c); k+=1
            if dn[i]: continue
            s,xp=P(c[i])
            if s>sc[i]:
                if s-sc[i]<1e-13: dn[i]=True
                c[i]=xp; sc[i]=s
            else: dn[i]=True
        return pool[0][1] if pool else problem.random(rng)
    B=112
    while cnt[0]<B:
        c0=int(rng.integers(0,2)); k=int(rng.integers(2,5))
        cs=[max(1,6*j+int(rng.integers(-2,3))) for j in range(1,k+1)]
        d=n-c0-sum(cs)
        while d!=0:
            j=k-1 if rng.random()<0.6 else int(rng.integers(k))
            if d>0: cs[j]+=1; d-=1
            elif cs[j]>1: cs[j]-=1; d+=1
        pts=[[0.,0.]] if c0 else []
        for j,m in enumerate(cs):
            ph=rng.uniform(0,2*np.pi)
            for t in range(m):
                a=ph+2*np.pi*t/m
                pts.append([(j+1)*np.cos(a),(j+1)*np.sin(a)])
        pts=np.array(pts)
        w=rng.uniform(0.6,1.0); h=2-w; mg=0.05
        lo=pts.min(0); hi=pts.max(0)
        pts=mg+(pts-lo)/np.maximum(hi-lo,1e-9)*(np.array([w,h])-2*mg)
        D=np.linalg.norm(pts[:,None]-pts[None],axis=2)+np.eye(n)*9
        r=0.45*D.min()
        x=np.concatenate([np.column_stack([pts,np.full(n,r)]).ravel(),[w]])
        P(x)
    return fin()
