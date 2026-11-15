"""
Compare OUR Sun/Earth azimuth+elevation with JPL Horizons for the same site and times.
Writes public/data/validation.json, which the Method page displays.

Last run: 14 Nov 2026 (results in public/data/validation.json). Rerun with internet:
    python pipeline/validate_horizons.py
Horizons fair-use: one request at a time (this script is sequential). Results are cached in
pipeline/.horizons_cache/ (keyed by site + window, so a changed window never reuses a stale
table). If the CSV layout differs from what parse_rows() expects, fix parse_rows() - that is
the only fragile part. On any failure the script exits non-zero and leaves an existing
validation.json untouched.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ephemeris import moon_frame_vectors, az_el, R_MOON_KM

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
CACHE = os.path.join(HERE, ".horizons_cache")
SITES = ["connecting-ridge", "shackleton-rim", "im2-athena"]
START = datetime(2026, 12, 1, tzinfo=timezone.utc)
N_STEPS, STEP_H = 48, 6
OUT = os.path.join(HERE, "..", "public", "data", "validation.json")


def die(msg):
    """Fail loudly without touching an existing validation.json."""
    print(f"ERROR: {msg}", file=sys.stderr)
    print("public/data/validation.json was NOT changed.", file=sys.stderr)
    sys.exit(1)


def horizons(command, lat, lon):
    os.makedirs(CACHE, exist_ok=True)
    stop = START + timedelta(hours=STEP_H * N_STEPS)
    params = {
        "format": "text", "COMMAND": f"'{command}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",              # East lon, lat, altitude km
        "START_TIME": f"'{START:%Y-%m-%d %H:%M}'", "STOP_TIME": f"'{stop:%Y-%m-%d %H:%M}'",
        "STEP_SIZE": f"'{STEP_H} h'", "QUANTITIES": "'4'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'",
    }
    # key includes the window so a changed START/N_STEPS never reuses a stale table
    key = os.path.join(CACHE, f"{command}_{lat}_{lon}_{START:%Y%m%d}_{N_STEPS}x{STEP_H}h.txt")
    if os.path.exists(key):
        return open(key).read(), key
    url = API + "?" + urllib.parse.urlencode(params)
    try:
        txt = urllib.request.urlopen(url, timeout=60).read().decode()
    except OSError as e:                                # URLError, HTTPError, timeout
        die(f"could not reach JPL Horizons ({e}). Check the internet connection and rerun.")
    open(key, "w").write(txt)
    time.sleep(1.0)                                    # be polite: sequential, never parallel
    return txt, key


def parse_rows(txt, source="Horizons response"):
    if "$$SOE" not in txt:
        detail = next((ln.strip() for ln in txt.splitlines() if ln.strip() and not ln.startswith("*")
                       and "API" not in ln), "")[:200]
        die(f"{source} contains no ephemeris table. {detail}\n"
            f"If a cached file is stale or corrupt, delete it and rerun.")
    rows = txt.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    out = []
    for r in rows:
        nums = []
        for f in r.split(",")[1:]:
            try:
                nums.append(float(f))
            except ValueError:
                pass
        out.append((nums[-2], nums[-1]))               # azimuth, elevation
    return np.array(out)


def ang_diff(a, b):
    return (a - b + 180) % 360 - 180


def main():
    sites = {s["id"]: s for s in json.load(open(os.path.join(HERE, "sites.json")))["sites"]}
    t = np.array([START + timedelta(hours=STEP_H * i) for i in range(N_STEPS + 1)])
    jd = np.array([2440587.5 + x.timestamp() / 86400 for x in t])
    sun, earth = moon_frame_vectors(jd)
    result = {"generated": datetime.now(timezone.utc).isoformat(), "window": f"{START:%Y-%m-%d} +{N_STEPS*STEP_H} h, step {STEP_H} h", "rows": []}
    for sid in SITES:
        s = sites[sid]
        for body, cmd in (("Sun", "10"), ("Earth", "399")):
            txt, src = horizons(cmd, s["lat"], s["lon"])
            h = parse_rows(txt, source=src)
            if len(h) != len(jd):
                die(f"{src}: {len(h)} rows, expected {len(jd)} (window {START:%Y-%m-%d}, "
                    f"step {STEP_H} h). Delete the file and rerun.")
            ours = []
            for i in range(len(jd)):
                _, _, up = az_el(sun[i], s["lat"], s["lon"])
                v = sun[i] if body == "Sun" else (earth[i] - R_MOON_KM * up) / np.linalg.norm(earth[i] - R_MOON_KM * up)
                a, e, _ = az_el(v, s["lat"], s["lon"])
                ours.append((a, e))
            ours = np.array(ours)
            n = min(len(h), len(ours))
            d_el = ours[:n, 1] - h[:n, 1]
            d_az = ang_diff(ours[:n, 0], h[:n, 0])
            result["rows"].append({"site": s["name"], "body": body,
                                   "elMaxAbsDeg": float(np.abs(d_el).max()), "elRmsDeg": float(np.sqrt((d_el**2).mean())),
                                   "azMaxAbsDeg": float(np.abs(d_az).max()), "samples": int(n)})
            print(f"{s['name']:28s} {body:5s} el max|d|={np.abs(d_el).max():.4f} deg  az max|d|={np.abs(d_az).max():.4f} deg")
    json.dump(result, open(OUT, "w"), indent=1)
    print(f"wrote {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
