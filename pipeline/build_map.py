"""
Shaded-relief map of the lunar south pole for the Sites page (module M4).

    python pipeline/build_map.py                    # uses pipeline/dem/LDEM_*.tif
    python pipeline/build_map.py --dem PATH_OR_URL  # any LOLA polar-stereographic DEM (repeatable)
    python pipeline/build_map.py --placeholder      # no DEM available: write map_meta.json only

Writes public/data/map/region.webp, public/data/map/pole.webp and public/data/map/map_meta.json.

Recommended input (NASA GSFC PGDA, Barker et al. 2023, https://pgda.gsfc.nasa.gov/products/90):
  LDEM_80S_80MPP_ADJ.TIF  (80 m/px, 80-90 S, ~181 MB) saved in pipeline/dem/.
The 20 m/px COG can also be read remotely without downloading it:
  --dem https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF

The map uses the DEM's own CRS (south polar stereographic on the 1737.4 km sphere), so the
browser can place sites with the same formula (src/lib/polarMap.js). map_meta.json carries
the projection parameters plus pyproj-computed check points that the JS tests compare against.

Honesty: with --placeholder no terrain image is written and the app labels the map as a
placeholder. This script never invents terrain.
"""
import argparse
import datetime as dt
import glob
import json
import math
import os
import sys
import warnings

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_OUT = os.path.join(ROOT, "public", "data", "map")
DEFAULT_DEM_GLOBS = [os.path.join(HERE, "dem", "LDEM_*" + ext) for ext in (".tif", ".TIF", ".tiff", ".TIFF")]
SITE_FILES = [os.path.join(ROOT, "public", "data", "sites.json"), os.path.join(HERE, "sites.json")]

# Projection of the PGDA LOLA polar products (used only for --placeholder; a real build reads the DEM's CRS).
LOLA_SOUTH_STEREO = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
MAX_IMAGE_BYTES = 500 * 1024
HILLSHADE = {"azimuth_deg": 315.0, "altitude_deg": 40.0, "z_factor": 2.0}

DATA_CITATION = ("Barker, M. K., et al. (2023), A New View of the Lunar South Pole from the Lunar Orbiter "
                 "Laser Altimeter (LOLA), Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1. "
                 "Data: NASA GSFC PGDA, doi:10.60903/gsfcpgda-lola-spole")


# ----------------------------------------------------------------------------- projection
def _crs(crs_like):
    from pyproj import CRS
    return CRS.from_user_input(crs_like)


def _to_xy(crs):
    """Transformer lon/lat (on the CRS's own sphere) -> projected metres."""
    from pyproj import Transformer
    return Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)


def proj_params(crs_like):
    """Parameters for the closed-form south polar stereographic formula used in the browser.

    rho = 2 R k0 tan(pi/4 + lat/2);  x = x0 + rho sin(lon - lon0);  y = y0 + rho cos(lon - lon0)
    Derived numerically from pyproj and then verified, so an unexpected CRS fails loudly
    instead of producing a silently misplaced map.
    """
    crs = _crs(crs_like)
    ell = crs.ellipsoid
    if ell is None or abs(ell.semi_major_metre - ell.semi_minor_metre) > 1e-3:
        raise ValueError(f"DEM CRS is not on a sphere: {crs.to_string()}")
    R = float(ell.semi_major_metre)
    t = _to_xy(crs)
    x0, y0 = t.transform(0.0, -90.0)
    # lon0: the meridian that points straight up (+y) from the pole
    xa, ya = t.transform(0.0, -89.0)
    lon0 = -math.degrees(math.atan2(xa - x0, ya - y0))
    lat = -89.0
    rho = math.hypot(xa - x0, ya - y0)
    k0 = rho / (2 * R * math.tan(math.pi / 4 + math.radians(lat) / 2))
    p = {"R": R, "k0": k0, "lon0": round(lon0, 9) % 360.0, "x0": x0, "y0": y0}
    # verify on a spread of points
    for la in (-89.99, -88.0, -85.0, -80.0, -75.0):
        for lo in (0.0, 37.0, 90.0, 181.5, 300.0):
            ex, ey = t.transform(lo, la)
            fx, fy = project_formula(la, lo, p)
            if math.hypot(ex - fx, ey - fy) > 0.01:
                raise ValueError(f"DEM CRS is not a south polar stereographic projection this app supports: {crs.to_string()}")
    return p


def project_formula(lat, lon, p):
    """The same closed-form formula as src/lib/polarMap.js (kept here so tests can compare)."""
    rho = 2 * p["R"] * p["k0"] * math.tan(math.pi / 4 + math.radians(lat) / 2)
    a = math.radians(lon - p["lon0"])
    return p["x0"] + rho * math.sin(a), p["y0"] + rho * math.cos(a)


def load_sites(paths=SITE_FILES):
    """Union of the app's site list and the pipeline's list (by id, app list first)."""
    seen, out = set(), []
    for path in paths:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for s in json.load(f)["sites"]:
                if s["id"] not in seen:
                    seen.add(s["id"])
                    out.append({"id": s["id"], "name": s.get("name", s["id"]), "lat": float(s["lat"]), "lon": float(s["lon"])})
    return out


# ----------------------------------------------------------------------------- views
def _ceil_to(v, step):
    return math.ceil(v / step) * step


def plan_views(site_xy, px=1024, pole_fraction=0.2):
    """Square views centred on the pole.

    region: big enough for every site (+ margin). pole: a zoom on the sites close to the pole,
    which would overlap at region scale. Returns list of dicts with bounds [left, bottom, right, top].
    """
    if not site_xy:
        raise ValueError("no sites to plan the map around")
    far = max(max(abs(x), abs(y)) for x, y in site_xy)
    half = _ceil_to(far + max(12_000.0, 0.04 * far), 5_000.0)
    views = [{"id": "region", "label": "Whole region", "half_m": half}]
    near = [max(abs(x), abs(y)) for x, y in site_xy if math.hypot(x, y) <= pole_fraction * half]
    if len(near) >= 2:
        views.append({"id": "pole", "label": "Near the pole", "half_m": _ceil_to(max(near) + 6_000.0, 5_000.0)})
    for v in views:
        h = v.pop("half_m")
        v.update(width=px, height=px, bounds=[-h, -h, h, h], m_per_px=2 * h / px)
    return views


# ----------------------------------------------------------------------------- DEM -> view grid
def read_dem_to_view(dem_paths, crs_like, bounds, width, height):
    """Resample one or more DEMs onto a view grid (NaN = no data). Earlier DEMs win; later ones fill gaps.

    Reads only the needed window, decimated close to the target resolution (COG overviews are
    used when present), so remote 20 m/px COGs work without downloading 2.6 GB.
    """
    import rasterio
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject, transform_bounds
    from rasterio.windows import Window, from_bounds as win_from_bounds

    dst_crs = _crs(crs_like)
    dst_tr = from_bounds(*bounds, width, height)
    target_res = (bounds[2] - bounds[0]) / width
    out = np.full((height, width), np.nan, dtype=np.float32)
    used = []
    for path in dem_paths:
        with rasterio.open(path) as src:
            sb = transform_bounds(dst_crs, src.crs, *bounds, densify_pts=21)
            full = Window(0, 0, src.width, src.height)
            try:
                win = win_from_bounds(*sb, transform=src.transform).intersection(full)
            except Exception:  # no overlap
                continue
            win = win.round_offsets().round_lengths()
            if win.width < 2 or win.height < 2:
                continue
            native = abs(src.res[0])
            decim = max(1, int(target_res / 2 / native))
            ow, oh = max(2, math.ceil(win.width / decim)), max(2, math.ceil(win.height / decim))
            arr = src.read(1, window=win, out_shape=(oh, ow), masked=True, resampling=Resampling.average)
            arr = np.ma.filled(arr.astype(np.float32), np.nan)
            arr[~np.isfinite(arr)] = np.nan
            if src.nodata is not None and np.isfinite(src.nodata):
                arr[arr == src.nodata] = np.nan
            src_tr = from_bounds(*src.window_bounds(win), ow, oh)
            tmp = np.full((height, width), np.nan, dtype=np.float32)
            reproject(arr, tmp, src_transform=src_tr, src_crs=src.crs, dst_transform=dst_tr, dst_crs=dst_crs,
                      src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.bilinear)
            gap = np.isnan(out) & np.isfinite(tmp)
            if gap.any():
                out[gap] = tmp[gap]
                used.append({"file": os.path.basename(str(path).split("?")[0]), "native_m_per_px": round(native, 3)})
    return out, used


def height_scale(z):
    """LOLA products are in metres, some older ones in km. Relief of < 30 units over a polar map means km."""
    v = z[np.isfinite(z)]
    if v.size == 0:
        return 1.0, "unknown"
    lo, hi = np.percentile(v, [1, 99])
    return (1000.0, "km") if (hi - lo) < 30 else (1.0, "m")


def hillshade(z, m_per_px, azimuth_deg=315.0, altitude_deg=40.0, z_factor=1.0):
    """Lambertian shading 0..1 with light from `azimuth_deg` measured clockwise from image-up.

    The light direction is a display choice for readability; it is NOT the real Sun.
    NaNs stay NaN.
    """
    zf = np.where(np.isfinite(z), z, np.nanmean(z) if np.isfinite(z).any() else 0.0).astype(np.float64)
    d_row, d_col = np.gradient(zf * z_factor, m_per_px)
    gx, gy = d_col, -d_row                      # X right, Y up (rows grow downwards)
    n = np.stack([-gx, -gy, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=0)
    az, alt = math.radians(azimuth_deg), math.radians(altitude_deg)
    light = np.array([math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)])
    shade = np.clip(np.tensordot(light, n, axes=1), 0.0, 1.0)
    shade[~np.isfinite(z)] = np.nan
    return shade


def to_uint8(shade, nodata_value=8):
    """Map shading to 8-bit grey with a mild contrast stretch; no-data becomes near-black."""
    v = shade[np.isfinite(shade)]
    out = np.full(shade.shape, nodata_value, dtype=np.uint8)
    if v.size:
        lo, hi = np.percentile(v, [0.5, 99.5])
        ok = np.isfinite(shade)
        s = np.clip((shade[ok] - lo) / max(hi - lo, 1e-6), 0, 1) ** 0.9
        out[ok] = (24 + s * 226).astype(np.uint8)
    return out


def write_image(gray, path_noext, max_bytes=MAX_IMAGE_BYTES):
    """Write WebP (smallest) if GDAL has it, else PNG. Lowers quality until the file fits max_bytes."""
    import rasterio
    from rasterio.errors import NotGeoreferencedWarning

    h, w = gray.shape
    rgb = np.stack([gray, gray, gray])
    with rasterio.Env(GDAL_PAM_ENABLED="NO") as env, warnings.catch_warnings():
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        if "WEBP" in env.drivers():
            path = path_noext + ".webp"
            for q in (82, 74, 66, 58, 50, 42):
                with rasterio.open(path, "w", driver="WEBP", width=w, height=h, count=3, dtype="uint8", QUALITY=q) as dst:
                    dst.write(rgb)
                if os.path.getsize(path) <= max_bytes:
                    break
        else:
            path = path_noext + ".png"
            with rasterio.open(path, "w", driver="PNG", width=w, height=h, count=1, dtype="uint8", ZLEVEL=9) as dst:
                dst.write(gray[None])
    size = os.path.getsize(path)
    if size > max_bytes:
        print(f"WARNING: {os.path.basename(path)} is {size // 1024} KB (> {max_bytes // 1024} KB); try --size 768")
    return path, size


# ----------------------------------------------------------------------------- main
def check_points(p, sites, crs_like):
    t = _to_xy(_crs(crs_like))
    pts = [{"id": "pole", "lat": -90.0, "lon": 0.0}] + [{"id": s["id"], "lat": s["lat"], "lon": s["lon"]} for s in sites]
    pts += [{"id": f"grid{la}_{lo}", "lat": float(la), "lon": float(lo)} for la in (-89, -86, -82) for lo in (45, 135, 225, 315)]
    out = []
    for q in pts:
        x, y = t.transform(q["lon"], q["lat"])
        out.append({**q, "x": round(x, 3), "y": round(y, 3)})
    return out


def find_default_dems():
    seen, out = set(), []
    for g in DEFAULT_DEM_GLOBS:
        for pth in sorted(glob.glob(g)):
            key = os.path.normcase(os.path.abspath(pth))
            if key not in seen:
                seen.add(key)
                out.append(pth)
    return out


def build(dems, out_dir, sites, px=1024, placeholder=False, max_bytes=MAX_IMAGE_BYTES, now=None):
    os.makedirs(out_dir, exist_ok=True)
    if placeholder:
        crs_like = LOLA_SOUTH_STEREO
    else:
        import rasterio
        with rasterio.open(dems[0]) as src:
            crs_like = src.crs.to_wkt()
    p = proj_params(crs_like)
    site_xy = [project_formula(s["lat"], s["lon"], p) for s in sites]
    views = plan_views(site_xy, px=px)
    sources = []
    for v in views:
        stale = [os.path.join(out_dir, v["id"] + ext) for ext in (".webp", ".png")]
        for f in stale:
            if os.path.exists(f):
                os.remove(f)
        if placeholder:
            v.update(file=None, bytes=0, coverage_pct=0.0)
            continue
        z, used = read_dem_to_view(dems, crs_like, v["bounds"], v["width"], v["height"])
        cov = float(np.isfinite(z).mean() * 100)
        if cov == 0:
            raise SystemExit(f"The DEM(s) do not cover the '{v['id']}' view; nothing to draw.")
        scale, unit = height_scale(z)
        shade = hillshade(z * scale, v["m_per_px"], **HILLSHADE)
        path, size = write_image(to_uint8(shade), os.path.join(out_dir, v["id"]), max_bytes)
        v.update(file=os.path.basename(path), bytes=size, coverage_pct=round(cov, 2), height_unit_in_dem=unit)
        for u in used:
            if u not in sources:
                sources.append(u)
        print(f"{v['id']}: {v['width']}x{v['height']} px, {v['m_per_px']:.0f} m/px, coverage {cov:.1f}%, {size // 1024} KB")

    meta = {
        "version": 1,
        "generated_utc": (now or dt.datetime.now(dt.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "placeholder": bool(placeholder),
        "projection": {
            "name": "South polar stereographic, 1737.4 km sphere, true scale at the pole" if abs(p["k0"] - 1) < 1e-9
            else "South polar stereographic (sphere)",
            "crs": crs_like,
            **{k: round(v, 6) for k, v in p.items()},
            "orientation": "pole at the centre; 0 deg E points up, 90 deg E points right",
        },
        "source": None if placeholder else {
            "dems": sources,
            "citation": DATA_CITATION,
            "page": "https://pgda.gsfc.nasa.gov/products/90",
        },
        "hillshade": None if placeholder else {**HILLSHADE, "note": "Artificial light from the upper left for readability; not the real Sun."},
        "views": views,
        "check_points": check_points(p, sites, crs_like),
    }
    with open(os.path.join(out_dir, "map_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
        f.write("\n")
    return meta


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dem", action="append", help="DEM GeoTIFF path or https URL (repeatable; earlier wins)")
    ap.add_argument("--placeholder", action="store_true", help="no DEM: write map_meta.json only (app labels it a placeholder)")
    ap.add_argument("--out-dir", default=DEFAULT_OUT)
    ap.add_argument("--sites", action="append", help="sites.json path(s); default public/data + pipeline")
    ap.add_argument("--size", type=int, default=1024, help="image width/height in px (default 1024)")
    ap.add_argument("--max-kb", type=int, default=MAX_IMAGE_BYTES // 1024)
    a = ap.parse_args(argv)
    sites = load_sites(a.sites or SITE_FILES)
    dems = a.dem or ([] if a.placeholder else find_default_dems())
    if not a.placeholder and not dems:
        print("No regional DEM found in pipeline/dem/ (expected LDEM_*.tif or .tiff).\n"
              "Download LDEM_80S_80MPP_ADJ.TIF (181 MB) from https://pgda.gsfc.nasa.gov/products/90 into pipeline/dem/,\n"
              "or read the 20 m COG remotely with --dem https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF,\n"
              "or run with --placeholder (the app will show a labelled placeholder map).", file=sys.stderr)
        return 2
    meta = build(dems, a.out_dir, sites, px=a.size, placeholder=a.placeholder, max_bytes=a.max_kb * 1024)
    print(f"wrote {os.path.join(a.out_dir, 'map_meta.json')} ({'PLACEHOLDER' if meta['placeholder'] else 'real LOLA terrain'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
