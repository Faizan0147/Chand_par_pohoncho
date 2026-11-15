# M1 — Real terrain data (DONE)

Task: replace the synthetic placeholder horizons with real LRO LOLA DEMs so on-screen
percentages are predictions, not illustrations.
Acceptance: "Demo terrain" banner disappears for at least 3 sites. **Met — all 7 sites are real.**

## Data used (all NASA)

| Product | URL | Use |
|---|---|---|
| LOLA 80–90°S DEM, 20 m/px, ADJ | `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF` | 6 sites, ±16 km crop |
| LOLA global DEM, 118 m/px (SimpleCylindrical, int16 @ 0.5 m/DN) | `https://planetarymaps.usgs.gov/mosaic/Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif` | IM-1 only (see below) |
| LOLA 5 m/px site tiles | `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/SiteNN/...` | used for the frame check only (±8 km too small for a 15 km march) |
| 87–90°S 5 m/px mosaic | `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/87S/ldem_87s_5mpp.tif` | **corrupt tile, unusable** |

Cite: Barker et al. 2021, PSS 203, 105119 · Smith et al. 2010, GRL 37, L18204.
Site/illumination references: Mazarico et al. 2011, Icarus 211, 1066 · Speyerer & Robinson
2013, Icarus 222, 122 · De Rosa et al. 2012 · Noda et al. 2008.

## How to reproduce

    python pipeline/fetch_dems.py       # 7 crops -> pipeline/dem/<site-id>.tif (~34 MB)
    python pipeline/build_data.py       # -> public/data/sites.json + ephemeris.json
    python pipeline/validate_illumination.py
    python pipeline/check_results.py
    npm test && npm run build

`pipeline/dem/` is gitignored. The crops are cut from the source URLs by `fetch_dems.py`,
so nothing large is committed.

## Result (app window, 2026-11-01 .. 2027-12-30, 2 m observer)

| Site | hz max | max dark | sunlit |
|---|---|---|---|
| connecting-ridge | -0.05° | 122 h | 93.9% |
| shackleton-rim | 2.30° | 130 h | 83.9% |
| peak-near-shackleton | 1.05° | 381 h | 86.9% |
| de-gerlache-rim | 0.97° | 254 h | 89.1% |
| nobile-rim-1 | 12.68° | 512 h | 31.7% |
| im2-athena | 4.00° | 406 h | 48.4% |
| im1-odysseus | 11.02° | 480 h | 36.5% |

## Validation against published 18.6-year averages

`pipeline/validate_illumination.py` runs DE421 + the real DEMs over 1992–2010 (one full
nodal cycle) and uses the same "Sun disc above horizon" definition as the literature.

| Site | ours | published |
|---|---|---|
| Connecting Ridge C1 | 92.7% | 89.0% (Mazarico 2011) |
| Shackleton rim | 81.7% | 86.7% (Mazarico) / 71.6% (Speyerer) |
| de Gerlache rim | 86.6% | 85.6% (Noda 2008) |
| Peak near Shackleton | 84.0% | 85.5% (Noda 2008) |
| Malapert M2 (control) | 86.6% | 81.8% |

Scatter is a few pp, consistent with 20 m vs 240 m DEM resolution and differing visibility
definitions. The app's window is 14 months, so its numbers differ from the 18.6-year
average by up to ~10 pp — documented on the Method page.

## Coordinate fixes (with reasons)

| Site | old | new | why |
|---|---|---|---|
| connecting-ridge | -89.4632, 222.510 | **-89.4505, 222.840** | De Rosa C1; old point 400 m south gave 52.8% vs 89% published |
| shackleton-rim | -89.7668, 188.130 | **-89.740, 201.2** | Speyerer & Robinson; old point sat on a 32° wall (23%) |
| de-gerlache-rim | -88.6834, 292.070 | **-88.675, 291.85** | local illumination max 200 m from Mazarico pt 11 (86.6% vs 85.6% published) |
| peak-near-shackleton | -88.8110, 123.6901 | unchanged | within 120 m of Mazarico pt 7, gives 84.0% |
| nobile-rim-1 / IM-2 / IM-1 | — | unchanged | PGDA Site06 centre / LROC fixes |

All 7 region sites are ~15 km wide, so a few hundred metres of placement matters a lot:
at 89.7°S, 1° of longitude is only ~0.4 km.

## Frame / coordinate convention — resolved

- 5 m/px site tiles vs the 20 m/px mosaic: **zero pixel shift, 1.7–2.7 m rms** → same frame.
- The 20 m/px mosaic and the global 118 m DEM agree to the metre (0.5 m/DN accounted for).
- Site coordinates match the PGDA tile centres to <2 m where PGDA defines the site.
- A naive "find the deepest crater" test was wrong (it locked onto an adjacent bowl);
  cross-correlation is the decisive test.

## Bugs found and fixed this session

1. `rasterio.index()` returns `(row, col)`, not `(col, row)` — my first `fetch_dems.py`
   and `find_site.py` crops were transposed. Fixed, and every `.index()` call in
   `pipeline/` was audited afterwards. The old `frame_check.py` had the same bug (plus it
   read the corrupt 87S mosaic and used the discredited crater-scan method), so it was
   deleted; `frame_px.py` holds the decisive cross-correlation result.
2. IM-1 (80.13°S) is 4 km inside the 80°S edge of the 20 m/px product, so a ±16 km crop
   does not fit. Added the 118 m/px global DEM as a fallback, reprojected to the same
   polar-stereographic frame. (A `WarpedVRT` over the 8 GB global file is unusably slow;
   the fallback reads one lat/lon window then reprojects in memory, ~45 s.)
3. PGDA `AVGVISIB` illumination maps are int16 with an undocumented scale — abandoned as a
   validator; the 18.6-year reproduction of published values is the real check.

## Remaining caveats

- IM-1 DEM is 118 m/px (coarser) and its horizon is the least certain of the seven.
- Nobile Rim 1 is a low-illumination PSR-access site (31.7%), not a high-sunlight site —
  that is a property of the site, not a bug. There is a 48.9% point 3 km away.
- The 87–90°S 5 m/px mosaic is corrupt at source; not used.
- `src/App.jsx` banner is now site-aware and shows nothing when every site is real
  (it will reappear, counting sites, if a DEM is ever missing).

## Repo hygiene

`pipeline/dem/.gitkeep` keeps the folder in the repo without the TIFFs.
Deleted `pipeline/locate_craters.py` (the naive crater-position test that gave a wrong
57.9° frame offset; cross-correlation superseded it).

Diagnostic scripts kept in `pipeline/`: `check_site_coords.py`, `audit_coords.py`,
`diagnose_horizon.py`, `terrain_view.py`, `dem_raw_check.py`, `probe_cog.py`,
`frame_px.py`, `pick_sites.py`.
Note: `audit_coords.py` and `frame_px.py` expect the original PGDA
5 m/px site tiles in `pipeline/dem/`; normal use stores the 20 m/px crops there, so
re-download the tiles first if you want to re-run those two.
Production: `fetch_dems.py`, `build_data.py`, `horizon_dem.py`, `ephemeris.py`,
`validate_illumination.py`, `check_results.py`, `find_site.py`.