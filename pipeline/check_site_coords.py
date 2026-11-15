"""Check every site's coordinate against its DEM: does it land inside the raster, and is it
on plausible terrain (a ridge / high ground, not a crater floor or a nodata hole)?"""
import json
import os

import numpy as np
import rasterio
from pyproj import CRS, Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
DEM = os.path.join(HERE, "dem")
SPHERE = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")

sites = json.load(open(os.path.join(HERE, "sites.json")))["sites"]

print(f"{'id':24s} {'lat':>10s} {'lon':>9s} {'inside':>7s} {'z_site':>9s} {'z_p50':>8s} {'z_p95':>8s} {'pctile':>7s} {'note'}")
print("-" * 120)

for s in sites:
    path = os.path.join(DEM, f"{s['id']}.tif")
    if not os.path.exists(path):
        print(f"{s['id']:24s} {s['lat']:10.4f} {s['lon']:9.3f}    no DEM file")
        continue
    ds = rasterio.open(path)
    a = ds.read(1).astype("float64")
    fwd = Transformer.from_crs(SPHERE, ds.crs, always_xy=True)
    lon = s["lon"] % 360
    if lon > 180:
        lon -= 360
    x, y = fwd.transform(lon, s["lat"])
    b = ds.bounds
    inside = (b.left <= x <= b.right) and (b.bottom <= y <= b.top)
    if inside:
        row, col = ds.index(x, y)
        row = min(max(row, 0), ds.shape[0] - 1)
        col = min(max(col, 0), ds.shape[1] - 1)
        z = float(a[row, col])
    else:
        z = float("nan")
    finite = a[np.isfinite(a)]
    z50 = float(np.percentile(finite, 50))
    z95 = float(np.percentile(finite, 95))
    pctile = float((finite < z).mean() * 100) if inside else float("nan")
    note = ""
    if inside:
        if z >= z95:
            note = "on high ground (ridge-like)"
        elif z <= z50:
            note = "at/below median (low ground?)"
    print(f"{s['id']:24s} {s['lat']:10.4f} {s['lon']:9.3f} {str(inside):>7s} {z:9.1f} {z50:8.1f} {z95:8.1f} {pctile:7.1f} {note}")
    ds.close()
