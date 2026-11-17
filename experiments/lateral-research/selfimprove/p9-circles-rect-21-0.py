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
    shapes=[(0.5,np.sqrt(3)/2),(0.0,1.0),(0.25,1.0),(0.5,1.0)]
    def lat(sh,s,ang,off,w,h):
        a=np.array([s,0.]); b=np.array([sh[0]*s,sh[1]*s])
        R=int(max(w,h)/s*2)+3
        ii,jj=np.meshgrid(np.arange(-R,R+1),np.arange(-R,R+1))
        p=ii.ravel()[:,None]*a+jj.ravel()[:,None]*b+off*s
        c,sn=np.cos(ang),np.sin(ang)
        p=p@np.array([[c,-sn],[sn,c]]).T+[w/2,h/2]
        m=(p[:,0]>=s/2-1e-9)&(p[:,0]<=w-s/2+1e-9)&(p[:,1]>=s/2-1e-9)&(p[:,1]<=h-s/2+1e-9)
        return p[m]
    tries=0
    while cnt[0]<B and tries<2000:
        tries+=1
        w=rng.uniform(0.6,1.0); h=2-w
        sh=shapes[rng.integers(len(shapes))]
        ang=rng.choice([0,15,30,45,60,75,90])*np.pi/180 if rng.random()<0.7 else rng.uniform(0,np.pi)
        off=rng.random(2)
        s=np.sqrt(w*h/n)*1.3
        pts=lat(sh,s,ang,off,w,h)
        while len(pts)<n:
            s*=0.97; pts=lat(sh,s,ang,off,w,h)
        if len(pts)>n:
            pts=pts[np.sort(rng.choice(len(pts),n,replace=False))]
        x=np.concatenate([np.column_stack([pts,np.full(n,0.45*s)]).ravel(),[w]])
        P(x)
    return fin()
