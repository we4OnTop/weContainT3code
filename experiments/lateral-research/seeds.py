"""Structured starts for the distance-ratio problem, compared at equal polish budgets.

lateral (Claude backend) ranked "symmetric seeding" first and "lattice carving" second
among six candidate methods; this measures both against random starts.
Run: python3 seeds.py <dim> <n> [polishes per method] [out.json]
"""

import json
import sys
from multiprocessing import Pool

import numpy as np

from problems import Ratio

HEX = np.array([[1, 0], [0.5, np.sqrt(3) / 2]])
FCC = np.array([[0, 1, 1], [1, 0, 1], [1, 1, 0]]) / np.sqrt(2)


def lattice(rng, d, n):
    """The n lattice points (hexagonal or fcc) nearest a random centre, under a random stretch."""
    r = np.arange(-6, 7)
    grid = np.array(np.meshgrid(*[r] * d)).reshape(d, -1).T @ (HEX if d == 2 else FCC)
    stretch = np.exp(rng.normal(0, 0.15, d))
    dist = (((grid - rng.random(d) @ (HEX if d == 2 else FCC)) * stretch) ** 2).sum(1)
    return grid[np.argsort(dist)[:n]] + rng.normal(0, 0.03, (n, d))


def symmetric(rng, d, n):
    """Orbits of a k-fold rotation (about the origin in 2D, the z axis in 3D)."""
    k = int(rng.integers(2, 7))
    on_axis = n % k if d == 2 and n % k <= 1 else (n % k if d == 3 else None)
    if on_axis is None:
        return symmetric(rng, d, n)
    a = 2 * np.pi * np.arange(k) / k
    scale = n ** (1 / d)
    pts = []
    for _ in range((n - on_axis) // k):
        rad, phase, z = rng.random() ** (1 / 2) * scale / 2, rng.random() * 2 * np.pi, rng.normal(0, scale / 4)
        ring = np.column_stack([rad * np.cos(a + phase), rad * np.sin(a + phase)])
        pts.append(ring if d == 2 else np.column_stack([ring, np.full(k, z)]))
    for _ in range(on_axis):
        pts.append(np.zeros((1, 2)) if d == 2 else np.array([[0, 0, rng.normal(0, scale / 3)]]))
    return np.vstack(pts) + rng.normal(0, 0.02, (n, d))


def run(args):
    method, d, n, seed = args
    rng = np.random.default_rng(seed)
    problem = Ratio(n, d)
    start = {"random": lambda: problem.random(rng).reshape(-1, d),
             "lattice": lambda: lattice(rng, d, n),
             "symmetric": lambda: symmetric(rng, d, n)}[method]()
    score, x = problem.polish(start.ravel())
    return -score, x.tolist()


if __name__ == "__main__":
    d, n = int(sys.argv[1]), int(sys.argv[2])
    budget = int(sys.argv[3]) if len(sys.argv) > 3 else 400
    best = (np.inf, None, None)
    with Pool(4) as pool:
        for method in ("random", "lattice", "symmetric"):
            res = pool.map(run, [(method, d, n, s) for s in range(budget)], chunksize=8)
            vals = np.array([r[0] for r in res])
            i = int(vals.argmin())
            print(f"{d}D n={n} {method:9s} best {vals[i]:.9f}  median {np.median(vals):.4f}", flush=True)
            if vals[i] < best[0]:
                best = (vals[i], res[i][1], method)
    if len(sys.argv) > 4:
        json.dump({"problem": f"ratio{d}", "n": n, "score": -best[0], "x": best[1], "start": best[2]}, open(sys.argv[4], "w"))
