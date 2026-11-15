"""North-up view of the DEM around a site, plus a radial terrain profile along an azimuth.
Prints numbers so the terrain can be judged by eye."""
import os
import sys

import numpy as np
import rasterio
from pyproj import CRS, Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from horizon_dem import _bilinear, _destination, R_M

DEM = os.path.join(HERE, "dem")
SPHERE = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")
SITES = {"connecting-ridge": (-89.4632, 222.510), "shackleton-rim": (-89.7668, 188.130),
         "peak-near-shackleton": (-88.8110, 123.690), "de-gerlache-rim": (-88.6834, 292.070)}


def load(sid, lat, lon):
    if lon > 180:
        lon -= 360
    ds = rasterio.open(os.path.join(DEM, f"{sid}.tif"))
    dem = ds.read(1).astype("float64")
    inv = ~ds.transform
    to_dem = Transformer.from_crs(SPHERE, ds.crs, always_xy=True)
    return ds, dem, inv, to_dem, lat, lon


def profile(dem, inv, to_dem, lat, lon, az, dists):
    A, D = np.meshgrid(np.array([az]), np.array(dists), indexing="ij")
    la, lo = _destination(lat, lon, A, D)
    x, y = to_dem.transform(lo, la)
    cols, rows = inv * (x, y)
    z = _bilinear(dem, rows - 0.5, cols - 0.5)
    return z[0]


for sid, (lat, lon) in SITES.items():
    ds, dem, inv, to_dem, lat, lon = load(sid, lat, lon)
    px = abs(ds.transform.a)
    x0, y0 = to_dem.transform(lon, lat)
    c0, r0 = inv * (x0, y0)
    z0 = float(_bilinear(dem, np.array([r0 - 0.5]), np.array([c0 - 0.5])).ravel()[0])

    # local east/north basis in DEM x/y
    d = 0.05
    xe, ye = to_dem.transform(lon + d, lat)
    xn, yn = to_dem.transform(lon, lat + d)
    east = np.array([xe - x0, ye - y0])
    north = np.array([xn - x0, yn - y0])
    east /= np.linalg.norm(east)
    north /= np.linalg.norm(north)

    print(f"=== {sid}   site z0={z0:.1f} m   DEM {ds.shape} @{px} m")
    print("    north-up heightmap, 2 km E-W x 1.5 km N-S, 10 m/char E-W, 50 m/row N-S")
    span_e, span_n = 2000.0, 1500.0
    nx, ny = 81, 31
    ee = np.linspace(-span_e, span_e, nx)
    nn = np.linspace(span_n, -span_n, ny)
    grid = np.full((ny, nx), np.nan)
    for j, nv in enumerate(nn):
        for i, ev in enumerate(ee):
            p = np.array([x0, y0]) + east * ev + north * nv
            cc, rr = inv * (p[0], p[1])
            grid[j, i] = float(_bilinear(dem, np.array([rr - 0.5]), np.array([cc - 0.5])).ravel()[0])
    fin = grid[np.isfinite(grid)]
    lo, hi = fin.min(), fin.max()
    ramp = " .:-=+*#%@"
    for j in range(ny):
        row = "".join(ramp[int(np.clip((grid[j, i] - lo) / max(hi - lo, 1e-9) * (len(ramp) - 1), 0, len(ramp) - 1))]
                      if np.isfinite(grid[j, i]) else " " for i in range(nx))
        print(f"      {row}")
    print(f"      (centre = site, z={grid[ny//2, nx//2]:.1f} m; map z range {lo:.0f}..{hi:.0f} m)")

    for az in (0, 86, 90, 180, 270):
        dists = np.arange(10.0, 4000.0, 50.0)
        z = profile(dem, inv, to_dem, lat, lon, az, dists)
        # elevation angle of each sample, with observer at z0 + 2 m
        th = dists / R_M
        r1 = R_M + z
        r_obs = R_M + z0 + 2.0
        ang = np.degrees(np.arctan2(r1 * np.cos(th) - r_obs, r1 * np.sin(th)))
        k = int(np.nanargmax(ang))
        def zat(d):
            i = min(int(np.searchsorted(dists, d)), len(dists) - 1)
            return z[i]
        print(f"    az {az:3d}: max elev angle {ang[k]:6.2f} deg at dist {dists[k]:6.0f} m "
              f"(z {z[k]:7.1f} m, z0 {z0:.1f}); z at 0.1/0.5/1/2/4 km = "
              f"{zat(100):.0f}/{zat(500):.0f}/{zat(1000):.0f}/{zat(2000):.0f}/{zat(4000):.0f}")
    ds.close()
    print()
