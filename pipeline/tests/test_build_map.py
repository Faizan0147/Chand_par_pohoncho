"""
Run:  python pipeline/tests/test_build_map.py
Offline checks for the M4 map pipeline (build_map.py, build_psr.py). Uses SYNTHETIC test DEMs and
shapefiles written to a temp folder; nothing here is shipped or shown in the app.
"""
import json, math, os, struct, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np
import build_map as bm

failures = []
def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))
    if not ok: failures.append(name)

CRS = bm.LOLA_SOUTH_STEREO
SITES = bm.load_sites()

# 1. closed-form projection == pyproj, and the pole is the origin
p = bm.proj_params(CRS)
check("projection parameters: R=1737.4 km, k0=1, lon0=0", abs(p["R"] - 1737400) < 1e-6 and abs(p["k0"] - 1) < 1e-9 and p["lon0"] == 0)
check("south pole projects to (0, 0)", max(map(abs, bm.project_formula(-90, 0, p))) < 1e-6)
x, y = bm.project_formula(-80, 0, p)
check("lat -80, lon 0 is straight up, 2R tan(5 deg) from the pole", abs(x) < 1e-6 and abs(y - 2 * 1737400 * math.tan(math.radians(5))) < 1e-3)
x, y = bm.project_formula(-80, 90, p)
check("lon 90E points right", x > 300_000 and abs(y) < 1e-6)
pts = bm.check_points(p, SITES, CRS)
worst = max(math.hypot(*(np.subtract(bm.project_formula(q["lat"], q["lon"], p), (q["x"], q["y"])))) for q in pts)
check("formula matches pyproj at all check points (< 1 cm)", worst < 0.01, f"worst {worst:.2e} m")

# 2. view planning: centred on the pole, every site inside the region view
xy = [bm.project_formula(s["lat"], s["lon"], p) for s in SITES]
views = bm.plan_views(xy)
reg = views[0]
check("region view is centred on the pole", reg["bounds"][0] == -reg["bounds"][2] and reg["bounds"][1] == -reg["bounds"][3])
check("every site lies inside the region view", all(reg["bounds"][0] < a < reg["bounds"][2] and reg["bounds"][1] < b < reg["bounds"][3] for a, b in xy),
      f"{len(SITES)} sites, half-width {reg['bounds'][2] / 1000:.0f} km")
check("a pole zoom view exists for the clustered polar sites", len(views) == 2 and views[1]["id"] == "pole")

# 3. hillshade direction: a slope facing the light (upper left) is brighter than one facing away
ramp = np.add.outer(np.arange(50.0), np.arange(50.0)) * 20       # rises to lower-right => faces upper-left
hs_toward = np.nanmean(bm.hillshade(ramp, 100, **bm.HILLSHADE))
hs_away = np.nanmean(bm.hillshade(-ramp, 100, **bm.HILLSHADE))
check("hillshade lights slopes facing the upper left", hs_toward > hs_away + 0.2, f"{hs_toward:.2f} vs {hs_away:.2f}")

# 4. end-to-end with a synthetic test DEM: a single tall cone at a known lat/lon must appear at the
#    pixel the browser formula predicts (placement check), output must be small and well-formed.
import rasterio
from rasterio.transform import from_origin
tmp = tempfile.mkdtemp(prefix="rimlight_map_test_")
half, res = 340_000, 1_000.0
n = int(2 * half / res)
xs = -half + (np.arange(n) + 0.5) * res
ys = half - (np.arange(n) + 0.5) * res
X, Y = np.meshgrid(xs, ys)
rng = np.random.default_rng(1)
Z = np.zeros_like(X)
for _ in range(400):                                             # crater-like bowls for texture/size realism
    cx, cy, r = rng.uniform(-half, half), rng.uniform(-half, half), rng.uniform(2e3, 3e4)
    d = np.hypot(X - cx, Y - cy) / r
    Z += np.where(d < 1, -0.2 * r * (1 - d ** 2), 0.05 * r * np.exp(-(d - 1) ** 2 * 8))
cone_lat, cone_lon = -84.0, 120.0
cx, cy = bm.project_formula(cone_lat, cone_lon, p)
Z += 9000 * np.exp(-((X - cx) ** 2 + (Y - cy) ** 2) / (2 * 6000.0 ** 2))
dem = os.path.join(tmp, "LDEM_TEST.tif")
with rasterio.open(dem, "w", driver="GTiff", width=n, height=n, count=1, dtype="float32", crs=CRS,
                   transform=from_origin(-half, half, res, res), nodata=-9999) as dst:
    dst.write(Z.astype(np.float32)[None])

zv, used = bm.read_dem_to_view([dem], CRS, reg["bounds"], 256, 256)
r_, c_ = np.unravel_index(np.nanargmax(zv), zv.shape)
l, b, r, t = reg["bounds"]
pc, pr = (cx - l) / (r - l) * 256, (t - cy) / (t - b) * 256
check("DEM feature lands on the predicted pixel (<= 1 px)", abs(c_ + 0.5 - pc) <= 1 and abs(r_ + 0.5 - pr) <= 1, f"peak ({c_},{r_}) vs predicted ({pc:.1f},{pr:.1f})")

out = os.path.join(tmp, "out")
meta = bm.build([dem], out, SITES)
meta2 = json.load(open(os.path.join(out, "map_meta.json")))
check("real build is not flagged as placeholder", meta2["placeholder"] is False and meta2["source"]["dems"][0]["file"] == "LDEM_TEST.tif")
for v in meta2["views"]:
    f = os.path.join(out, v["file"])
    check(f"{v['id']} image written and <= 500 KB", os.path.exists(f) and os.path.getsize(f) <= 500 * 1024, f"{os.path.getsize(f) // 1024} KB, {v['file']}")
check("region view coverage reported", 0 < meta2["views"][0]["coverage_pct"] <= 100, f"{meta2['views'][0]['coverage_pct']}%")

# 5. placeholder build writes no image and says so
outp = os.path.join(tmp, "ph")
mp = bm.build([], outp, SITES, placeholder=True)
check("placeholder build: flagged, no images", mp["placeholder"] and all(v["file"] is None for v in mp["views"]) and os.listdir(outp) == ["map_meta.json"])
check("placeholder and real builds use identical views", [v["bounds"] for v in mp["views"]] == [v["bounds"] for v in meta2["views"]])

# 6. PSR script: synthetic square polygon (with a hole) in a minimal shapefile -> paths in view pixels
import build_psr as bp
def write_shp(base, polys):
    """Minimal polygon shapefile writer (test-only)."""
    recs = []
    for i, rings in enumerate(polys, 1):
        pts = [pt for ring in rings for pt in ring]
        parts = np.cumsum([0] + [len(rg) for rg in rings[:-1]]).tolist()
        xsr, ysr = [q[0] for q in pts], [q[1] for q in pts]
        body = struct.pack("<i4d2i", 5, min(xsr), min(ysr), max(xsr), max(ysr), len(rings), len(pts))
        body += struct.pack(f"<{len(parts)}i", *parts) + b"".join(struct.pack("<2d", *q) for q in pts)
        recs.append(struct.pack(">2i", i, len(body) // 2) + body)
    allx = [q[0] for rings in polys for rg in rings for q in rg]; ally = [q[1] for rings in polys for rg in rings for q in rg]
    total = 100 + sum(len(r_) for r_ in recs)
    hdr = struct.pack(">7i", 9994, 0, 0, 0, 0, 0, total // 2) + struct.pack("<2i4d4d", 1000, 5, min(allx), min(ally), max(allx), max(ally), 0, 0, 0, 0)
    open(base + ".shp", "wb").write(hdr + b"".join(recs))
    open(base + ".prj", "w").write(bp._crs_wkt(CRS))
sq = [(-20000, -20000), (-20000, 20000), (20000, 20000), (20000, -20000), (-20000, -20000)]
hole = [(-5000, -5000), (5000, -5000), (5000, 5000), (-5000, 5000), (-5000, -5000)]
tiny = [(100000, 100000), (100000, 100300), (100300, 100300), (100300, 100000), (100000, 100000)]
shp = os.path.join(tmp, "TEST_PSR")
write_shp(shp, [[sq, hole], [tiny]])
psr = bp.build(shp + ".shp", os.path.join(out, "map_meta.json"), os.path.join(out, "psr.json"))
pole_paths = psr["views"]["pole"]["d"]
check("PSR: square polygon (with hole) kept, tiny polygon dropped at region scale", psr["views"]["region"]["count"] == 1, f"{psr['views']['region']['count']} kept")
pv = next(v for v in meta2["views"] if v["id"] == "pole")
l, b, r, t = pv["bounds"]
exp_c = (-20000 - l) / (r - l) * pv["width"]
nums = [float(s) for s in pole_paths.replace("M", " ").replace("L", " ").replace("Z", " ").replace(",", " ").split()]
check("PSR: polygon converted to the view's pixel coordinates", abs(min(nums[0::2]) - exp_c) < 0.2, f"min x {min(nums[0::2]):.1f} vs {exp_c:.1f}")
check("PSR: provenance recorded", psr["source"]["file"] == "TEST_PSR.shp" and "method" in psr)

print("\n" + ("ALL PASSED" if not failures else f"{len(failures)} FAILED"))
sys.exit(1 if failures else 0)
