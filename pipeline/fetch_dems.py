"""
Build one DEM per site in pipeline/sites.json: pipeline/dem/<site-id>.tif

Primary source (20 m/px, covers 80-90 S):
  PGDA / MIT LOLA 80-90 S DEM, adjusted to the LOLA reference sphere
  https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF
  Barker et al. 2021, Planet. Space Sci. 203, 105119; Smith et al. 2010, GRL 37, L18204.

Fallback for sites whose +/- RADIUS box leaves that product (IM-1 at 80.13 S sits 4 km
inside its northern edge):
  USGS LOLA global DEM, 118 m/px, SimpleCylindrical, int16 at 0.5 m/DN
  https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif
  The fallback crop is reprojected onto the same south-polar stereographic grid, so the
  horizon code needs no special case. (Both products agree to the metre: e.g. at
  -88.811, 123.69 the mosaic reads 1645.5 m and the global DEM 3293 DN x 0.5 = 1646.5 m.)

Each file is a square crop centred on the site, +/- RADIUS_KM (default 16 km, which leaves
1 km of margin around the 15 km horizon march), in the primary product's own frame
(south polar stereographic, MOON_ME, R = 1737400 m).

Why not the PGDA 5 m/px site tiles? They are 16x16 km (+/-8 km), so a 15 km horizon march
runs off the edge. They were cross-checked against the primary mosaic first: zero pixel
shift, 1.7-2.7 m rms height agreement, i.e. the same frame to within the DEM noise.

Usage:
  python pipeline/fetch_dems.py                 # all sites, 16 km
  python pipeline/fetch_dems.py --radius-km 12
  python pipeline/fetch_dems.py --site connecting-ridge
"""
import argparse
import json
import os
import sys

import numpy as np
import rasterio
from affine import Affine
from pyproj import CRS, Transformer
from rasterio.enums import Resampling
from rasterio.windows import Window
from rasterio.warp import reproject

HERE = os.path.dirname(os.path.abspath(__file__))
R_M = 1_737_400.0
SPHERE = CRS.from_proj4(f"+proj=longlat +R={R_M} +no_defs")
PRIMARY = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"
FALLBACK = "https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif"
CITATION = ("Barker et al. 2021, Planet. Space Sci. 203, 105119; "
            "Smith et al. 2010, GRL 37, L18204")


def crop_primary(src, lat, lon, half_px, to_src):
    x, y = to_src.transform(lon, lat)
    row, col = src.index(float(x), float(y))
    n = 2 * half_px + 1
    c0, r0 = col - half_px, row - half_px
    if c0 < 0 or r0 < 0 or c0 + n > src.width or r0 + n > src.height:
        return None
    win = Window(c0, r0, n, n)
    a = src.read(1, window=win).astype("float32")
    if src.nodata is not None:
        a[a == src.nodata] = np.nan
    if not np.isfinite(a[half_px, half_px]):
        return None
    return a, src.window_transform(win), abs(src.res[0])


def crop_fallback(gpath, lat, lon, dst_crs, radius_m):
    """Read a lat/lon window from the global DEM and reproject it to dst_crs."""
    with rasterio.open(gpath) as g:
        scale = g.scales[0] if g.scales and g.scales[0] else 1.0
        nod = g.nodata
        to_src = Transformer.from_crs(SPHERE, g.crs, always_xy=True)
        to_dst = Transformer.from_crs(SPHERE, dst_crs, always_xy=True)

        phi = radius_m / R_M
        dlat = np.degrees(phi) * 1.05
        lat_lo, lat_hi = lat - dlat, lat + dlat
        dlon = np.degrees(phi) / max(np.cos(np.radians(max(abs(lat_lo), abs(lat_hi)))), 1e-3) * 1.08
        lons = lon + np.linspace(-dlon, dlon, 17)
        lats = np.linspace(lat_lo, lat_hi, 9)
        if lons.min() < -180 or lons.max() > 180:
            raise ValueError("fallback window crosses the +/-180 meridian; not supported")
        px_lon = np.concatenate([lons, lons, np.full_like(lats, lon - dlon), np.full_like(lats, lon + dlon)])
        px_lat = np.concatenate([np.full_like(lons, lat_lo), np.full_like(lons, lat_hi), lats, lats])
        xs, ys = to_src.transform(px_lon, px_lat)
        inv = ~g.transform
        cols, rows = inv * (xs, ys)
        r0 = max(0, int(np.floor(np.min(rows))) - 2)
        r1 = min(g.height, int(np.ceil(np.max(rows))) + 3)
        c0 = max(0, int(np.floor(np.min(cols))) - 2)
        c1 = min(g.width, int(np.ceil(np.max(cols))) + 3)
        win = Window(c0, r0, c1 - c0, r1 - r0)
        a = g.read(1, window=win).astype("float64") * scale
        if nod is not None:
            a[np.isclose(a, nod * scale)] = np.nan
        src_t = g.window_transform(win)

        res = abs(g.res[0])
        n = 2 * int(round(radius_m / res)) + 1
        x0, y0 = to_dst.transform(lon, lat)
        dst_t = (Affine.translation(x0 - (n // 2 + 0.5) * res, y0 + (n // 2 + 0.5) * res)
                 * Affine.scale(res, -res))
        dst = np.full((n, n), np.nan, "float64")
        reproject(source=a, destination=dst,
                  src_transform=src_t, src_crs=g.crs, src_nodata=np.nan,
                  dst_transform=dst_t, dst_crs=dst_crs, dst_nodata=np.nan,
                  resampling=Resampling.bilinear)
        return dst, dst_t, res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sites", default=os.path.join(HERE, "sites.json"))
    ap.add_argument("--out-dir", default=os.path.join(HERE, "dem"))
    ap.add_argument("--radius-km", type=float, default=16.0,
                    help="half-size of the crop; 16 km leaves margin for the 15 km horizon march")
    ap.add_argument("--site", action="append")
    ap.add_argument("--source", default=PRIMARY)
    ap.add_argument("--fallback-source", default=FALLBACK, help="used when the primary box leaves the mosaic")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    os.environ.setdefault("GDAL_HTTP_TIMEOUT", "180")
    os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")

    sites = json.load(open(args.sites))["sites"]
    if args.site:
        sites = [s for s in sites if s["id"] in args.site]

    with rasterio.open(args.source) as src:
        print(f"primary: {src.height}x{src.width} @ {src.res[0]:g} m/px  "
              f"{src.dtypes[0]}  nodata={src.nodata}")
        to_src = Transformer.from_crs(SPHERE, src.crs, always_xy=True)
        half_px = int(round(args.radius_km * 1000.0 / src.res[0]))

        for s in sites:
            got = crop_primary(src, s["lat"], s["lon"], half_px, to_src)
            provenance = args.source
            if got is None:
                print(f"  {s['id']:24s} outside +/-{args.radius_km:g} km of the primary mosaic "
                      f"-> global fallback")
                got = crop_fallback(args.fallback_source, s["lat"], s["lon"], src.crs,
                                    args.radius_km * 1000.0)
                provenance = args.fallback_source
            if got is None:
                print(f"  {s['id']:24s} SKIP: no data")
                continue
            a, transform, res = got
            h, w = a.shape
            if not np.isfinite(a[h // 2, w // 2]):
                print(f"  {s['id']:24s} SKIP: site pixel is nodata")
                continue
            prof = {
                "driver": "GTiff", "width": w, "height": h, "count": 1,
                "dtype": "float32", "crs": src.crs, "transform": transform,
                "nodata": float("nan"), "compress": "deflate", "predictor": 3,
                "tiled": True, "blockxsize": 256, "blockysize": 256,
            }
            path = os.path.join(args.out_dir, f"{s['id']}.tif")
            with rasterio.open(path, "w", **prof) as dst:
                dst.write(a.astype("float32"), 1)
                dst.update_tags(
                    TITLE=f"LOLA DEM around {s['name']} (+/-{args.radius_km:g} km)",
                    SITE_ID=s["id"], SOURCE=provenance, CITATION=CITATION,
                    RESOLUTION_M=f"{res:g}",
                    FRAME="south polar stereographic, MOON_ME, R=1737400 m",
                    SITE_LAT=f"{s['lat']:.6f}", SITE_LON=f"{s['lon']:.6f}",
                )
            z0 = float(a[h // 2, w // 2])
            mb = os.path.getsize(path) / 1e6
            print(f"  {s['id']:24s} {w}x{h} @ {res:g} m  z0={z0:8.1f} m  "
                  f"[{np.nanmin(a):7.1f},{np.nanmax(a):7.1f}]  {mb:.1f} MB")

    print(f"\nwrote to {args.out_dir}")


if __name__ == "__main__":
    main()
