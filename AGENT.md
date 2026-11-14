# AGENT.md — Rimlight project context

Give this file (plus the relevant `milestones/Mx.md`) to any agent working on the project. Facts marked **[unverified]** have not been checked against a primary source; do not state them as fact in user-facing text.

## 1. What we are building
**Rimlight**: a free static web app for the NASA Space Apps 2026 challenge **"Lunar Landing Site Navigator"** (hackathon 14–15 Nov 2026). Users pick a lunar south-pole landing site and a date, see where the Sun and Earth sit against the *real terrain horizon*, and learn how many days the launch can slip before power or Earth-contact requirements fail.

Challenge needs: compare sites and dates; Sun/Earth vs horizon; time to sunset/Earthset; power and comms metrics; temporal dynamics; usable by non-experts; handle schedule slips.

**Team goal: not feature-loaded; easy to navigate and understand; fulfils every challenge requirement.** Prefer finishing and polishing over adding features. Demo story: "pick a site, see the horizon, slip the launch, watch it break."

Not a guarantee of landing safety: keep that disclaimer.

## 2. Pages and behaviour
- **Sites** (`src/pages/Pick.jsx`): site cards. **Site** (`Site.jsx`): verdict, play/scrub, horizon panorama, Sun/Earth elevation + countdowns, whole-stay timeline and stats, slip strip. **Compare** (`Compare.jsx`): up to 3 sites. **How it works** (`Method.jsx`): method, validation, limits.
- A persistent scenario bar (`ScenarioBar.jsx`) sets date, slip, mission length, requirements.
- All state is in the URL (hash router): `d` (planned landing date UTC, default 2026-12-15), `slip` (days), `len` (mission days, 10), `bat` (battery hours, 30), `earth` (min % Earth in view, 50), `sites` (comma list, max 3). **Do not rename these**; other features read them.
- Yellow "Demo terrain" banner shows while any site has `terrain === 'synthetic-demo'` (`src/App.jsx:13`).

## 3. Definitions (src/lib/metrics.js)
- A mission window = `len` days starting at `d + slip`. Hourly samples.
- **Works** = longest dark spell <= `bat` hours AND Earth-in-view % >= `earth`.
- **Slip tolerance** = largest D such that landing on day 0..D ALL work (first-failure rule, max 30 days). Statuses: `ok`, `fails-now`, `never-fails`, `data-ends`.
- Sun is lit when its elevation exceeds the terrain horizon at its azimuth (disc radius `SUN_RADIUS_DEG`); Earth likewise (`EARTH_RADIUS_DEG`). Terminology: say "terrain horizon" for terrain, "JPL Horizons" only for the validation service.

## 4. Architecture
```
pipeline/ (Python)                           public/data/ (static JSON)         src/ (React+Vite+D3)
 ephemeris.py   DE421 Sun/Earth in MOON_ME -> ephemeris.json (hourly, 425 d) -> lib/data.jsx builds series
 horizon_dem.py LOLA DEM ray-march 360 az  -> sites.json (id,name,kind,lat,lon,  lib/geometry.js az/el
 build_data.py  writes both + reference.json     note,terrain,horizon[360])      lib/metrics.js windows, slip
 validate_horizons.py JPL Horizons check   -> validation.json (not yet produced)  lib/explain.js plain text
 fetch/diagnostic scripts (M1)                                                    components/, pages/
```
- Ephemeris: JPL DE421 via PyPI `de421` + `jplephem==1.2` (**pinned**, API differs in 2.x). Frame: ICRF -> MOON_PA (libration Euler angles) -> MOON_ME via a constant offset (67.92", 78.56", 0.30"; sign -1). Magnitudes were entered from memory **[unverified vs frame kernel moon_080317.tf]**; sign checked empirically against the mean Earth direction.
- Not modelled: light-time/aberration, TDB-TT (<0.01 deg). TAI-UTC fixed at 37 s.
- Time range: 2026-11-01 .. 2027-12-30, hourly. Dates outside show "outside data".
- Horizon: `horizon_dem.horizon_profile(dem, lat, lon, observer_height=2 m, n_az=360, max_dist_m=15000)` ray-marches with curvature, no refraction. Azimuth 0 = north, clockwise. Longitude east-positive 0-360 in `sites.json`.
- Speed: everything precomputed; the browser only slices arrays.

## 5. Data
LOLA DEMs from NASA PGDA (cite Barker et al. 2021, Planet. Space Sci. 203, 105119; Mazarico et al. 2011, Icarus 211, 1066).
- 5 m site tiles: `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/SiteNN/SiteNN_final_adj_5mpp_surf.tif` (~41 MB; 16x16 km, Nobile 20x20 km). Site numbers: 01 Connecting ridge, 04 Shackleton rim, 06 Nobile rim 1, 07 Peak near Shackleton, 11 de Gerlache rim, 20 Leibnitz beta, 23 Malapert massif. Polar stereographic metres, MOON_ME of DE421.
- Coarse COGs (windowed range reads work via rasterio `/vsicurl/`): `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF` (20 m, 80-90S), `.../LOLA_20mpp/LDEM_75S_30MPP_ADJ.TIF` (30 m, 75-90S; used for IM-1 at 80.13S). The 87S 5 m mosaic is reported corrupt; do not use.
- Local DEMs live in `pipeline/dem/<site-id>.tif` (git-ignored, share via Drive). On the laptop that wrote this file they were downloaded 14 Nov 2026: five 5 m tiles + `im2-athena.tif` (2000x2000 at 20 m) + `im1-odysseus.tif` (1333x1333 at 30 m).
- Nobile tile heights are ~860..6800 m while others are ~-2800..2000 m: different vertical reference/region; heights only matter relative to the site, but **[unverified]** confirm that with a horizon sanity check.

Sites (`pipeline/sites.json`): connecting-ridge, shackleton-rim, peak-near-shackleton, de-gerlache-rim, nobile-rim-1, im2-athena, im1-odysseus. Contract for `public/data/sites.json` entries: `id,name,kind,lat,lon,note,terrain,horizon[360]`. Only **add** fields; never rename/remove. New data goes in new JSON files.

## 6. Commands
```
npm install ; npm run dev            # http://localhost:5173
npm test                              # scripts/crosscheck.mjs: JS vs Python az/el + metric invariants
npm run build ; npm run build:preview # dist/ ; dist-preview/rimlight-preview.html
python -m venv .venv ; pip install -r pipeline/requirements.txt
python pipeline/build_data.py         # rebuilds public/data/*.json + tests/reference.json (M1 owners only)
python pipeline/tests/test_geometry.py
python pipeline/validate_horizons.py  # needs internet, writes public/data/validation.json
```
Windows note: if App Control blocks PyPI DLLs: `Get-ChildItem -Recurse .venv\Lib\site-packages -Include *.dll,*.pyd | Unblock-File`.

## 7. Team and modules (see milestones/)
| Module | People | Scope |
|---|---|---|
| M1 | 2 | real LOLA terrain, coordinates, 15 km coverage, frame test |
| M2 | 1 | JPL Horizons validation, frame offset check, (then) IM-1/IM-2 replay |
| M3 | unassigned | Moon-vs-home (SunCalc), PDF Site Brief, phone/usability polish |
| M4 | 2 | optional shaded-relief map + PSR layer (first thing to cut) |
| M5 | all | submission package; record video only after M1 merged |

Rules: branch per module, small PRs, main always builds; only M1 owners regenerate/commit `public/data/*.json`; each feature adds its own files/CSS (avoid editing `styles.css` shared sections); freeze features once slip + compare work on real terrain.

## 8. Current status (14 Nov 2026)
Built: ephemeris pipeline, DEM ray-marcher (tested on a synthetic mountain), 4-page app, URL state, slip strip, single-file preview. CI/CD pipelines are removed for now (run `npm test` and `npm run build` locally before every PR).
Open: terrain still synthetic in committed data (teammate reports 5/7 real on their machine, see `M1-STATUS.md`); Shackleton rim coordinate likely wrong (lon 188.13 vs published ~204.27 E, 89.78S); tiles only reach ~8 km but march is 15 km; frame/longitude convention unconfirmed; Horizons validation never run; not built: Moon-vs-home, PDF brief, PSR layer, landing oval, 3D view.

## 9. Honesty rules
Every displayed number comes from our computation on NASA data. Never invent values or show synthetic horizons as real. State resolution, observer height (2 m) and Horizons error on the Method page. Declare AI assistance in the submission.
