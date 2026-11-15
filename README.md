# Rimlight (MVP)

Landing-site horizon panorama for the NASA Space Apps 2026 challenge "Lunar Landing Site Navigator".
Pick a site and a date, see where the Sun and Earth sit against the terrain horizon, and find out how many days the launch can slip before your requirements fail.

Pages: **Sites** (pick) · **Site** (panorama, timeline, slip strip) · **Compare** (up to 3 sites) · **How it works** (method, validation, limits).
All state lives in the URL, so any view can be shared as a link.

Project notes live in [`docs/`](docs/): start with [M1 status](docs/M1-STATUS.md).

## Read this first: what is real and what is a placeholder

| Part | Status |
|---|---|
| Sun/Earth positions | Real. JPL DE421 ephemeris and libration angles, 1 Nov 2026 – 30 Dec 2027, hourly. |
| Terrain horizons | **Real** for all 7 sites: LRO LOLA DEMs (20 m/px 80–90°S product; 118 m/px global product for IM-1). 15 km horizon ray-march. |
| Site coordinates | Checked against Mazarico 2011, Speyerer & Robinson 2013, De Rosa 2012 and LROC; per-site `source` in `pipeline/sites.json`. |
| Horizons comparison | `pipeline/validate_illumination.py` reproduces published 18.6-year average illumination to a few percentage points (see Method page). |
| Moon-frame offset (PA→ME) | Magnitudes were entered from memory; sign was checked against the mean Earth direction. Verify against the DE421 frame kernel. |

Not built: Moon-vs-home toggle (SunCalc), jsPDF Site Brief, PSR layer, landing-oval, 3D view.

## Run the app

    npm install
    npm run dev        # http://localhost:5173
    npm test           # JS vs Python cross-check + metric invariants
    npm run build      # static site in dist/
    npm run build:preview   # single-file dist-preview/rimlight-preview.html

## Rebuild the data (Python)

    python -m venv .venv && source .venv/bin/activate
    pip install -r pipeline/requirements.txt
    python pipeline/build_data.py

Writes `public/data/ephemeris.json`, `public/data/sites.json`, `pipeline/tests/reference.json`.
Run `python pipeline/tests/test_geometry.py` for the offline geometry checks.

## Terrain data (LOLA)

    python pipeline/fetch_dems.py      # writes pipeline/dem/<site-id>.tif (7 crops, ~34 MB)
    python pipeline/build_data.py      # turns them into public/data/sites.json horizons

`fetch_dems.py` cuts a ±16 km square around each site from the NASA PGDA 20 m/px 80–90°S
DEM (Barker et al. 2021), so the 15 km horizon ray-march has margin. IM-1 sits 4 km
outside that product, so it uses the 118 m/px USGS global LOLA DEM (Smith et al. 2010)
reprojected to the same frame. `pipeline/dem/` is gitignored; the crops are regenerated
from the source URLs. Options: `--radius-km`, `--site`, `--observer-height` on
`build_data.py` (default 2 m).

Checks:

    python pipeline/validate_illumination.py   # 18.6-year illumination vs published values
    python pipeline/check_results.py           # what the app will show, from public/data
    python pipeline/find_site.py --help        # scan a region and rank observers

## Check against JPL Horizons

    python pipeline/validate_horizons.py

Needs internet. Writes `public/data/validation.json`, which the *How it works* page then displays. The response parser is the fragile part; expect to adjust it on first run.

## Deploy

Push to `main` on GitHub, then Settings → Pages → Source: GitHub Actions. `.github/workflows/deploy.yml` tests, builds and publishes `dist/`. The app uses relative paths and a hash router, so it works under any repo name.

## Layout

    pipeline/   Python: ephemeris, DEM ray-march, data build, tests, Horizons check
    src/lib/    geometry.js (az/el), metrics.js (windows, slip tolerance), explain.js (plain-language text)
    src/pages/  Pick, Site, Compare, Method
    scripts/    crosscheck.mjs, make_preview.mjs
