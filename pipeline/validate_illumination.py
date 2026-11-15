"""Long-term illumination validation.

Published illumination numbers (Mazarico 2011, Speyerer & Robinson 2013, De Rosa 2012) are
18.6-year averages of "fraction of time the Sun is above the local horizon". We reproduce
that metric exactly, from the real DEMs and DE421, and compare.

Window: 1992-01-01 .. 2010-12-31 = one full 18.6 yr nodal cycle.
"""
import os
import sys
from datetime import datetime, timezone

import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import CRS, Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from horizon_dem import _bilinear, _destination, R_M
from ephemeris import moon_frame_vectors

os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
os.environ["GDAL_HTTP_TIMEOUT"] = "120"
SPHERE = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")
MOSAIC = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"

dem = rasterio.open(MOSAIC)
fwd = Transformer.from_crs(SPHERE, dem.crs, always_xy=True)

T0 = datetime(1992, 1, 1, tzinfo=timezone.utc)
HOURS = int((datetime(2010, 12, 31, tzinfo=timezone.utc) - T0).total_seconds() // 3600)
print(f"simulating {HOURS} hourly steps 1992-2010 ...")


def jd(dt):
    return 2440587.5 + dt.timestamp() / 86400.0


jd0 = jd(T0)
jd_arr = jd0 + np.arange(HOURS) / 24.0
sun_v, earth_v = moon_frame_vectors(jd_arr)
print("ephemeris done")


def az_el(v, lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    return (np.degrees(np.arctan2(v @ east, v @ north)) + 360) % 360, np.degrees(np.arcsin(np.clip(v @ up, -1, 1)))


def horizon(lat, lon, half=15000.0, obs_h=2.0, step=20.0):
    x, y = fwd.transform(lon, lat)
    row, col = dem.index(x, y)
    n = int(2 * half / dem.res[0])
    r0 = max(0, min(dem.height - n, row - n // 2))
    c0 = max(0, min(dem.width - n, col - n // 2))
    win = Window(c0, r0, min(dem.width - c0, n), min(dem.height - r0, n))
    a = dem.read(1, window=win)
    tr = dem.window_transform(win)
    inv_t = ~tr
    cx, cy = fwd.transform(lon, lat)
    cc, rr = inv_t * (cx, cy)
    z0 = float(_bilinear(a, np.array([rr - 0.5]), np.array([cc - 0.5])).ravel()[0])
    if not np.isfinite(z0):
        return None, z0
    r_obs = R_M + z0 + obs_h
    dists = np.arange(step, half + step, step)
    A, D = np.meshgrid(np.arange(360), dists, indexing="ij")
    la, lo = _destination(lat, lon, A, D)
    dx, dy = fwd.transform(lo, la)
    cols, rows = inv_t * (dx, dy)
    z = _bilinear(a, rows - 0.5, cols - 0.5)
    th = D / R_M
    r1 = R_M + z
    ang = np.degrees(np.arctan2(r1 * np.cos(th) - r_obs, r1 * np.sin(th)))
    ang = np.where(np.isfinite(ang), ang, -90.0)
    return ang.max(axis=1), z0


def illum(hz, lat, lon, obs_h=2.0):
    sa, se = az_el(sun_v, lat, lon)
    p = sa * len(hz) / 360.0
    i0 = np.floor(p).astype(int) % len(hz)
    i1 = (i0 + 1) % len(hz)
    f = p - np.floor(p)
    h = hz[i0] * (1 - f) + hz[i1] * f
    return 100.0 * ((se + 0.2666) > h).mean()


def sun_percentiles(hz, lat, lon):
    """fraction of time the Sun's DISC CENTRE is above the horizon (Mazarico 'illumination')"""
    sa, se = az_el(sun_v, lat, lon)
    p = sa * len(hz) / 360.0
    i0 = np.floor(p).astype(int) % len(hz)
    i1 = (i0 + 1) % len(hz)
    f = p - np.floor(p)
    h = hz[i0] * (1 - f) + hz[i1] * f
    return 100.0 * (se > h).mean()


CANDS = [
    ("connecting-ridge  ours 222.510", -89.4632, 222.510, "Mazarico pt1: 89.0%"),
    ("connecting-ridge  Mazarico 222.69", -89.45, 222.69, "De Rosa C1: 76.0%"),
    ("connecting-ridge  C2 245.94", -89.3157, 245.94, "De Rosa C2: 75.6%"),
    ("shackleton-rim     ours 188.130", -89.7668, 188.130, "Shackleton S: 81-86%"),
    ("shackleton-rim     Mazarico 204.27", -89.78, 204.27, "Mazarico pt4: 86.7%"),
    ("shackleton-rim     Speyerer 201.2", -89.740, 201.2, "Speyerer: 71.6%"),
    ("peak-near-shackleton ours 123.690", -88.8110, 123.690, "SV1: 85.5%"),
    ("peak-near-shackleton Mazarico 123.64", -88.81, 123.64, "Mazarico pt7: 85.5%"),
    ("de-gerlache-rim    ours 292.070", -88.6834, 292.070, "GR1: 85.6%"),
    ("de-gerlache-rim    Mazarico 291.90", -88.67, 291.90, "Mazarico pt11: 85.6%"),
    ("nobile-rim-1       ours 37.367", -85.4381, 37.367, "PGDA Site06"),
    ("Leibnitz           pt20 31.73", -85.43, 31.73, "LP1: 82.2%"),
    ("Malapert M1        86.00 1.87", -86.00, 1.87, "MP2: 80.5%"),
    ("Malapert M2        85.97 357.70", -85.97, 357.70, "MP1: 81.8%"),
    ("im2-athena         84.7906 29.196", -84.7906, 29.196, "IM-2"),
    ("im1-odysseus       80.1300 1.440", -80.1300, 1.440, "IM-1"),
]

# The coordinates the app actually ships (pipeline/sites.json), so the numbers quoted in
# the README for the chosen points can be reproduced with this script.
import json
PUBLISHED = {"connecting-ridge": "Mazarico pt1: 89.0%", "shackleton-rim": "Mazarico pt4: 86.7% / Speyerer 71.6%",
             "peak-near-shackleton": "Mazarico pt7: 85.5%", "de-gerlache-rim": "Mazarico pt11: 85.6%"}
for s in json.load(open(os.path.join(HERE, "sites.json")))["sites"]:
    if s["id"] in PUBLISHED:
        CANDS.append((f"{s['id']:20s} CURRENT {s['lon']:.2f}", s["lat"], s["lon"], PUBLISHED[s["id"]]))

print(f"\n{'candidate':36s} {'z0':>8s} {'hz max':>7s} {'illum%':>7s} {'vis%':>7s}  published")
print("-" * 100)
for name, la, lo, pub in CANDS:
    hz, z0 = horizon(la, lo)
    if hz is None:
        print(f"{name:36s} {z0:8.1f}   NO DATA")
        continue
    print(f"{name:36s} {z0:8.1f} {hz.max():7.2f} {illum(hz, la, lo):7.1f} "
          f"{sun_percentiles(hz, la, lo):7.1f}  {pub}")
dem.close()
