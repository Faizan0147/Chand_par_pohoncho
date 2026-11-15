"""Report what the app will actually show, straight from public/data/*.json."""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "public", "data")
R_M = 1737.4

eph = json.load(open(os.path.join(PUB, "ephemeris.json")))
sites = json.load(open(os.path.join(PUB, "sites.json")))["sites"]
n = eph["n"]
sun = np.array(eph["sunE5"], float).reshape(n, 3) / 1e5


def az_el(v, lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    return (np.degrees(np.arctan2(v @ east, v @ north)) + 360) % 360, np.degrees(np.arcsin(np.clip(v @ up, -1, 1)))


def longest_run(flags):
    best = cur = 0
    for f in flags:
        if not f:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    return best


print(f"{'site':24s} {'terrain':30s} {'hzmax':>6s} {'az':>4s} {'sun%':>6s} {'dark h':>7s}")
print("-" * 84)
for s in sites:
    hz = np.array(s["horizon"])
    sa, se = az_el(sun, s["lat"], s["lon"])
    p = sa * len(hz) / 360.0
    i0 = np.floor(p).astype(int) % len(hz)
    i1 = (i0 + 1) % len(hz)
    f = p - np.floor(p)
    h = hz[i0] * (1 - f) + hz[i1] * f
    lit = (se + 0.2666) > h
    print(f"{s['id']:24s} {s['terrain'][:30]:30s} {hz.max():6.2f} {int(hz.argmax()):4d} "
          f"{100*lit.mean():6.1f} {longest_run(lit):7d}")
