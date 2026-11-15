# Rimlight

**When does the Sun shine, and when can you see Earth, from a lunar south-pole landing site?**

Rimlight is a free, static web app built for the NASA Space Apps Challenge 2026 challenge *Lunar Landing Site Navigator*. Pick a landing site and a date. Rimlight shows where the Sun and Earth sit against that site's real terrain horizon, how long power and a line of sight to Earth last during the stay, and how many days the launch can slip before your requirements fail.

> Rimlight is a comparison and planning aid, not a guarantee of landing safety or mission success.

## What it does

- **Sites:** seven south-pole sites as cards or on a shaded-relief map of the pole, with an optional layer of permanently shadowed regions.
- **Site page:**
  - a verdict for your stay;
  - a 360° horizon panorama with the Sun and Earth, and play/scrub through time;
  - countdowns to sunset and Earthset;
  - a whole-stay timeline with sunlight %, longest night, Earth-in-view % and longest comms gap;
  - a **slip strip** showing whether the plan still works if landing slips by 0–30 days.
- **Moon vs. home:** the Sun's path at the site next to a city on Earth (London, Karachi, Tokyo, …), on the same scale.
- **Compare:** up to three sites side by side for the same scenario.
- **PDF Site Brief:** a one-page A4 summary of the current scenario, with the same numbers as the page.
- **How it works:** method, validation results, data sources and limits.

You set the planned landing date, slip, stay length, battery hours (longest night the lander can survive) and minimum % of time Earth must be in view. Everything lives in the URL, so any view can be shared as a link. The app works on phones and with a keyboard.

## Sites

| Site | Lat, lon (°E) | Coordinate source |
|---|---|---|
| Connecting Ridge | −89.4505, 222.840 | De Rosa et al. 2012 (C1) |
| Shackleton rim | −89.740, 201.2 | Speyerer & Robinson 2013 |
| Peak near Shackleton | −88.811, 123.690 | Mazarico et al. 2011 (pt 7) |
| de Gerlache rim | −88.675, 291.85 | local illumination maximum 200 m from Mazarico et al. 2011 (pt 11) |
| Nobile Rim 1 | −85.438, 37.367 | NASA PGDA Site06 centre |
| IM-2 Athena (Mons Mouton) | −84.7906, 29.196 | LROC landing fix |
| IM-1 Odysseus (Malapert A) | −80.13, 1.44 | LROC landing fix |

The candidate regions are about 15 km wide, and a few hundred metres changes the sunlight a lot (at 89.7°S, 1° of longitude is only ~0.4 km). Each coordinate and its source are stored in `pipeline/sites.json`.

## How it works

- **Sun and Earth positions:** JPL DE421 ephemeris and lunar libration, in the Moon's mean-Earth frame, hourly from 1 Nov 2026 to 30 Dec 2027.
- **Terrain horizon:** for each site, rays are marched 15 km out in 360 directions over an LRO LOLA elevation model, with lunar curvature and an observer 2 m above the ground.
  - Six sites use the 20 m/px 80–90°S product.
  - IM-1 lies just outside it and uses the 118 m/px global product.
- **Lit / in view:** the Sun counts as lit while its disc is above the terrain horizon in its direction; Earth works the same way.
- **Works:** a stay works when the longest night is ≤ your battery hours *and* Earth is in view for at least your minimum %.
- **Slip tolerance:** the largest number of days *D* such that landing on every day from 0 to *D* still works, up to 30.

All heavy computation is done ahead of time in Python. The browser only reads small JSON files.

## Validation

| Check | Result |
|---|---|
| Sun and Earth az/el vs **JPL Horizons** (3 sites, 12 days, 6-hourly) | Largest difference 0.0058° (Sun azimuth, caused by annual aberration, which is not modelled); every elevation difference < 0.0012°. Shown on the *How it works* page. |
| Moon frame rotation (PA → ME) vs NAIF kernel `moon_080317.tf` (SpiceyPy) | Matches to 0.004″ |
| 18.6-year average sunlight vs published values (1992–2010) | Connecting Ridge 92.7% (published 89.0%), Shackleton rim 81.7% (86.7% / 71.6%), Peak near Shackleton 84.0% (85.5%), de Gerlache rim 86.6% (85.6%) |
| Elevation-model frame | 5 m/px and 20 m/px LOLA products cross-correlate with zero shift (1.7–2.7 m rms) |
| JS vs Python geometry | Same az/el to < 0.001° (`npm test`) |

## Limits

- **Earth in view ≠ a working radio link.** Antenna pointing, link budget and ground stations are not modelled.
- **Not modelled:**
  - light-time and aberration (< 0.01°);
  - terrain-height uncertainty;
  - boulders and other features smaller than the elevation model;
  - atmospheric refraction (the Moon has none; the Earth-city comparison ignores it).
- **Assumed:** TAI−UTC = 37 s. IERS Bulletin C 72 confirms there is no leap second at the end of 2026; a surprise 1 s step would move the angles by < 0.6″.
- **Percentages cover the stay you choose,** not a long-term average.
- **IM-1** uses the coarser 118 m/px model, so its horizon is the least certain.
- **Coordinates** mark documented region centres or landing fixes, not landing ellipses.

## Run it

Needs Node.js 18 or newer.

    npm install
    npm run dev              # http://localhost:5173
    npm test                 # geometry cross-check, metric invariants, map and PDF tests
    npm run build            # static site in dist/
    npm run build:preview    # one self-contained file: dist-preview/rimlight-preview.html

The app uses relative paths and a hash router, so `dist/` can be served from any static host or sub-folder. The single-file preview also opens straight from disk.

## Rebuild the data (optional)

The committed `public/data/` is all the app needs. To regenerate it you need Python 3:

    python -m venv .venv
    .venv/Scripts/activate            # Windows; on macOS/Linux: source .venv/bin/activate
    pip install -r pipeline/requirements.txt

    python pipeline/fetch_dems.py     # cuts a ±16 km LOLA crop around each site into pipeline/dem/ (~34 MB, git-ignored)
    python pipeline/build_data.py     # writes public/data/ephemeris.json, sites.json and pipeline/tests/reference.json
    python pipeline/tests/test_geometry.py

Checks:

    python pipeline/validate_horizons.py      # needs internet; compares with JPL Horizons, writes public/data/validation.json
    python pipeline/check_frame.py            # frame rotation vs NAIF kernel (downloads the 1.7 MB kernel on first run)
    python pipeline/validate_illumination.py  # 18.6-year sunlight vs published values (slow)
    python pipeline/check_results.py          # prints what the app will show for each site

### Site map

The map is built from the LOLA south-pole products at https://pgda.gsfc.nasa.gov/products/90. They are too large for Git, so download them into `pipeline/dem/` by hand.

1. **Terrain:** download `LDEM_80S_80MPP_ADJ.TIF` (80 m/px, ~181 MB), then run `python pipeline/build_map.py`. It writes `public/data/map/region.webp`, `pole.webp` and `map_meta.json`.
2. **Permanently shadowed regions:** from the same page, download the four `LPSR_80S_20MPP_ADJ_1km2` shapefile parts (`.SHP .SHX .DBF .PRJ`, ~20 MB) into `pipeline/dem/psr/`, then run `python pipeline/build_psr.py`. It writes `public/data/map/psr.json`. Rerun it after every `build_map.py`.
3. Run `python pipeline/tests/test_build_map.py` and `npm test`.

## Project layout

    pipeline/        Python: ephemeris, horizon ray-march, data build, map build, validation, tests
    public/data/     precomputed JSON and map images the app loads
    src/lib/         geometry, metrics (windows, slip tolerance), plain-language text, map projection, PDF brief
    src/components/  panorama, timeline, slip strip, Moon vs home, site map, scenario bar
    src/pages/       Sites, Site, Compare, How it works
    scripts/         JS tests and the single-file preview builder

## Data and credits

- **NASA/JPL Solar System Dynamics:** DE421 ephemeris and lunar libration. NASA JPL Horizons for validation. NAIF frame kernel `moon_080317.tf`.
- **Elevation and map data:** LRO LOLA elevation models via NASA GSFC PGDA and USGS Astrogeology:
  - Barker et al. 2021, *Planet. Space Sci.* 203, 105119;
  - Barker et al. 2023, *Planet. Sci. J.* 4, 183;
  - Smith et al. 2010, *Geophys. Res. Lett.* 37, L18204.
- **Site positions and published illumination:**
  - Mazarico et al. 2011, *Icarus* 211, 1066;
  - Speyerer & Robinson 2013, *Icarus* 222, 122;
  - De Rosa et al. 2012;
  - Noda et al. 2008;
  - LROC landing-site imagery.
- **Libraries:** React, Vite, D3, SunCalc (Earth-side Sun positions), jsPDF.

**Team:** [@Md-Zainulabdin](https://github.com/Md-Zainulabdin) (terrain and site coordinates) · [@FaizanAhmeddd27](https://github.com/FaizanAhmeddd27) (JPL Horizons validation) · [@Faizan0147](https://github.com/Faizan0147) (app, phone polish, Moon vs home, PDF brief) · [@arooj-zehra](https://github.com/arooj-zehra) and [@Syeda-Aliza-Ayaz](https://github.com/Syeda-Aliza-Ayaz) (site map and shadowed regions)
