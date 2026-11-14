# M1 — Real terrain data (status + plan)

Task: replace synthetic placeholder horizons with real LRO LOLA DEMs so on-screen percentages are predictions, not illustrations.
Done when: "Demo terrain" banner disappears for at least 3 sites.

## Data sources (all NASA)

| Product | URL | Resolution / notes |
|---|---|---|
| PGDA South Pole Landing Site LOLA DEMs | `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/SiteNN/SiteNN_final_adj_5mpp_surf.tif` | 5 m/px GeoTIFF, south polar stereographic, MOON_ME frame of DE421 |
| PGDA large-area DEM | `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF` | 20 m/px, 80–90°S, COG (read via HTTP range) |
| PGDA 87–90°S mosaic | `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/87S/ldem_87s_5mpp.tif` | 5 m/px — corrupt tile, unusable |

Cite: Barker et al. 2021, *Planet. Space Sci.* 203, 105119 (doi:10.1016/j.pss.2020.105119).
Mazarico et al. 2011, *Icarus* 211, 1066 (doi:10.1016/j.icarus.2010.10.030) — site numbering + illumination reference values.

## Environment

- Python 3.14 venv at `.venv`, deps from `pipeline/requirements.txt`: rasterio 1.5.2, pyproj 3.8, numpy 2.5.4, jplephem 1.2, de421 2008.1
- Windows App-Control blocks PyPI DLLs → fix:
  `Get-ChildItem -Recurse .venv\Lib\site-packages -Include *.dll,*.pyd | Unblock-File`
- `jplephem==1.2` must stay pinned (API differs from 2.x; `ephemeris.py` uses `Ephemeris(de421)`)

## Done

- [x] venv + requirements installed, DLL block cleared
- [x] 7 DEMs downloaded → `pipeline/dem/` (282 MB):
      `connecting-ridge`, `shackleton-rim`, `nobile-rim-1`, `peak-near-shackleton`,
      `de-gerlache-rim`, `leibnitz-beta`, `malapert-massif`
- [x] `python pipeline/build_data.py` ran → **5 of 7 sites now use real LOLA DEM**, 2 still synthetic
- [x] `public/data/ephemeris.json` regenerated **bit-identical** → pipeline reproducible
- [x] Site coordinates audited against DEM tile centres → match **<2 m** (PGDA centres tiles on the site)

## Open problems

1. **`shackleton-rim` sits on a 30° wall → 32° horizon → permanent darkness.**
   `sites.json` has lat/lon (−89.7668, 188.13) = PGDA Site04 tile centre, but published
   "Shackleton rim" is **89.78 S, 204.27 E** (Mazarico 2011 point 4; Speyerer & Robinson 2013:
   −89.740, 201.2). Our longitude looks wrong. Must fix.
2. **15 km radius not covered.** Site tiles are 16×16 km (±8 km). `horizon_profile` marches to
   15 km (`pipeline/horizon_dem.py:41`), so rays hit nodata past 8 km and the horizon is
   silently shortened.
3. **Frame / longitude convention unconfirmed.** Test pending: locate craters in the 80–90°S
   mosaic and compare with published lon — Shackleton 89.90 S 0.2 E, de Gerlache 88.70 S 291.9 E,
   Amundsen 86.28 S 308.1 E.
4. **`im2-athena` + `im1-odysseus` have no PGDA site DEM** → need mosaic crop.
5. **Global "Demo terrain" banner stays up** while any site is synthetic (`src/App.jsx:13`
   uses `.some()`). Per-site labels (`src/pages/Site.jsx:58`, `src/components/Panorama.jsx:73`)
   already flip to real terrain. Decide: all 7 real, or make the banner site-aware.

## Not yet done

Coordinate fix · 15 km coverage · crater frame test · rebuild + horizon sanity check + `npm test`.

## Repo hygiene

`pipeline/dem/` = 282 MB → add to `.gitignore` or Git LFS.
Backup copies of pre-change data exist as `public/data/*.json.bak`, `pipeline/tests/reference.json.bak`.

## Helper scripts written (in `pipeline/`)

| Script | Purpose |
|---|---|
| `check_site_coords.py` | site lat/lon vs its DEM: inside? elevation percentile? |
| `audit_coords.py` | our coords vs PGDA DEM tile centres (frame + offset check) |
| `diagnose_horizon.py` | per-azimuth horizon, max-angle distance, DEM reach, local slope |
| `terrain_view.py` | north-up ASCII heightmap + radial terrain profiles |
| `dem_raw_check.py` | raw pixel values, periodicity, crest test |
| `probe_cog.py` | read big COGs over HTTP (range reads) |
| `frame_check.py` | per-site tile vs 80S mosaic cross-correlation |
| `locate_craters.py` | crater-position frame test |
| `align_check.py` | tile↔mosaic alignment offset |
| `check_build.py` | output diff vs backup + horizon summary |

All are diagnostic only — `build_data.py` and `horizon_dem.py` are unmodified so far.

## Validation targets (from literature)

| Site | Published | Value |
|---|---|---|
| Connecting Ridge C1 | Mazarico 2011 | 89.0% avg illumination, 141 h max shadow |
| Shackleton rim | Mazarico 2011 point 4 | 86.7% avg illumination |
| de Gerlache rim | Mazarico 2011 point 11 | 85.6% (Noda et al. 2008) |
| Peak near Shackleton | Mazarico 2011 point 7 | 85.5% (Noda et al. 2008) |

Compare our computed sunlit % against these to prove the horizons are sane.
