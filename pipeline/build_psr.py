"""
Permanently shadowed region (PSR) outlines for the Sites-page map (module M4, optional layer).

    python pipeline/build_psr.py                       # reads pipeline/dem/psr/LPSR_80S_20MPP_ADJ_1km2.shp
    python pipeline/build_psr.py --shp PATH.shp        # any polygon shapefile with a .prj next to it

Input: the LOLA-derived PSR polygons published by NASA GSFC PGDA with Barker et al. (2023),
"A New View of the Lunar South Pole from LOLA", https://pgda.gsfc.nasa.gov/products/90,
section "Permanently Shadowed Region (PSR) products". Recommended: the "Only PSRs with area > 1 km2"
set (LPSR_80S_20MPP_ADJ_1km2.SHP/.SHX/.DBF/.PRJ, ~20 MB). The full set (LPSR_80S_20MPP_ADJ.SHP,
~154 MB, 506k polygons) also works but is slower. Download manually (see README) into pipeline/dem/psr/.

Method (also written into psr.json):
  1. read polygons from the shapefile, reproject to the map CRS if the .prj differs;
  2. per map view, drop polygons whose net area is smaller than (2 px)^2 at that view's scale or outside the view;
  3. convert to view pixels, simplify each ring (Douglas-Peucker, 0.6 px tolerance);
  4. write SVG path strings (even-odd fill keeps holes) to public/data/map/psr.json.
No outline is drawn by hand; the app shows nothing if psr.json is absent.
"""
import argparse
import datetime as dt
import json
import math
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_SHP = os.path.join(HERE, "dem", "psr", "LPSR_80S_20MPP_ADJ_1km2.shp")
DEFAULT_META = os.path.join(ROOT, "public", "data", "map", "map_meta.json")
DEFAULT_OUT = os.path.join(ROOT, "public", "data", "map", "psr.json")
CITATION = ("Barker, M. K., et al. (2023), Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1; "
            "data: NASA GSFC PGDA, doi:10.60903/gsfcpgda-lola-spole")
SIMPLIFY_PX = 0.6
MIN_AREA_PX = 4.0


def _crs_wkt(crs_like):
    from pyproj import CRS
    return CRS.from_user_input(crs_like).to_wkt()


def _find(path_noext, ext):
    for e in (ext.lower(), ext.upper()):
        if os.path.exists(path_noext + e):
            return path_noext + e
    return None


def read_shapefile_polygons(shp_path):
    """Yield lists of rings [(x, y), ...] for each polygon record (types 5, 15, 25). Pure Python, no GDAL/OGR."""
    with open(shp_path, "rb") as f:
        data = f.read()
    code, = struct.unpack(">i", data[:4])
    if code != 9994:
        raise ValueError(f"{shp_path} is not an ESRI shapefile")
    shape_type, = struct.unpack("<i", data[32:36])
    if shape_type not in (5, 15, 25):
        raise ValueError(f"{shp_path}: shape type {shape_type} is not a polygon layer")
    pos, end = 100, len(data)
    while pos + 8 <= end:
        _, length = struct.unpack(">2i", data[pos:pos + 8])
        rec = data[pos + 8: pos + 8 + 2 * length]
        pos += 8 + 2 * length
        st, = struct.unpack("<i", rec[:4])
        if st == 0:
            continue
        n_parts, n_pts = struct.unpack("<2i", rec[36:44])
        parts = list(struct.unpack(f"<{n_parts}i", rec[44:44 + 4 * n_parts])) + [n_pts]
        off = 44 + 4 * n_parts
        pts = np.frombuffer(rec, dtype="<f8", count=2 * n_pts, offset=off).reshape(-1, 2)
        yield [pts[parts[i]:parts[i + 1]] for i in range(n_parts)]


def signed_area(r):
    x, y = r[:, 0], r[:, 1]
    return 0.5 * (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def ring_area(r):
    return abs(signed_area(r))


def polygon_area(rings):
    """Net area of a (multi)polygon: shapefile outer rings are clockwise, holes counter-clockwise."""
    return abs(sum(signed_area(r) for r in rings))


def simplify(pts, tol):
    """Douglas-Peucker on an (N, 2) array."""
    if len(pts) < 4:
        return pts
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = pts[b] - pts[a]
        L = math.hypot(*seg)
        rel = pts[a + 1:b] - pts[a]
        d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / L if L > 0 else np.hypot(rel[:, 0], rel[:, 1])
        i = int(np.argmax(d))
        if d[i] > tol:
            k = a + 1 + i
            keep[k] = True
            stack += [(a, k), (k, b)]
    return pts[keep]


def build(shp_path, meta_path=DEFAULT_META, out_path=DEFAULT_OUT, now=None):
    from pyproj import CRS, Transformer
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    map_crs = CRS.from_user_input(meta["projection"]["crs"])
    prj = _find(os.path.splitext(shp_path)[0], ".prj")
    if not prj:
        raise SystemExit(f"{shp_path}: no .prj file next to it; refusing to guess the projection.")
    with open(prj, encoding="utf-8", errors="replace") as f:
        shp_crs = CRS.from_wkt(f.read())
    tr = None if shp_crs.equals(map_crs, ignore_axis_order=True) else Transformer.from_crs(shp_crs, map_crs, always_xy=True)

    polys = []
    for rings in read_shapefile_polygons(shp_path):
        if tr is not None:
            rings = [np.column_stack(tr.transform(r[:, 0], r[:, 1])) for r in rings]
        outer = polygon_area(rings)
        xs = np.concatenate([r[:, 0] for r in rings]); ys = np.concatenate([r[:, 1] for r in rings])
        polys.append((outer, (xs.min(), ys.min(), xs.max(), ys.max()), rings))

    data_min = min((a for a, _, _ in polys), default=0.0)     # e.g. ~1 km^2 for the "_1km2" set
    out_views = {}
    for v in meta["views"]:
        l, b, r, t = v["bounds"]
        sx, sy = v["width"] / (r - l), v["height"] / (t - b)
        min_area = MIN_AREA_PX * v["m_per_px"] ** 2
        d, count = [], 0
        for area, (x0, y0, x1, y1), rings in polys:
            if area < min_area or x1 < l or x0 > r or y1 < b or y0 > t:
                continue
            sub = []
            for ring in rings:
                px = np.column_stack(((ring[:, 0] - l) * sx, (t - ring[:, 1]) * sy))
                px = simplify(px, SIMPLIFY_PX)
                if len(px) >= 4 and ring_area(px) >= 1.0:
                    sub.append("M" + "L".join(f"{a:.1f},{c:.1f}" for a, c in px[:-1]) + "Z")
            if sub:
                d.append("".join(sub))
                count += 1
        shown_min = max(min_area, data_min) / 1e6           # smallest polygon area that can appear in this view
        out_views[v["id"]] = {"count": count, "min_area_km2": round(shown_min, 1), "d": "".join(d)}
        print(f"{v['id']}: {count} PSR polygons, {len(out_views[v['id']]['d']) // 1024} KB of path data")

    res = {
        "version": 1,
        "generated_utc": (now or dt.datetime.now(dt.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": {"file": os.path.basename(shp_path), "page": "https://pgda.gsfc.nasa.gov/products/90", "citation": CITATION},
        "method": (f"LOLA-derived PSR polygons; reprojected to the map CRS when needed; per view, polygons under "
                   f"{MIN_AREA_PX:g} px^2 dropped, rings simplified with Douglas-Peucker ({SIMPLIFY_PX} px)."),
        "map_views": {v["id"]: v["bounds"] for v in meta["views"]},
        "views": out_views,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(res, f, separators=(",", ":"))
    print(f"wrote {out_path} ({os.path.getsize(out_path) // 1024} KB)")
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--shp", default=DEFAULT_SHP)
    ap.add_argument("--meta", default=DEFAULT_META, help="map_meta.json written by build_map.py")
    ap.add_argument("--out", default=DEFAULT_OUT)
    a = ap.parse_args(argv)
    if not os.path.exists(a.shp):                       # PGDA names files in upper case; accept either
        base = os.path.splitext(a.shp)[0]
        for cand in (base + ".SHP", base + ".shp", os.path.join(os.path.dirname(base), os.path.basename(base).upper() + ".SHP")):
            if os.path.exists(cand):
                a.shp = cand
                break
    if not os.path.exists(a.shp):
        print(f"PSR shapefile not found: {a.shp}\nDownload the LOLA PSR shapefile set (.shp .shx .dbf .prj) from "
              "https://pgda.gsfc.nasa.gov/products/90 (section 'Permanently Shadowed Region (PSR) products') "
              "into pipeline/dem/psr/. See README, 'Site map'.", file=sys.stderr)
        return 2
    build(a.shp, a.meta, a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
