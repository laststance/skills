# toc_alpha.py — paper appendix D.
import json, sys
from collections import Counter
import numpy as np
import krippendorff

LABS = ("G*", "G", "G-")
OK = LABS + ("F",)

def majority5(votes):
    c = Counter(votes).most_common()
    if len(c) >= 2 and c[0][1] == c[1][1]:
        return "U"
    return c[0][0]

def gold_ok(items):
    if len(items) != 12:
        raise ValueError("items must be 12")
    if sum(x["gold"] == "F" for x in items) != 3:
        raise ValueError("need exactly 3 F golds")
    band = [x for x in items if x["gold"] in LABS]
    if len(band) != 9:
        raise ValueError("need 9 band golds")
    for x in items:
        vs = x["votes"]
        if x["gold"] not in OK or len(vs) != 3 or any(v not in OK for v in vs):
            raise ValueError("votes")
    band_ok = sum(majority5(x["votes"]) == x["gold"] for x in band)
    fnf_ok = 0
    for x in items:
        m = majority5(x["votes"])
        if m != "U" and (m == "F") == (x["gold"] == "F"):
            fnf_ok += 1
    return band_ok, fnf_ok, band

def rel_from_band(band):
    enc = {"G-": 0, "G": 1, "G*": 2}
    rel = []
    for r in range(3):
        row = []
        for x in band:
            v = x["votes"][r]
            row.append(enc[v] if v in enc else None)
        rel.append(row)
    return rel

def main(path):
    raw = json.load(open(path))
    if isinstance(raw, list):
        rel, items = raw, None
    else:
        if "reliability" in raw:
            raise ValueError("omit reliability; built from items")
        items = raw["items"]
        _, _, band = gold_ok(items)
        rel = rel_from_band(band)
    data = np.array(rel, dtype=float)
    a = krippendorff.alpha(
        reliability_data=data,
        level_of_measurement="ordinal",
        value_domain=[0, 1, 2],
    )
    out = {"alpha": float(a), "ok": None}
    if items is not None:
        band_ok, fnf_ok, _ = gold_ok(items)
        out["band_ok"] = band_ok
        out["fnf_ok"] = fnf_ok
        out["ok"] = bool(a >= 0.67 and band_ok >= 8 and fnf_ok >= 10)
    json.dump(out, sys.stdout)

if __name__ == "__main__":
    main(sys.argv[1])
