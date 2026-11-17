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
    cur,cx=-1e9,None
    for _ in range(3):
        s,x=P(problem.random(rng))
        if s>cur: cur,cx=s,x
    while cnt[0]<B:
        if rng.random()<0.2 and pool:
            cur,cx=pool[int(rng.integers(len(pool)))]
        a=cx[:-1].reshape(n,3).copy(); w=cx[-1]; h=2-w
        xy=a[:,:2]; r=a[:,2]; mr=r.mean(); kd=int(rng.integers(4))
        if kd==0:
            y0=xy[int(rng.integers(n)),1]
            m=np.abs(xy[:,1]-y0)<1.2*mr
            xy[m,0]+=rng.choice([-1,1])*rng.uniform(0.3,1.0)*mr
        elif kd==1:
            c=np.array([w/2,h/2]); dd=np.linalg.norm(xy-c,axis=1)
            rho=dd[int(rng.integers(n))]
            m=np.abs(dd-rho)<mr
            th=rng.choice([-1,1])*rng.uniform(0.2,1.0)*2*np.pi/max(m.sum(),2)
            cs,sn=np.cos(th),np.sin(th)
            xy[m]=(xy[m]-c)@np.array([[cs,-sn],[sn,cs]]).T+c
        elif kd==2:
            i,j=rng.choice(n,2,replace=False)
            t=xy[i].copy(); xy[i]=xy[j]; xy[j]=t
        else:
            xy+=rng.normal(0,0.15*mr,xy.shape); w=float(np.clip(w+rng.normal(0,0.02),0.5,1.0))
        h=2-w
        xy[:,0]=np.clip(xy[:,0],0.01,w-0.01); xy[:,1]=np.clip(xy[:,1],0.01,h-0.01)
        a[:,2]=r*0.9
        s,x=P(np.concatenate([a.ravel(),[w]]))
        if s>cur-1e-12: cur,cx=s,x
    return fin()
