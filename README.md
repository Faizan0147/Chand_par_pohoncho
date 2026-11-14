# Rimlight (MVP)

Landing-site horizon panorama for the NASA Space Apps 2026 challenge "Lunar Landing Site Navigator".
Pick a site and a date, see where the Sun and Earth sit against the terrain horizon, and find out how many days the launch can slip before your requirements fail.

Pages: **Sites** (pick) · **Site** (panorama, timeline, slip strip) · **Compare** (up to 3 sites) · **How it works** (method, validation, limits).
All state lives in the URL, so any view can be shared as a link.

## Read this first: what is real and what is a placeholder

| Part | Status |
|---|---|
| Sun/Earth positions | Real. JPL DE421 ephemeris and libration angles, 1 Nov 2026 – 30 Dec 2027, hourly. |
| Terrain horizons | **Synthetic placeholders** until you add LOLA DEMs (see below). Percentages are illustrative. |
| Site coordinates | From our research notes; **verify before citing**. |
| Horizons comparison | `pipeline/validate_horizons.py` is written but **has not been run**. |
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

## Replace the synthetic terrain with real LOLA data

1. Download a south-polar LOLA elevation model (e.g. the 20 m/px or 5 m/px polar tiles from NASA PDS / PGDA) covering each site and ~15 km around it.
2. Save a GeoTIFF as `pipeline/dem/<site-id>.tif` (ids are in `pipeline/sites.json`, e.g. `connecting-ridge.tif`).
3. Run `python pipeline/build_data.py`. Sites with a DEM switch from "synthetic-demo" to the real horizon, and the demo banners disappear once none remain synthetic.
4. Options: `--dem-dir`, `--observer-height` (default 2 m).

## Check against JPL Horizons

    python pipeline/validate_horizons.py

Needs internet. Writes `public/data/validation.json`, which the *How it works* page then displays. The response parser is the fragile part; expect to adjust it on first run.

## Deploy

CI/CD pipelines are removed for now. Run `npm test` and `npm run build`, then publish `dist/` (or the single-file `dist-preview/rimlight-preview.html`) by hand. The app uses relative paths and a hash router, so it works under any repo name.

## Layout

    pipeline/   Python: ephemeris, DEM ray-march, data build, tests, Horizons check
    src/lib/    geometry.js (az/el), metrics.js (windows, slip tolerance), explain.js (plain-language text)
    src/pages/  Pick, Site, Compare, Method
    scripts/    crosscheck.mjs, make_preview.mjs
