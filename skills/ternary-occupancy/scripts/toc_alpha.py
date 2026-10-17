# toc_alpha.py — paper appendix D.
import json, sys
import numpy as np
import krippendorff

def main(path):
    data = np.array(json.load(open(path)), dtype=float)
    a = krippendorff.alpha(
        reliability_data=data,
        level_of_measurement="ordinal",
        value_domain=[0, 1, 2],
    )
    json.dump({"alpha": float(a), "ok": bool(a >= 0.67)}, sys.stdout)

if __name__ == "__main__":
    main(sys.argv[1])
