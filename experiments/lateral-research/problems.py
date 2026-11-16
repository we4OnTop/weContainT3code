"""Problem worker for `lateral research`: JSON lines on stdin/stdout.

Each problem exposes a flat real vector, a random start, a local polish (SLSQP) and an
exact, tolerance-free score where larger is better. Scores are recomputed from the final
coordinates only, so a polish that ends slightly infeasible cannot inflate them.
"""

import itertools
import json
import sys

import numpy as np
from scipy.optimize import minimize
from scipy.spatial import ConvexHull


def tri_areas(p, T):
    a, b, c = p[T[:, 0]], p[T[:, 1]], p[T[:, 2]]
    return 0.5 * ((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (c[:, 0] - a[:, 0]) * (b[:, 1] - a[:, 1]))


def tri_jac(p, T, sign):
    """d(sign * area)/d(coords), one row per triple, columns x0,y0,x1,y1,..."""
    a, b, c = p[T[:, 0]], p[T[:, 1]], p[T[:, 2]]
    J = np.zeros((len(T), p.size))
    r = np.arange(len(T))
    for idx, gx, gy in (
        (T[:, 0], b[:, 1] - c[:, 1], c[:, 0] - b[:, 0]),
        (T[:, 1], c[:, 1] - a[:, 1], a[:, 0] - c[:, 0]),
        (T[:, 2], a[:, 1] - b[:, 1], b[:, 0] - a[:, 0]),
    ):
        J[r, 2 * idx] = 0.5 * sign * gx
        J[r, 2 * idx + 1] = 0.5 * sign * gy
    return J


class Heilbronn:
    """n points maximising the smallest triangle area, relative to the region's area.

    region "triangle": points inside the triangle (0,0),(1,0),(0,1).
    region "square": points inside the unit square.
    region "convex": no container; the area is that of the points' convex hull.
    """

    def __init__(self, n, region):
        self.n, self.region, self.dim = n, region, 2 * n
        self.T = np.array(list(itertools.combinations(range(n), 3)))

    def random(self, rng):
        p = rng.random((self.n, 2))
        if self.region == "triangle":
            flip = p.sum(1) > 1
            p[flip] = 1 - p[flip]
        return p.ravel()

    def area(self, p):
        if self.region == "triangle":
            return 0.5
        if self.region == "square":
            return 1.0
        return ConvexHull(p).volume

    def score(self, x):
        p = np.asarray(x, float).reshape(-1, 2)
        if self.region == "triangle":
            p = np.clip(p, 0, None)
            s = p.sum(1, keepdims=True)
            p = p / np.maximum(s, 1)
        elif self.region == "square":
            p = np.clip(p, 0, 1)
        return float(np.abs(tri_areas(p, self.T)).min() / self.area(p)), p.ravel()

    def polish(self, x):
        n, T = self.n, self.T
        p0 = np.asarray(x, float).reshape(-1, 2)
        for _ in range(3):  # signs and hull are frozen per pass, so repeat a few times
            sign = np.sign(tri_areas(p0, T))
            sign[sign == 0] = 1
            z0 = np.append(p0.ravel(), np.abs(tri_areas(p0, T)).min())
            cons = [{
                "type": "ineq",
                "fun": lambda z: sign * tri_areas(z[:-1].reshape(-1, 2), T) - z[-1],
                "jac": lambda z: np.hstack([tri_jac(z[:-1].reshape(-1, 2), T, sign), -np.ones((len(T), 1))]),
            }]
            bounds = None
            if self.region == "triangle":
                A = np.zeros((n, 2 * n + 1))
                A[np.arange(n), 2 * np.arange(n)] = -1
                A[np.arange(n), 2 * np.arange(n) + 1] = -1
                cons.append({"type": "ineq", "fun": lambda z: 1 + A @ z, "jac": lambda z: A})
                bounds = [(0, 1)] * (2 * n) + [(0, None)]
            elif self.region == "square":
                bounds = [(0, 1)] * (2 * n) + [(0, None)]
            else:
                h = ConvexHull(p0).vertices  # counter-clockwise
                hn = np.roll(h, -1)

                def hull(z):
                    q = z[:-1].reshape(-1, 2)
                    return 0.5 * np.sum(q[h, 0] * q[hn, 1] - q[hn, 0] * q[h, 1])

                def hull_jac(z):
                    q = z[:-1].reshape(-1, 2)
                    g = np.zeros(2 * n + 1)
                    hp = np.roll(h, 1)
                    g[2 * h] = 0.5 * (q[hn, 1] - q[hp, 1])
                    g[2 * h + 1] = 0.5 * (q[hp, 0] - q[hn, 0])
                    return g

                a0 = hull(z0)
                cons.append({"type": "ineq", "fun": lambda z: a0 - hull(z), "jac": lambda z: -hull_jac(z)})
            res = minimize(lambda z: -z[-1], z0, jac=lambda z: np.append(np.zeros(2 * n), -1.0),
                           constraints=cons, bounds=bounds, method="SLSQP",
                           options={"maxiter": 300, "ftol": 1e-15})
            p1 = res.x[:-1].reshape(-1, 2)
            if not np.all(np.isfinite(p1)):
                break
            if self.region == "convex":
                p1 = p1 / np.sqrt(self.area(p1))  # keep the hull at unit area between passes
            if self.score(p1.ravel())[0] <= self.score(p0.ravel())[0] + 1e-15:
                break
            p0 = p1
        return self.score(p0.ravel())


class Circles:
    """n disjoint circles inside the unit square maximising the sum of radii."""

    def __init__(self, n):
        self.n, self.dim = n, 3 * n
        self.I, self.J = np.triu_indices(n, 1)

    def random(self, rng):
        return np.column_stack([rng.random((self.n, 2)), np.full(self.n, 0.3 / np.sqrt(self.n))]).ravel()

    def score(self, x):
        """Shrinks radii until every constraint holds exactly, then sums them."""
        c = np.asarray(x, float).reshape(-1, 3).copy()
        c[:, :2] = np.clip(c[:, :2], 0, 1)
        r = np.minimum(np.abs(c[:, 2]), np.minimum(c[:, :2], 1 - c[:, :2]).min(1))
        I, J = self.I, self.J
        d = np.hypot(c[I, 0] - c[J, 0], c[I, 1] - c[J, 1])
        for _ in range(200):
            over = r[I] + r[J] - d
            k = np.argmax(over)
            if over[k] <= 0:
                break
            scale = d[k] / (r[I[k]] + r[J[k]]) * (1 - 1e-16)
            r[I[k]] *= scale
            r[J[k]] *= scale
        if np.any(r[I] + r[J] > d):
            return 0.0, c.ravel()
        c[:, 2] = r
        return float(r.sum()), c.ravel()

    def polish(self, x):
        n, I, J = self.n, self.I, self.J
        m = len(I)
        rows = np.arange(m)

        def pair(z):
            c = z.reshape(-1, 3)
            return (c[I, 0] - c[J, 0]) ** 2 + (c[I, 1] - c[J, 1]) ** 2 - (c[I, 2] + c[J, 2]) ** 2

        def pair_jac(z):
            c = z.reshape(-1, 3)
            Jm = np.zeros((m, 3 * n))
            dx, dy, sr = c[I, 0] - c[J, 0], c[I, 1] - c[J, 1], c[I, 2] + c[J, 2]
            Jm[rows, 3 * I], Jm[rows, 3 * J] = 2 * dx, -2 * dx
            Jm[rows, 3 * I + 1], Jm[rows, 3 * J + 1] = 2 * dy, -2 * dy
            Jm[rows, 3 * I + 2] = Jm[rows, 3 * J + 2] = -2 * sr
            return Jm

        W = np.zeros((4 * n, 3 * n))  # wall constraints: x-r, y-r, 1-x-r, 1-y-r >= 0
        w0 = np.zeros(4 * n)
        k = np.arange(n)
        W[k, 3 * k], W[k, 3 * k + 2] = 1, -1
        W[n + k, 3 * k + 1], W[n + k, 3 * k + 2] = 1, -1
        W[2 * n + k, 3 * k], W[2 * n + k, 3 * k + 2], w0[2 * n + k] = -1, -1, 1
        W[3 * n + k, 3 * k + 1], W[3 * n + k, 3 * k + 2], w0[3 * n + k] = -1, -1, 1
        g = np.zeros(3 * n)
        g[2::3] = -1
        res = minimize(lambda z: -z[2::3].sum(), np.asarray(x, float), jac=lambda z: g,
                       constraints=[{"type": "ineq", "fun": pair, "jac": pair_jac},
                                    {"type": "ineq", "fun": lambda z: w0 + W @ z, "jac": lambda z: W}],
                       bounds=[(0, 1), (0, 1), (0, 0.5)] * n, method="SLSQP",
                       options={"maxiter": 400, "ftol": 1e-15})
        a, b = self.score(res.x), self.score(x)
        return a if a[0] >= b[0] else b


class CirclesRect(Circles):
    """n disjoint circles in a rectangle of perimeter 4 maximising the sum of radii.

    Vector: n*(x, y, r) followed by the rectangle width w; the rectangle is [0,w] x [0,2-w].
    """

    def __init__(self, n):
        super().__init__(n)
        self.dim = 3 * n + 1

    def random(self, rng):
        w = rng.uniform(0.6, 1.4)
        c = np.column_stack([rng.random(self.n) * w, rng.random(self.n) * (2 - w), np.full(self.n, 0.3 / np.sqrt(self.n))])
        return np.append(c.ravel(), w)

    def score(self, x):
        x = np.asarray(x, float)
        w = float(np.clip(x[-1], 1e-6, 2 - 1e-6))
        size = np.array([w, 2 - w])
        c = x[:-1].reshape(-1, 3).copy()
        c[:, :2] = np.clip(c[:, :2], 0, size)
        r = np.minimum(np.abs(c[:, 2]), np.minimum(c[:, :2], size - c[:, :2]).min(1))
        I, J = self.I, self.J
        d = np.hypot(c[I, 0] - c[J, 0], c[I, 1] - c[J, 1])
        for _ in range(400):
            over = r[I] + r[J] - d
            k = np.argmax(over)
            if over[k] <= 0:
                break
            scale = d[k] / (r[I[k]] + r[J[k]]) * (1 - 1e-16)
            r[I[k]] *= scale
            r[J[k]] *= scale
        if np.any(r[I] + r[J] > d):
            return 0.0, x
        c[:, 2] = r
        return float(r.sum()), np.append(c.ravel(), w)

    def polish(self, x):
        n, I, J = self.n, self.I, self.J
        m = len(I)
        rows = np.arange(m)

        def pair(z):
            c = z[:-1].reshape(-1, 3)
            return (c[I, 0] - c[J, 0]) ** 2 + (c[I, 1] - c[J, 1]) ** 2 - (c[I, 2] + c[J, 2]) ** 2

        def pair_jac(z):
            c = z[:-1].reshape(-1, 3)
            Jm = np.zeros((m, 3 * n + 1))
            dx, dy, sr = c[I, 0] - c[J, 0], c[I, 1] - c[J, 1], c[I, 2] + c[J, 2]
            Jm[rows, 3 * I], Jm[rows, 3 * J] = 2 * dx, -2 * dx
            Jm[rows, 3 * I + 1], Jm[rows, 3 * J + 1] = 2 * dy, -2 * dy
            Jm[rows, 3 * I + 2] = Jm[rows, 3 * J + 2] = -2 * sr
            return Jm

        # walls: x-r, y-r, w-x-r, (2-w)-y-r >= 0
        W = np.zeros((4 * n, 3 * n + 1))
        w0 = np.zeros(4 * n)
        k = np.arange(n)
        W[k, 3 * k], W[k, 3 * k + 2] = 1, -1
        W[n + k, 3 * k + 1], W[n + k, 3 * k + 2] = 1, -1
        W[2 * n + k, 3 * k], W[2 * n + k, 3 * k + 2], W[2 * n + k, -1] = -1, -1, 1
        W[3 * n + k, 3 * k + 1], W[3 * n + k, 3 * k + 2], W[3 * n + k, -1], w0[3 * n + k] = -1, -1, -1, 2
        g = np.zeros(3 * n + 1)
        g[2:-1:3] = -1
        res = minimize(lambda z: -z[2:-1:3].sum(), np.asarray(x, float), jac=lambda z: g,
                       constraints=[{"type": "ineq", "fun": pair, "jac": pair_jac},
                                    {"type": "ineq", "fun": lambda z: w0 + W @ z, "jac": lambda z: W}],
                       bounds=[(0, 2), (0, 2), (0, 1)] * n + [(0.05, 1.95)], method="SLSQP",
                       options={"maxiter": 400, "ftol": 1e-15})
        a, b = self.score(res.x), self.score(x)
        return a if a[0] >= b[0] else b


class Ratio:
    """n points in R^d minimising (max distance / min distance)^2. Score is its negative."""

    def __init__(self, n, d):
        self.n, self.d, self.dim = n, d, n * d
        self.I, self.J = np.triu_indices(n, 1)

    def random(self, rng):
        return (rng.standard_normal((self.n, self.d)) * np.sqrt(self.n) ** (1 / self.d)).ravel()

    def d2(self, p):
        return ((p[self.I] - p[self.J]) ** 2).sum(1)

    def score(self, x):
        d2 = self.d2(np.asarray(x, float).reshape(-1, self.d))
        return float(-d2.max() / d2.min()), np.asarray(x, float)

    def polish(self, x):
        n, d, I, J = self.n, self.d, self.I, self.J
        m = len(I)
        p0 = np.asarray(x, float).reshape(-1, d)
        p0 = p0 / np.sqrt(self.d2(p0).min())  # min distance 1
        z0 = np.append(p0.ravel(), self.d2(p0).max())
        rows = np.repeat(np.arange(m), d)
        ci = (d * I[:, None] + np.arange(d)).ravel()
        cj = (d * J[:, None] + np.arange(d)).ravel()

        def jac(z, last):
            p = z[:-1].reshape(-1, d)
            diff = 2 * (p[I] - p[J])
            Jm = np.zeros((m, n * d + 1))
            Jm[rows, ci] = diff.ravel()
            Jm[rows, cj] = -diff.ravel()
            Jm[:, -1] = last
            return Jm

        res = minimize(lambda z: z[-1], z0, jac=lambda z: np.append(np.zeros(n * d), 1.0),
                       constraints=[
                           {"type": "ineq", "fun": lambda z: self.d2(z[:-1].reshape(-1, d)) - 1, "jac": lambda z: jac(z, 0)},
                           {"type": "ineq", "fun": lambda z: z[-1] - self.d2(z[:-1].reshape(-1, d)), "jac": lambda z: -jac(z, -1)},
                       ], method="SLSQP", options={"maxiter": 400, "ftol": 1e-15})
        a, b = self.score(res.x[:-1]), self.score(p0.ravel())
        return a if np.isfinite(a[0]) and a[0] >= b[0] else b


def make(name, n):
    if name.startswith("heilbronn-"):
        return Heilbronn(n, name.split("-")[1])
    if name == "circles":
        return Circles(n)
    if name == "circles-rect":
        return CirclesRect(n)
    if name in ("ratio2", "ratio3"):
        return Ratio(n, int(name[-1]))
    raise ValueError(f"unknown problem {name}")


def main():
    problem = None
    for line in sys.stdin:
        req = json.loads(line)
        if req["op"] == "init":
            problem = make(req["problem"], req["n"])
            out = {"dim": problem.dim}
        elif req["op"] == "random":
            out = {"x": problem.random(np.random.default_rng(req["seed"])).tolist()}
        else:
            score, x = problem.polish(req["x"]) if req["op"] == "polish" else problem.score(req["x"])
            out = {"score": score, "x": np.asarray(x).tolist()}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
