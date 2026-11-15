# Merge of M1-M4 into main: test log

Keep this file up to date: add a dated section whenever main is re-checked after a merge.

## Run 1 (15 Nov 2026)

**Merged into `main` through GitHub pull requests (merge commits, so each contributor's commits are kept):** #1 `m1` (54ab2cc), #2 `m2` (e2a36e1), #3 `m3-polish` (1771f6a), #4 `m4-map` (fb15f39), in that order. Conflicts were resolved on each branch by merging `main` into it before its PR was merged. The checks below were run on a trial merge whose resulting tree is identical to `main` after #4 (verified with `git rev-parse <commit>^{tree}`).
**Environment:** Windows 11, Node 24.21.0, headless Chrome (puppeteer-core 23.11.1), Python 3.14.7.

### Conflicts and how they were resolved
| Merge | File | Resolution |
|---|---|---|
| m2 | `.gitignore` | m1's version + `pipeline/kernels/*.bpc` from m2 |
| m2 | `src/pages/Method.jsx` (Limits) | m2's TAI-UTC line + m1's ephemeris, IM-1 resolution and coordinate lines (m1's wording supersedes m2's duplicates) |
| m2, m3-polish | `AGENT.md` section 8 | rewritten after the last merge to describe M1-M4 |
| m4-map | `package.json` `"test"` | `node scripts/crosscheck.mjs && node scripts/test_map.mjs && node scripts/test_brief.mjs` |
| m4-map | `src/pages/Method.jsx` (Credits) | m1's three LOLA / site / illumination lines + m4's map and PSR lines |

No conflict markers remain (`grep -r '<<<<<<<'`, excluding node_modules).

### Checks
| # | Check | How | Result |
|---|---|---|---|
| 1 | JS tests | `npm test` | **PASS**: 40/40 (8 crosscheck + 22 map + 10 brief; crosscheck worst 3.16e-4°) |
| 2 | Builds | `npm run build`, `npm run build:preview` | **PASS**: both build; preview file 1459 KB |
| 3 | Horizons validation on the merged coordinates | `python pipeline/validate_horizons.py` (live). The m2 file was computed with m2's older site coordinates | **PASS**: max diff 0.0058° (az, Sun; annual aberration), every elevation diff < 0.0012°, Earth az < 0.0002°. Same as before; the Method page text still holds. `validation.json` updated |
| 4 | Phone layout, no errors | 375 px on `#/`, a site, compare, method, `?view=map` | **PASS**: 0 px overflow, smallest text 11 px, no console or network errors. Site page shows "terrain: LOLA DEM, observer 2 m"; Method says "Terrain data: real" |
| 5 | Keyboard, Moon vs home, URL state | `m3.mjs` | **PASS**: 47 focus stops, none unnamed; 10 cities + custom; `?slip=7&len=14` survives reload and new tab |
| 6 | Map | `m4.mjs` | **PASS**: all 7 markers in both views open the right site with the scenario kept; PSR toggle 0 px reflow in both views; throttled phone load 3.7 s |
| 7 | PDF brief on real terrain | `check3.mjs`, Shackleton rim, 20 Dec 2026, slip 4, 375 px | **PASS**: PDF downloaded; all 5 page stats (92%, 19 h, 23%, 7 d 18 h, 15%) found in the PDF |
