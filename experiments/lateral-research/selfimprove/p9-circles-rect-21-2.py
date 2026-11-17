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
    def ins(pts,rs,w,K=400):
        h=2-w
        C=rng.random((K,2))*[w,h]
        d=np.minimum.reduce([C[:,0],w-C[:,0],C[:,1],h-C[:,1]])
        if len(pts):
            D=np.linalg.norm(C[:,None]-np.array(pts)[None],axis=2)-np.array(rs)[None]
            d=np.minimum(d,D.min(1))
        i=int(d.argmax())
        return C[i],max(float(d[i]),1e-3)
    def pack(pts,rs,w):
        return np.concatenate([np.column_stack([np.array(pts),np.array(rs)]).ravel(),[w]])
    while cnt[0]<B:
        w=rng.uniform(0.6,1.0); pts=[]; rs=[]
        for i in range(n):
            p,r=ins(pts,rs,w); pts.append(p); rs.append(r*0.999)
        cur,cx=P(pack(pts,rs,w)); stall=0
        while cnt[0]<B and stall<12:
            a=cx[:-1].reshape(n,3); w=cx[-1]; xy=a[:,:2]; r=a[:,2]
            D=np.linalg.norm(xy[:,None]-xy[None],axis=2)-r[:,None]-r[None]+np.eye(n)*9
            ct=(D<1e-9).sum(1)+(xy[:,0]-r<1e-9)+(w-xy[:,0]-r<1e-9)+(xy[:,1]-r<1e-9)+(2-w-xy[:,1]-r<1e-9)
            k=int(np.argmax(ct+rng.random(n)*1.5))
            keep=[i for i in range(n) if i!=k]
            p2=[xy[i] for i in keep]; r2=[r[i]*0.98 for i in keep]
            p,rr=ins(p2,r2,w); p2.append(p); r2.append(rr*0.999)
            s,x=P(pack(p2,r2,w))
            if s>cur+1e-12: cur,cx=s,x; stall=0
            else: stall+=1
    return fin()
