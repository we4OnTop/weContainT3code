"""Measures one proposed search method under a fixed polish budget.

Run: python3 run_method.py <problem> <n> <budget> <code.py> [seed]
The code file defines `search(problem, rng, polish)`. Only results returned by `polish`
count, and `polish` scores with the problem's own exact scorer, so a method cannot report
a number it did not earn. Prints one JSON line: {"found": ..., "polishes": ..., "error": ...}.
"""

import json
import signal
import sys

import numpy as np

from problems import make

class BudgetExhausted(Exception):
    pass


def main():
    name, n, budget, path = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    seed = int(sys.argv[5]) if len(sys.argv) > 5 else 0
    problem = make(name, n)
    problem.kind = name
    state = {"best": -np.inf, "x": None, "calls": 0}

    def polish(x):
        if state["calls"] >= budget:
            raise BudgetExhausted
        state["calls"] += 1
        x = np.asarray(x, float).ravel()
        if x.size != problem.dim or not np.all(np.isfinite(x)):
            raise ValueError(f"start must be {problem.dim} finite numbers")
        score, out = problem.polish(x)
        if score > state["best"]:
            state["best"], state["x"] = score, np.asarray(out).tolist()
        return score, np.asarray(out)

    error = None
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError("time limit")))
    signal.alarm(900)
    try:
        scope = {"np": np}
        exec(compile(open(path).read(), path, "exec"), scope)
        scope["search"](problem, np.random.default_rng(seed), polish)
    except BudgetExhausted:
        pass
    except Exception as exc:  # a broken proposal is a measurement too
        error = f"{type(exc).__name__}: {exc}"[:200]
    signal.alarm(0)
    found = None if state["x"] is None else (-state["best"] if name.startswith("ratio") else state["best"])
    print(json.dumps({"found": found, "polishes": state["calls"], "error": error, "x": state["x"]}))


if __name__ == "__main__":
    main()
