"""Why does a site's horizon reach 32 deg? For each azimuth find the distance and heights
that produced the maximum, and report the local slope around the observer."""
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
SITES = ["connecting-ridge", "shackleton-rim", "nobile-rim-1", "peak-near-shackleton", "de-gerlache-rim"]
LATLON = {"connecting-ridge": (-89.4632, 222.510), "shackleton-rim": (-89.7668, 188.130),
          "nobile-rim-1": (-85.4381, 37.367), "peak-near-shackleton": (-88.8110, 123.690),
          "de-gerlache-rim": (-88.6834, 292.070)}

for sid in SITES:
    path = os.path.join(DEM, f"{sid}.tif")
    if not os.path.exists(path):
        continue
    lat, lon = LATLON[sid]
    if lon > 180:
        lon -= 360

    ds = rasterio.open(path)
    dem = ds.read(1).astype("float64")
    inv = ~ds.transform
    to_dem = Transformer.from_crs(SPHERE, ds.crs, always_xy=True)
    x0, y0 = to_dem.transform(lon, lat)
    c0, r0 = inv * (x0, y0)
    z0 = float(_bilinear(dem, np.array([r0 - 0.5]), np.array([c0 - 0.5]))[0])
    r_obs = R_M + z0 + 2.0

    px = abs(ds.transform.a)
    step = px
    max_dist = 15000.0
    dists = np.arange(step, max_dist + step, step)
    azs = np.arange(360) * 360.0 / 360
    A, D = np.meshgrid(azs, dists, indexing="ij")
    la, lo = _destination(lat, lon, A, D)
    x, y = to_dem.transform(lo, la)
    cols, rows = inv * (x, y)
    z = _bilinear(dem, rows - 0.5, cols - 0.5)
    theta = D / R_M
    r1 = R_M + z
    ang = np.degrees(np.arctan2(r1 * np.cos(theta) - r_obs, r1 * np.sin(theta)))
    ang = np.where(np.isfinite(ang), ang, -90.0)

    prof = ang.max(axis=1)
    # how far did the ray actually travel before leaving the DEM?
    valid = np.isfinite(z)
    reach = np.where(valid.any(axis=1), (valid.sum(axis=1) - 1) * step, 0)

    k = int(np.argmax(prof))
    # local slope: height difference over 100 m around the observer
    def zat(dist, az):
        dla, dlo = _destination(lat, lon, np.array([[az]]), np.array([[dist]]))
        dxs, dys = to_dem.transform(dlo, dla)
        cc, rr = inv * (dxs, dys)
        return float(_bilinear(dem, rr - 0.5, cc - 0.5).ravel()[0])

    z100 = np.array([zat(100.0, a) for a in range(0, 360, 30)])
    slope = np.degrees(np.arctan2(z100 - z0, 100.0))

    print(f"=== {sid}  lat={lat} lon={lon}")
    print(f"    DEM {ds.shape} res={px} m  site z0={z0:.1f} m  horizon profile: min={prof.min():.2f} max={prof.max():.2f}")
    print(f"    rays leaving DEM at: median reach {np.median(reach)/1000:.1f} km, min {reach.min()/1000:.1f} km")
    print(f"    max horizon {prof.max():.2f} deg at az={k} deg; z at that point={z[k][np.argmax(ang[k])]:.1f} m, dist={np.argmax(ang[k])*step:.0f} m")
    print(f"    local slope over 100 m: max {slope.max():.1f} deg, min {slope.min():.1f} deg")
    print(f"    horizon at az 0/90/180/270: {prof[0]:.2f} {prof[90]:.2f} {prof[180]:.2f} {prof[270]:.2f}")
    ds.close()
    print()
