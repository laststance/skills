# toc_gate.py — paper appendix C. numpy>=1.22 required.
import json, sys
import numpy as np

EPS, GAMMA, TAU0, QINC, POSD, B, SEED = 0.08, 0.15, 0.45, 0.10, 0.15, 2000, 20250911
LABS = ("G*", "G", "G-")
VIEW_OK = LABS + ("F",)
IDS = (("Ym", "Y", "Ys"), ("Y", "Ys", "Ym"), ("Ys", "Ym", "Y"))

def p_hat(labels):
    n = len(labels)
    if n == 0:
        return np.array([np.nan, np.nan, np.nan])
    return np.array([labels.count(k) / n for k in LABS])

def maxdev(ph):
    return float(np.max(np.abs(ph - 1.0 / 3.0)))

def majority(xs):
    from collections import Counter
    c = Counter(xs).most_common()
    if len(c) >= 2 and c[0][1] == c[1][1]:
        return None
    return c[0][0]

def labels_from_view(t, view):
    buckets = {"Ym": [], "Y": [], "Ys": []}
    for r in range(3):
        for p in range(3):
            buckets[IDS[r][(p + t) % 3]].append(view[r][p])
    labs = [majority(buckets[k]) for k in ("Ym", "Y", "Ys")]
    if any(x is None or x not in LABS for x in labs):
        raise ValueError("completed trial has F/U/tie; move to incomplete")
    return labs

def check_trial(row):
    view = row["view"]
    if "t" not in row:
        raise ValueError("t required")
    if len(view) != 3 or any(len(x) != 3 or any(v not in VIEW_OK for v in x) for x in view):
        raise ValueError("view must be 3x3")

def main(path):
    d = json.load(open(path))
    N = d["N"]
    trials = sorted(d["completed"], key=lambda r: r["t"])
    ts = [r["t"] for r in trials]
    if len(ts) != len(set(ts)):
        raise ValueError("duplicate t")
    if d["incomplete"] + len(trials) != N:
        raise ValueError("incomplete + completed must equal N")
    for t in trials:
        check_trial(t)
    qinc = d["incomplete"] / float(N)
    nmin = int(np.ceil(0.9 * N))
    q_ok = qinc <= QINC
    n_ok = len(trials) >= nmin
    if not n_ok:
        json.dump(
            {"ok": False, "q_inc": qinc, "A": None, "B": None, "pos": None},
            sys.stdout,
        )
        return
    packed = [labels_from_view(t["t"], t["view"]) for t in trials]
    labs = [x for row in packed for x in row]
    ph = p_hat(labs)
    perm_n = int(sum(set(row) == set(LABS) for row in packed))
    tau = perm_n / float(len(packed))
    views = np.array([t["view"] for t in trials])
    posd = float(
        max(
            np.max(r) - np.min(r)
            for r in (np.mean(views == k, axis=(0, 1)) for k in LABS)
        )
    )
    use_boot = N >= 30
    pos_ok = True if N < 30 else posd <= POSD
    nc = len(packed)
    counts = [labs.count(k) for k in LABS]
    a_ok = maxdev(ph) <= EPS if use_boot else all(abs(c - nc) <= 2 for c in counts)
    b_ok = tau >= TAU0 if use_boot else perm_n >= 5
    if use_boot:
        rng = np.random.Generator(np.random.PCG64(SEED))
        nc = len(trials)
        idx = np.arange(nc)
        md, tb = [], []
        for _ in range(B):
            take = rng.choice(idx, size=nc, replace=True)
            sl = [packed[i] for i in take]
            md.append(maxdev(p_hat([x for t in sl for x in t])))
            tb.append(np.mean([set(t) == set(LABS) for t in sl]))
        a_ok = a_ok and float(np.percentile(md, 95, method="linear")) <= GAMMA
        b_ok = b_ok and float(np.percentile(tb, 2.5, method="linear")) > 2.0 / 9.0
    ok = q_ok and n_ok and a_ok and b_ok and pos_ok
    json.dump(
        {
            "ok": bool(ok),
            "q_inc": qinc,
            "p": ph.tolist(),
            "tau": tau,
            "n_tau": perm_n,
            "posd": posd,
            "A": bool(a_ok),
            "B": bool(b_ok),
            "pos": bool(pos_ok),
        },
        sys.stdout,
    )

if __name__ == "__main__":
    main(sys.argv[1])
