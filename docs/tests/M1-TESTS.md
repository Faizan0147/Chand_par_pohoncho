# M1 — test log (real terrain)

Checks from `milestones/M1.md`, run on branch `m1` before merging.
Keep this file up to date: add a dated section whenever the checks are re-run.

## Run 1 — 15 Nov 2026 (pre-merge final check)

**Environment:** Windows 11, Python 3.14.7 venv from `pipeline/requirements.txt`, Node 24.21.0.
**Commit tested:** `2b2d05f` (+ the `validate_illumination.py` fix below).
**DEMs:** fetched fresh with `python pipeline/fetch_dems.py` (exit 0, 34 MB, ~3 min). Six 1601×1601 crops at 20 m/px from `LDEM_80S_20MPP_ADJ.TIF`; IM-1 fell back to the 118 m/px global DEM (271×271), as documented.

| # | Check | How | Result |
|---|---|---|---|
| 1 | Files present | `ls pipeline/dem` | **PASS**: one `.tif` per site (7) |
| 2 | DEM opens, CRS, pixel size | rasterio | **PASS**: all have a polar-stereographic CRS; 20 m (IM-1: 118.5 m) |
| 3 | Units / range | masked read, min/max | **PASS**: metres, −2872 … 6908 m, no all-nodata tile |
| 4 | Site inside DEM | `horizon_profile()` per site | **PASS**: no exception for any site |
| 5 | Horizon plausible | max of each horizon | **PASS, with 2 flags explained**: no flat line, nothing > 15°. Nobile Rim 1 (12.68°) and IM-1 (11.02°) are above the 8° rule of thumb. Both are documented in `docs/M1-STATUS.md`: Nobile is a low-sun PSR-access rim, and IM-1 sits in Malapert A on a coarse 118 m DEM |
| 6 | No wall artefacts | max adjacent-azimuth jump | **PASS**: largest jump 0.58° (IM-1); all others ≤ 0.47° |
| 7 | Coverage | distance from site to the nearest DEM edge | **PASS**: ≥ 16.0 km for every site (15 km march fits) |
| 8 | Coordinates vs source | `source` field in `pipeline/sites.json` | **PASS**: all 7 record their source (De Rosa 2012 C1, Speyerer & Robinson 2013, Mazarico 2011 pt 7 / pt 11, PGDA Site06, LROC IM-1 / IM-2) |
| 9 | Literature illumination | `python pipeline/validate_illumination.py` (18.6 yr, 1992–2010, 3 min 39 s) | **PASS**: all within ±10 pp (table below) |
| 10 | Terrain labels | committed `public/data/sites.json` | **PASS**: all 7 `LOLA DEM, observer 2 m`; no `synthetic-demo` |
| 11 | Banner | built app, headless Chrome, `#/`, `#/site/nobile-rim-1`, `#/compare` | **PASS**: no "Demo terrain" banner; no console errors (only a missing `favicon.ico` 404, fixed by M3's `index.html`) |
| 12 | Reproducible | `build_data.py` run twice | **PASS**: `ephemeris.json` and `tests/reference.json` byte-identical across runs **and** to the committed files; `sites.json` differs only in its `generated` timestamp, with content equal to the commit |
| 13 | Regression | `npm test`, `python pipeline/tests/test_geometry.py`, `npm run build` | **PASS**: 8/8 JS checks, 10/10 Python checks, build OK |
| 14 | Repo hygiene | `git ls-files`, `git check-ignore` | **PASS**: no `.tif` / `.bak` / `.npy` tracked; `pipeline/dem/*` ignored by `.gitignore:17` |

Extra: recomputing every horizon from the freshly fetched DEMs matches the committed `horizon[360]` arrays to within 0.01° (the stored rounding). `python pipeline/check_results.py` reproduces the "Result" table in `docs/M1-STATUS.md` exactly (hz max, sun %, max dark h for all 7 sites).

### Check 9 detail (18.6-year sunlit %, Sun disc above terrain)

| Site (current coordinate) | ours | published | diff |
|---|---|---|---|
| Connecting Ridge (−89.4505, 222.84) | 92.7 % | 89.0 % (Mazarico pt 1) | +3.7 |
| Shackleton rim (−89.740, 201.2) | 81.7 % | 86.7 % (Mazarico pt 4) / 71.6 % (Speyerer) | −5.0 / +10.1 |
| Peak near Shackleton (−88.811, 123.69) | 84.0 % | 85.5 % (Mazarico pt 7) | −1.5 |
| de Gerlache rim (−88.675, 291.85) | 86.6 % | 85.6 % (Mazarico pt 11) | +1.0 |

Shackleton vs Speyerer is just over 10 pp. The two published values themselves differ by 15 pp, and ours falls between them, as explained in `docs/M1-STATUS.md`.

### Problem found and fixed in this run
- **`validate_illumination.py` did not test the coordinates the app ships.** Its candidate list was hardcoded and never included the chosen Connecting Ridge (222.84) and de Gerlache (291.85) points. So the 92.7 % and 86.6 % in `docs/M1-STATUS.md` could not be reproduced with the committed script. **Fix:** the script now also reads `pipeline/sites.json` and prints a `CURRENT` row per validated site. Re-run: all four numbers in the status doc reproduce exactly.

### Not covered
- `audit_coords.py` and `frame_px.py` need the 5 m PGDA site tiles, not the 20 m crops (see `docs/M1-STATUS.md`); the frame result they support was not re-run here.
