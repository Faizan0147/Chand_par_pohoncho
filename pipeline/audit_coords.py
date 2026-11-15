"""Audit pipeline/sites.json against the PGDA DEMs.

PGDA site DEMs are 16x16 km tiles CENTRED on the PGDA site definition. So the raster's
own centre is PGDA's authoritative coordinate for that site. Comparing it with our
sites.json entry tells us (a) whether our longitude convention matches PGDA's frame,
and (b) how far our coordinate is off, in metres.

Inputs: the original PGDA 5 m/px site tiles (16x16 km, centred on PGDA's site). The
20 m/px crops in pipeline/dem/ are centred on our own coordinates, so running this
against them would be circular.
"""
import json
import os

import numpy as np
import rasterio
from pyproj import CRS, Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
DEM = os.path.join(HERE, "dem")
SPHERE = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")

sites = {s["id"]: s for s in json.load(open(os.path.join(HERE, "sites.json")))["sites"]}

# PGDA site id -> our site id
PAIRS = [("Site01", "connecting-ridge"), ("Site04", "shackleton-rim"), ("Site06", "nobile-rim-1"),
         ("Site07", "peak-near-shackleton"), ("Site11", "de-gerlache-rim")]

print(f"{'PGDA':7s} {'our id':22s} {'ours lat/lon':>26s} {'DEM-centre lat/lon':>26s} {'dlat_m':>8s} {'dlon_m':>8s} {'dist_m':>8s}")
print("-" * 112)

for pgda, ours in PAIRS:
    path = os.path.join(DEM, f"{ours}.tif")
    if not os.path.exists(path):
        print(f"{pgda:7s} {ours:22s}   no DEM")
        continue
    ds = rasterio.open(path)
    inv = Transformer.from_crs(ds.crs, SPHERE, always_xy=True)
    b = ds.bounds
    cx, cy = (b.left + b.right) / 2, (b.bottom + b.top) / 2
    clon, clat = inv.transform(cx, cy)

    s = sites[ours]
    lon = s["lon"] % 360
    if lon > 180:
        lon -= 360

    # ground distance between the two points on the lunar sphere
    R = 1737400.0
    la1, lo1 = np.radians(clat), np.radians(clon)
    la2, lo2 = np.radians(s["lat"]), np.radians(lon)
    d = R * np.arccos(np.clip(np.sin(la1) * np.sin(la2) + np.cos(la1) * np.cos(la2) * np.cos(lo1 - lo2), -1, 1))
    dlat = R * np.radians(s["lat"] - clat)
    dlon = R * np.radians(((lon - clon + 180) % 360) - 180) * np.cos(la1)

    print(f"{pgda:7s} {ours:22s} {s['lat']:11.4f},{s['lon']:9.3f} {clat:11.4f},{clon % 360:9.3f} "
          f"{dlat:8.1f} {dlon:8.1f} {d:8.1f}")
    ds.close()
