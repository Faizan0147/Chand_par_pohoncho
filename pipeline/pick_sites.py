"""Pick + validate site coordinates using the real DEM and the app's own ephemeris.

For each candidate (lat, lon):
  1. crop a 30 km window from the PGDA 20 m/px 80-90S mosaic (or use the 5 m/px site tile)
  2. ray-march the terrain horizon (same maths as pipeline/horizon_dem.py)
  3. compute sunlit % over the app's ephemeris span with the app's disc rule
     (visible when sun_elevation + 0.2666 deg > terrain horizon)
  4. report: z at site, horizon range, sunlit %, longest dark spell

Published reference (Mazarico 2011 / Speyerer 2013 / Noda 2008), 18.6-yr average illumination:
  Connecting Ridge C1 89.0% | Shackleton rim 86.7% | de Gerlache rim 85.6% | Peak near Shackleton 85.5%
"""
import json
import os
import sys
import tempfile

import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import CRS, Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from horizon_dem import _bilinear, _destination, R_M

MOSAIC = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"
SPHERE = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")

os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
os.environ["GDAL_HTTP_TIMEOUT"] = "120"

mos = rasterio.open(MOSAIC)
fwd = Transformer.from_crs(SPHERE, mos.crs, always_xy=True)
inv = Transformer.from_crs(mos.crs, SPHERE, always_xy=True)

# --- ephemeris (app's own, from public/data/ephemeris.json) ---
raw = json.load(open(os.path.join(HERE, "..", "public", "data", "ephemeris.json")))
n, step = raw["n"], raw["stepHours"]
sun = np.array(raw["sunE5"], dtype=float).reshape(n, 3) / 1e5
t0 = raw["t0"]


def az_el(v, lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    x = v @ east
    y = v @ north
    z = v @ up
    return (np.degrees(np.arctan2(x, y)) + 360) % 360, np.degrees(np.arcsin(np.clip(z, -1, 1)))


def horizon_from_dem(dem, transform, lat, lon, n_az=360, max_dist=15000.0, obs_h=2.0):
    inv_t = ~transform
    x0, y0 = fwd.transform(lon, lat)
    c0, r0 = inv_t * (x0, y0)
    z0 = float(_bilinear(dem, np.array([r0 - 0.5]), np.array([c0 - 0.5])).ravel()[0])
    if not np.isfinite(z0):
        return None, z0
    r_obs = R_M + z0 + obs_h
    px = abs(transform.a)
    step_m = max(px, 20.0)
    dists = np.arange(step_m, max_dist + step_m, step_m)
    azs = np.arange(n_az) * 360.0 / n_az
    A, D = np.meshgrid(azs, dists, indexing="ij")
    la, lo = _destination(lat, lon, A, D)
    x, y = fwd.transform(lo, la)
    cols, rows = inv_t * (x, y)
    z = _bilinear(dem, rows - 0.5, cols - 0.5)
    theta = D / R_M
    r1 = R_M + z
    ang = np.degrees(np.arctan2(r1 * np.cos(theta) - r_obs, r1 * np.sin(theta)))
    ang = np.where(np.isfinite(ang), ang, -90.0)
    return ang.max(axis=1), z0


def sunlit_pct(hz, lat, lon):
    sa, se = az_el(sun, lat, lon)
    az = sa
    p = az * len(hz) / 360.0
    i0 = np.floor(p).astype(int) % len(hz)
    i1 = (i0 + 1) % len(hz)
    f = p - np.floor(p)
    mask = hz[i0] * (1 - f) + hz[i1] * f
    lit = (se + 0.2666) > mask
    # longest dark run in hours
    best = cur = 0
    for v in lit:
        cur = 0 if v else cur + 1
        best = max(best, cur)
    return 100.0 * lit.mean(), best * step


def crop(lat, lon, half=15000.0):
    x, y = fwd.transform(lon, lat)
    row, col = mos.index(x, y)
    n20 = int(2 * half / mos.res[0])
    r0 = max(0, min(mos.height - n20, row - n20 // 2))
    c0 = max(0, min(mos.width - n20, col - n20 // 2))
    w = min(mos.width - c0, n20)
    h = min(mos.height - r0, n20)
    win = Window(c0, r0, w, h)
    a = mos.read(1, window=win)
    tr = mos.window_transform(win)
    return a, tr


def evaluate(name, lat, lon, label=""):
    a, tr = crop(lat, lon)
    hz, z0 = horizon_from_dem(a, tr, lat, lon)
    if hz is None:
        print(f"{name:34s} lat={lat:9.4f} lon={lon:8.3f}  NO DATA at site")
        return None
    pct, dark = sunlit_pct(hz, lat, lon)
    print(f"{name:34s} lat={lat:9.4f} lon={lon:8.3f} {label:12s} z0={z0:8.1f} "
          f"hz[min {hz.min():6.2f} max {hz.max():5.2f}] sunlit {pct:5.1f}%  longest dark {dark:6.0f} h")
    return pct, hz, z0


print("=== current sites.json coordinates ===")
sites = json.load(open(os.path.join(HERE, "sites.json")))["sites"]
for s in sites:
    evaluate(s["id"], s["lat"], s["lon"], "current")

print("\n=== published Shackleton-rim candidates ===")
for lab, la, lo in [("Mazarico pt4", -89.78, 204.27),
                     ("Speyerer2013", -89.740, 201.2),
                     ("Noda/Bussey SR1", -89.80, 207.5),
                     ("Noda SV1", -88.81, 123.64)]:
    evaluate("shackleton-cand " + lab, la, lo, lab)

print("\n=== other published candidates ===")
for lab, la, lo in [("CR C1 Mazarico", -89.45, 222.69),
                     ("CR C2", -89.3157, 245.94),
                     ("deGerlache pt11", -88.67, 291.90),
                     ("peakShackleton pt7", -88.81, 123.64),
                     ("Malapert M2", -85.97, 357.70),
                     ("Malapert M1", -86.00, 1.87),
                     ("Leibnitz pt20", -85.43, 31.73),
                     ("IM2 Athena", -84.7906, 29.196),
                     ("IM1 Odysseus", -80.1300, 1.440)]:
    evaluate("cand " + lab, la, lo, lab)
mos.close()
