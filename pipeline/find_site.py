"""Scan observers around a feature on the real DEM, rank by 18.6-yr illumination.

Used to (a) place a site on the true local illumination maximum and (b) confirm the
longitude convention by checking our answer against the published value.

Caches the 1992-2010 ephemeris so repeated scans are fast.
"""
import argparse
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

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "120")
SPHERE = CRS.from_proj4(f"+proj=longlat +R={R_M} +no_defs")
MOSAIC = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"
CACHE = os.path.join(HERE, ".eph_1992_2010.npy")


def get_eph():
    if os.path.exists(CACHE):
        return np.load(CACHE)
    t0 = datetime(1992, 1, 1, tzinfo=timezone.utc)
    days = int((datetime(2010, 12, 31, tzinfo=timezone.utc) - t0).total_seconds() // 86400)
    jd = 2440587.5 + t0.timestamp() / 86400.0 + np.arange(days * 24) / 24.0
    sun, _ = moon_frame_vectors(jd)
    np.save(CACHE, sun)
    return sun


def az_el(v, lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    return (np.degrees(np.arctan2(v @ east, v @ north)) + 360) % 360, np.degrees(np.arcsin(np.clip(v @ up, -1, 1)))


def illum(hz, lat, lon, sun, disc=True):
    sa, se = az_el(sun, lat, lon)
    p = sa * len(hz) / 360.0
    i0 = np.floor(p).astype(int) % len(hz)
    i1 = (i0 + 1) % len(hz)
    f = p - np.floor(p)
    h = hz[i0] * (1 - f) + hz[i1] * f
    margin = se + (0.2666 if disc else 0.0) - h
    return 100.0 * (margin > 0).mean(), 100.0 * (margin <= 0).astype(np.int8).max() * 0


def horizon_at(dem, tr, to_dem, lat, lon, half=15000.0, obs_h=2.0, step=20.0, n_az=360):
    inv = ~tr
    cx, cy = to_dem.transform(lon, lat)
    cc, rr = inv * (cx, cy)
    z0 = float(_bilinear(dem, np.array([rr - 0.5]), np.array([cc - 0.5]))[0])
    if not np.isfinite(z0):
        return None, None
    r_obs = R_M + z0 + obs_h
    dists = np.arange(step, half + step, step)
    A, D = np.meshgrid(np.arange(n_az) * 360.0 / n_az, dists, indexing="ij")
    la, lo = _destination(lat, lon, A, D)
    dx, dy = to_dem.transform(lo, la)
    cols, rows = inv * (dx, dy)
    z = _bilinear(dem, rows - 0.5, cols - 0.5)
    th = D / R_M
    r1 = R_M + z
    ang = np.degrees(np.arctan2(r1 * np.cos(th) - r_obs, r1 * np.sin(th)))
    ang = np.where(np.isfinite(ang), ang, -90.0)
    return ang.max(axis=1), z0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True)
    ap.add_argument("--radius-km", type=float, default=8.0, help="half-size of the DEM window to load")
    ap.add_argument("--ring-km", type=float, nargs="*", default=[], help="scan this distance from the given point")
    ap.add_argument("--n", type=int, default=48, help="ring samples")
    ap.add_argument("--points", nargs="*", default=[], help="lat,lon pairs to test")
    args = ap.parse_args()

    sun = get_eph()
    src = rasterio.open(MOSAIC)
    to_dem = Transformer.from_crs(SPHERE, src.crs, always_xy=True)
    x, y = to_dem.transform(args.lon, args.lat)
    half = int(args.radius_km * 1000 / src.res[0])
    row, col = src.index(float(x), float(y))
    c0, r0 = max(0, col - half), max(0, row - half)
    w = Window(c0, r0, 2 * half + 1, 2 * half + 1)
    dem = src.read(1, window=w).astype("float64")
    if src.nodata is not None:
        dem[dem == src.nodata] = np.nan
    tr = src.window_transform(w)
    src.close()

    hz, z0 = horizon_at(dem, tr, to_dem, args.lat, args.lon)
    v, _ = illum(hz, args.lat, args.lon, sun)
    print(f"centre ({args.lat:.4f},{args.lon:.3f})  z0={z0:.1f}  hzmax={hz.max():.2f}  illum={v:.1f}%")

    for p in args.points:
        la, lo = (float(t) for t in p.split(","))
        hz, z0 = horizon_at(dem, tr, to_dem, la, lo)
        if hz is None:
            print(f"  ({la:.4f},{lo:.3f})  nodata")
            continue
        v, _ = illum(hz, la, lo, sun)
        print(f"  ({la:.4f},{lo:.3f})  z0={z0:8.1f}  hzmax={hz.max():6.2f}  illum={v:5.1f}%")

    for rk in args.ring_km:
        best = []
        for k in range(args.n):
            az = 360.0 * k / args.n
            la, lo = _destination(args.lat, args.lon, az, rk * 1000)
            hz, z0 = horizon_at(dem, tr, to_dem, float(la), float(lo))
            if hz is None:
                continue
            v, _ = illum(hz, float(la), float(lo), sun)
            best.append((v, float(la), float(lo), z0))
        best.sort(reverse=True)
        print(f"\nring r={rk:g} km, {len(best)} valid, top 6:")
        for v, la, lo, z0 in best[:6]:
            print(f"  illum={v:5.1f}%  lat={la:9.5f}  lon={lo:8.3f}  z0={z0:8.1f}")


if __name__ == "__main__":
    main()
