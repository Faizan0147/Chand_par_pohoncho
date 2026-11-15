# M4 — test log (site map and PSR layer)

Checks from `milestones/M4.md`, run on branch `m4-map` before merging.
Keep this file up to date: add a dated section whenever the checks are re-run.

## Run 1 — 15 Nov 2026 (pre-merge final check)

**Environment:** Windows 11, Node 24.21.0, Python 3.14.7, headless Chrome (puppeteer-core 23.11.1).
**Commit tested:** `5baaeaa` (+ the layout fix below).

| # | Check | How | Result |
|---|---|---|---|
| 1 | Placement | `scripts/test_map.mjs` (JS projection vs pyproj at 20 points, worst 5.9e-4 m; all 7 sites inside the image for both `public/` and `pipeline/` site lists) + screenshot of "Near the pole" on the **merged** data (M1 coordinates) | **PASS**: Shackleton rim marker sits on the rim of the ~21 km crater at the pole; Connecting Ridge on the ridge toward de Gerlache; Peak near Shackleton and de Gerlache rim on their features |
| 2 | Orientation | map text and SVG label | **PASS**: "pole at the centre, 0° longitude up, 90°E right" (caption + SVG `aria-label`); graticule labels 80–86°S, 90°E, 180°, 270°E; scale bar (100 km region / 10 km pole); source, 80 m/px DEM, 615 m per image pixel, build date shown |
| 3 | Click-through | click all 7 markers (3 in "Whole region", 4 in "Near the pole") with `d=2026-12-20&slip=4&len=12&bat=40&earth=60` | **PASS**: each opens the right site page; all five params kept every time |
| 4 | Performance | `npm run build` sizes; Chrome throttled to 1.6 Mbit/s + 150 ms, 390 px, cache off | **PASS**: `region.webp` 185 KB, `pole.webp` 109 KB, `psr.json` 135 KB, map JS chunk 11 KB (lazy). Map with markers ready in 3.7 s |
| 5 | PSR provenance | read `pipeline/build_psr.py` | **PASS**: source (PGDA LPSR_80S_20MPP_ADJ_1km2, Barker et al. 2023), method (reproject, drop < (2 px)², Douglas-Peucker 0.6 px), one command; method also written into `psr.json` |
| 6 | PSR sanity | screenshot with layer on | **PASS**: Shackleton floor and the other polar cold-trap craters are blue; sunlit ridges (Connecting Ridge, rims) are not |
| 7 | Toggle | toggle on/off, measure section height | **PASS after fix** (see below): no height change in either view; checkbox labelled "Permanently shadowed regions"; legend sentence present; paths removed when off |
| 8 | Isolation | `git diff --stat main..m4-map` | **PASS with notes**: no change to `sites.json`, `Site.jsx` or `styles.css`. Besides new files and the `Pick.jsx` map section, it also edits `README.md` (map build docs), `package.json` (`test` script) and `Method.jsx` (2 credit lines). All are reasonable, but `package.json` and `Method.jsx` conflict with other branches at merge |
| 9 | Degradation | served copies of the build with `psr.json` removed / `*.webp` removed / whole `data/map/` removed | **PASS**: no crash or uncaught error in any case. No PSR → checkbox disabled "(not built yet; see README)". No images → grid + markers still clickable. No map data → "The map is not available in this build. Use Cards…". Cards view works in all three |
| 10 | Regression | `npm test` (crosscheck + `test_map.mjs`), `python pipeline/tests/test_build_map.py`, `npm run build` | **PASS**: 29/29 JS checks, Python map test passes, build OK |

### Problem found and fixed in this run
- **Layout jump when toggling PSR (check 7).** In "Whole region", switching the layer on made the map section 20 px taller. The credit paragraph under the map only gained its "Blue: permanently shadowed regions…" sentence while the layer was on, which wrapped the paragraph. **Fix** (`src/components/SiteMap.jsx`): the sentence is shown whenever the PSR data exists, worded "Blue (when the layer is on): …". Re-test: 1128 → 1128 px and 1162 → 1162 px.

### Minor
- `favicon.ico` 404 on this branch alone; fixed by M3's `index.html` after merging.
- Removed the stale Method-page sentence "Until the map is built from that DEM the app shows a labelled placeholder grid" (the map is built).
