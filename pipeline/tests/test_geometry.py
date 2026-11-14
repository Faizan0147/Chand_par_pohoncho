"""
Run:  python pipeline/tests/test_geometry.py
Checks that can be done OFFLINE (no NAIF / Horizons access needed).
"""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np
from ephemeris import (moon_frame_vectors, icrf_to_pa, utc_to_tdb_jd, eph, sub_point_deg, az_el)

failures = []
def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    if not ok: failures.append(name)

# 1. Moon's pole at J2000 vs the IAU rotation model (alpha0 = 269.9949 - 3.8787 sin E1 ...,
#    delta0 = 66.5392 + 1.5419 cos E1 ... with E1 = 125.045 deg at J2000)
M = icrf_to_pa(utc_to_tdb_jd(np.array([2451545.0])))[0]
p = M.T @ np.array([0, 0, 1.0])
ra, dec = np.degrees(np.arctan2(p[1], p[0])) % 360, np.degrees(np.arcsin(p[2]))
E1 = np.radians(125.045)
ra_iau = 269.9949 - 3.8787 * np.sin(E1); dec_iau = 66.5392 + 1.5419 * np.cos(E1)
check("pole direction matches IAU model", abs(ra - ra_iau) < 0.3 and abs(dec - dec_iau) < 0.3,
      f"ours RA {ra:.2f} Dec {dec:.2f}; IAU(E1 term only) {ra_iau:.2f} {dec_iau:.2f}")

# 2. The long-run mean sub-Earth point must sit at (0,0) in the ME frame (that is its definition)
jd = np.arange(2447893.5, 2462502.5, 0.25)                      # 1990-2030
_, earth = moon_frame_vectors(jd)
u = earth / np.linalg.norm(earth, axis=1, keepdims=True)
m = u.mean(0); m /= np.linalg.norm(m)
lon, lat = sub_point_deg(m)
check("mean Earth direction at (0,0) in ME", abs(lon) < 0.01 and abs(lat) < 0.01,
      f'lon {lon*3600:+.1f}" lat {lat*3600:+.1f}"')

# 3. Libration extremes
lo, la = sub_point_deg(earth)
check("libration longitude within +-8.5", abs(lo).max() < 8.5 and abs(lo).max() > 7.5, f"max {abs(lo).max():.2f}")
check("libration latitude within +-7.2", abs(la).max() < 7.2 and abs(la).max() > 6.2, f"max {abs(la).max():.2f}")

# 4. Meeus, Astronomical Algorithms ex. 53.a (1992-04-12 0h TD), optical libration l'=-1.206 b'=+4.194
#    (recalled from the book; DE421 also contains physical libration, so allow 0.05 deg)
j = np.array([2448724.5 - (37.0 + 32.184) / 86400.0])            # so that TDB = JD 2448724.5 exactly
_, e = moon_frame_vectors(j)
l, b = sub_point_deg(e)
check("Meeus example 53.a within 0.05 deg", abs(l[0] + 1.206) < 0.05 and abs(b[0] - 4.194) < 0.05,
      f"ours {l[0]:+.3f} {b[0]:+.3f}")

# 5. South-pole geometry: Sun within +-1.6 deg (obliquity 1.54), Earth up about half the time
jdw = np.arange(2461346.5, 2461346.5 + 400, 1 / 24)
sun, earth = moon_frame_vectors(jdw)
_, el_s, up = az_el(sun, -89.9999, 0.0)
eu = earth - 1737.4 * up; eu /= np.linalg.norm(eu, axis=1, keepdims=True)
_, el_e, _ = az_el(eu, -89.9999, 0.0)
check("Sun elevation at pole within +-1.7", abs(el_s).max() < 1.7, f"[{el_s.min():.2f},{el_s.max():.2f}]")
frac = float(np.mean(el_e > 0))
check("Earth above smooth horizon 40-55% of time at pole", 0.40 < frac < 0.55, f"{frac*100:.0f}%")

# 6. DEM ray-marcher on a synthetic DEM: 1000 m Gaussian peak 8 km due north of the site
try:
    import rasterio
    from rasterio.transform import from_origin
    from pyproj import Transformer, Geod
    from horizon_dem import horizon_profile, R_M, SPHERE
    crs = f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +R={R_M} +units=m +no_defs"
    lat0, lon0 = -88.0, 45.0
    t = Transformer.from_crs(SPHERE, crs, always_xy=True)
    x0, y0 = t.transform(lon0, lat0)
    g = Geod(a=R_M, b=R_M)
    plon, plat, _ = g.fwd(lon0, lat0, 0.0, 8000.0)                 # independent destination calc
    px, py = t.transform(plon, plat)
    res, half = 10.0, 12000.0
    xs = np.arange(x0 - half, x0 + half, res) + res / 2
    ys = np.arange(y0 + half, y0 - half, -res) - res / 2
    X, Y = np.meshgrid(xs, ys)
    dem = 1000.0 * np.exp(-(((X - px) ** 2 + (Y - py) ** 2) / 300.0 ** 2))
    with tempfile.TemporaryDirectory() as d:
        fn = os.path.join(d, "t.tif")
        with rasterio.open(fn, "w", driver="GTiff", height=dem.shape[0], width=dem.shape[1], count=1,
                           dtype="float32", crs=crs, transform=from_origin(xs[0] - res / 2, ys[0] + res / 2, res, res)) as dst:
            dst.write(dem.astype("float32"), 1)
        mask = horizon_profile(fn, lat0, lon0, observer_height_m=2.0, n_az=360, max_dist_m=11000.0)
    expect_peak = np.degrees(np.arctan((1000 - 8000 ** 2 / (2 * R_M)) / 8000.0))
    check("DEM horizon: peak due north (az 0) height", abs(mask[0] - expect_peak) < 0.35,
          f"got {mask[0]:.2f} deg, expected ~{expect_peak:.2f}")
    check("DEM horizon: peak is in the north (not elsewhere)", int(np.argmax(mask)) in (358, 359, 0, 1, 2),
          f"argmax az={int(np.argmax(mask))}")
    check("DEM horizon: flat side sits at the curvature dip (~ -0.086)", abs(mask[180] + 0.086) < 0.03,
          f"got {mask[180]:.3f}")
except ImportError as ex:
    print("SKIP DEM test (rasterio/pyproj missing):", ex)

print("\nALL PASSED" if not failures else f"\n{len(failures)} FAILED: {failures}")
sys.exit(1 if failures else 0)
