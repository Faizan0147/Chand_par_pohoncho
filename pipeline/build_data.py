"""
Build the static data the web app reads:
  public/data/ephemeris.json   Sun/Earth in the Moon-fixed ME frame, hourly (site independent)
  public/data/sites.json       site list + 360-point terrain horizon mask per site
  pipeline/tests/reference.json  az/el reference values for the JS cross-check

Usage:
  python pipeline/build_data.py                  # uses ./pipeline/dem/<site-id>.tif when present,
                                                 # otherwise a clearly-labelled SYNTHETIC placeholder
  python pipeline/build_data.py --dem-dir /path  # DEM GeoTIFFs named <site-id>.tif
"""
import argparse, json, os, sys, zlib
from datetime import datetime, timezone
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ephemeris import moon_frame_vectors, az_el, R_MOON_KM

START = datetime(2026, 11, 1, tzinfo=timezone.utc)
DAYS, STEP_H = 425, 1                                    # 2026-11-01 .. 2027-12-30, hourly
N_AZ = 360


def jd_utc(dt):
    return 2440587.5 + dt.timestamp() / 86400.0


def synthetic_horizon(site_id):
    """PLACEHOLDER terrain: a few smooth ridges, seeded by site id. NOT real topography."""
    rng = np.random.default_rng(zlib.crc32(site_id.encode()))
    az = np.arange(N_AZ, dtype=float)
    prof = np.full(N_AZ, 0.1)
    for _ in range(7):
        c, w, h = rng.uniform(0, 360), rng.uniform(6, 22), rng.uniform(0.4, 3.0)
        d = (az - c + 180) % 360 - 180
        prof = np.maximum(prof, h * np.exp(-(d / w) ** 2))
    return np.round(prof, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dem-dir", default=os.path.join(HERE, "dem"))
    ap.add_argument("--observer-height", type=float, default=2.0)
    args = ap.parse_args()

    out = os.path.join(HERE, "..", "public", "data")
    os.makedirs(out, exist_ok=True)
    sites_in = json.load(open(os.path.join(HERE, "sites.json")))["sites"]

    # ---- ephemeris (site independent) ----
    n = DAYS * 24 // STEP_H
    jd = jd_utc(START) + np.arange(n) * STEP_H / 24.0
    sun, earth = moon_frame_vectors(jd)
    eph_json = {
        "t0": START.strftime("%Y-%m-%dT%H:%M:%SZ"), "stepHours": STEP_H, "n": int(n),
        "frame": "MOON_ME (DE421 libration + PA->ME offset)", "rMoonKm": R_MOON_KM,
        "sunE5": np.round(sun * 1e5).astype(int).ravel().tolist(),        # unit vector x 1e5
        "earthKmE1": np.round(earth * 10).astype(int).ravel().tolist(),   # km x 10
    }
    json.dump(eph_json, open(os.path.join(out, "ephemeris.json"), "w"), separators=(",", ":"))

    # ---- terrain horizons ----
    sites_out, ref = [], {}
    for s in sites_in:
        dem = os.path.join(args.dem_dir, f"{s['id']}.tif")
        if os.path.exists(dem):
            from horizon_dem import horizon_profile
            hz = np.round(horizon_profile(dem, s["lat"], s["lon"], args.observer_height, N_AZ), 2)
            terrain = f"LOLA DEM, observer {args.observer_height:g} m"
        else:
            hz, terrain = synthetic_horizon(s["id"]), "synthetic-demo"
        sites_out.append({**s, "terrain": terrain, "horizon": hz.tolist()})

        # reference az/el (smooth sphere) at a few steps, for the JS cross-check
        idx = [0, 500, 1500, 4000, 9000]
        r = []
        for i in idx:
            a_s, e_s, up = az_el(sun[i], s["lat"], s["lon"])
            ev = earth[i] - R_MOON_KM * up
            a_e, e_e, _ = az_el(ev / np.linalg.norm(ev), s["lat"], s["lon"])
            r.append({"i": i, "sunAz": a_s, "sunEl": e_s, "earthAz": a_e, "earthEl": e_e})
        ref[s["id"]] = r

    json.dump({"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "sites": sites_out},
              open(os.path.join(out, "sites.json"), "w"), separators=(",", ":"))
    json.dump(ref, open(os.path.join(HERE, "tests", "reference.json"), "w"), indent=1)

    demo = [s["id"] for s in sites_out if s["terrain"] == "synthetic-demo"]
    print(f"ephemeris: {n} steps; sites: {len(sites_out)}; synthetic-terrain sites: {len(demo)}")
    if demo:
        print("WARNING: placeholder terrain in use. Add real DEMs to pipeline/dem/<site-id>.tif and rerun.")


if __name__ == "__main__":
    main()
