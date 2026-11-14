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
| Site map (Sites → Map) | Real. Shaded relief from LOLA `LDEM_80S_80MPP_ADJ` and PSR outlines from LOLA `LPSR_80S_20MPP_ADJ_1km2` (built 14 Nov 2026). Rebuild with the steps under *Site map*. |

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

## Site map (Sites → Map, module M4)

The Sites page can show the sites on a south-polar shaded-relief map. Both data sets below are LOLA-derived NASA products from the PGDA page https://pgda.gsfc.nasa.gov/products/90 (cite Barker et al. 2023, Planet. Sci. J. 4, 183). They are too big for Git: download them by hand into `pipeline/dem/` (git-ignored).

1. **Terrain:** download `LDEM_80S_80MPP_ADJ.TIF` (80 m/px, ~181 MB; `.tif` or `.tiff` both work) from that page into `pipeline/dem/`, then run

       python pipeline/build_map.py

   It writes `public/data/map/region.webp`, `pole.webp` (each kept under 500 KB) and `map_meta.json`; commit those three files. Without downloading, the 20 m cloud-optimized GeoTIFF can be read remotely: `python pipeline/build_map.py --dem https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF`. With no DEM, `--placeholder` writes only `map_meta.json` and the app shows a labelled grid instead of terrain.
2. **Permanently shadowed regions (optional):** from the same page, section *Permanently Shadowed Region (PSR) products*, download the four shapefile parts (`.SHP .SHX .DBF .PRJ`) of either the "area > 1 km²" set (`LPSR_80S_20MPP_ADJ_1km2.*`, ~20 MB, recommended) or the full set (`LPSR_80S_20MPP_ADJ.*`, ~154 MB+) into `pipeline/dem/psr/`, then run

       python pipeline/build_psr.py                     # default: pipeline/dem/psr/LPSR_80S_20MPP_ADJ_1km2.shp
       python pipeline/build_psr.py --shp pipeline/dem/psr/LPSR_80S_20MPP_ADJ.SHP

   It writes `public/data/map/psr.json`. The map's PSR checkbox stays disabled until this file exists and matches the current `map_meta.json` (rerun it after every `build_map.py`).
3. Tests: `python pipeline/tests/test_build_map.py` (pipeline, offline, synthetic test data only) and `npm test` (includes `scripts/test_map.mjs`).

## Check against JPL Horizons

    python pipeline/validate_horizons.py

Needs internet. Writes `public/data/validation.json`, which the *How it works* page then displays. The response parser is the fragile part; expect to adjust it on first run.

## Deploy

Push to `main` on GitHub, then Settings → Pages → Source: GitHub Actions. `.github/workflows/deploy.yml` tests, builds and publishes `dist/`. The app uses relative paths and a hash router, so it works under any repo name.

## Layout

    pipeline/   Python: ephemeris, DEM ray-march, data build, tests, Horizons check, build_map.py / build_psr.py (site map)
    src/lib/    geometry.js (az/el), metrics.js (windows, slip tolerance), explain.js (plain-language text), polarMap.js (map projection)
    src/pages/  Pick, Site, Compare, Method
    scripts/    crosscheck.mjs, make_preview.mjs
