# M2 — test log (JPL Horizons validation and frame)

Checks from `milestones/M2.md`, run on branch `m2` before merging.
Keep this file up to date: add a dated section whenever the checks are re-run.

## Run 1 — 15 Nov 2026 (pre-merge final check)

**Environment:** Windows 11, Python 3.14.7 venv from `pipeline/requirements.txt` (incl. spiceypy), Node 24.21.0, headless Chrome.
**Commit tested:** `369b56a`.

| # | Check | How | Result |
|---|---|---|---|
| 1 | Offline geometry | `python pipeline/tests/test_geometry.py` | **PASS**: 10/10 (IAU pole, mean Earth direction −4.3″ / −20.5″, libration 8.12° / 6.86°, Meeus 53.a, DEM ray-march) |
| 2 | JS vs Python | `npm test` | **PASS**: 7/7, worst az/el difference 3.1e-4° |
| 3 | Horizons run | `python pipeline/validate_horizons.py` (live, empty cache) | **PASS**: exit 0. The fresh `validation.json` is identical to the committed one except its `generated` timestamp (restored after the test) |
| 4 | Error size | inspect `validation.json` | **PASS**: max elevation diff 0.0011°, max azimuth diff 0.0058° (Sun, = annual aberration), Earth 0.0002°; all far below the 0.1° threshold |
| 5 | Same definition | read query in `validate_horizons.py` | **PASS**: `CENTER=coord@301`, geodetic site coordinates in the Moon body-fixed frame, `QUANTITIES=4` (apparent az/el, airless = no refraction), same times as the app |
| 6 | Method page | built app, headless Chrome, `#/method` | **PASS**: shows the threshold sentence, the measured values and a Samples column (49 per row); no "not yet run" text |
| 7 | Frame offset | `python pipeline/check_frame.py` | **PASS**: matches NAIF `moon_080317.tf` to 0.0043″ with sign −1 (sign +1 would be off by 207.7″) |
| 8 | Failure handling | rerun with `HTTPS_PROXY=http://127.0.0.1:9` (no route) | **PASS**: exit 1, message "could not reach JPL Horizons … Check the internet connection and rerun", `validation.json` SHA-1 unchanged |
| 9 | Replay | — | **NOT BUILT**: optional IM-1/IM-2 mission replay was not started |
| — | Build | `npm run build` | **PASS** |

### Cross-branch check
`validation.json` was produced with the pre-M1 site coordinates. Re-running `validate_horizons.py` with M1's coordinates on the merged tree gives the same maxima (0.0011° el, 0.0058° az), so the numbers on the Method page stay correct after merging. Optionally rerun and commit after the merge so the file records the final coordinates.

### Minor
- `favicon.ico` 404 in the browser console on this branch alone; M3 adds an inline favicon in `index.html`, so it disappears after merging.
