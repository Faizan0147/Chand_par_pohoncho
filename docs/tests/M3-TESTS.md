# M3 — test log (phone polish, Moon vs home, PDF Site Brief)

Checks from `milestones/M3.md`, run on branch `m3-polish` before merging.
Keep this file up to date: add a dated section whenever the checks are re-run.

## Run 1 — 15 Nov 2026 (pre-merge final check)

**Environment:** Windows 11, Node 24.21.0, headless Chrome (puppeteer-core 23.11.1), Python 3.14.7.
**Commit tested:** `0612bed` (PDF Site Brief). Note: on this branch alone the terrain is still the synthetic placeholder (M1 not merged), so the "Demo terrain" banner shows. That is expected.

| # | Check | How | Result |
|---|---|---|---|
| 1 | Build | `npm test`, `npm run build`, `npm run build:preview` | **PASS**: 16/16 checks (7 crosscheck + 9 brief), both builds OK, no console errors on any page |
| 2 | Phone layout | headless Chrome 375×812 on `#/`, `#/site/connecting-ridge`, `#/compare?sites=…3`, `#/method` | **PASS**: 0 px horizontal overflow on all four; smallest text 11 px; panorama SVG labels 15 px tall |
| 3 | Accessibility basics | Tab through the site page | **PASS**: 47 focus stops, 0 without an accessible name (links, date input, ranges, selects, summary, buttons). Slip boxes are `<button>`s with `aria-label` / `aria-pressed`. Enter on "Slip 9 days" → `?slip=9`; Space on "Slip 12 days" → `?slip=12` |
| 4 | SunCalc correctness | `suncalc@1.9.0` (pinned), max altitude scan | **PASS**: London 21 Jun 2026 = 61.93°, expected 90 − 51.51 + 23.44 = 61.93°. Karachi 21 Dec 2026 = 41.70°, expected 41.70° |
| 5 | Moon-vs-home sanity | site page, switch cities | **PASS**: 10 preset cities + custom. Home max (15 Dec): London 15°, New York 26°, Karachi 41°, Delhi 38°, Cairo 37°; Connecting Ridge text "the Sun never gets above 1.x°"; same unstretched vertical scale (stated on the panel) |
| 6 | URL state | change slip (keyboard) and stay length in the UI, reload, open URL in a new tab | **PASS**: URL `#/site/shackleton-rim?slip=7&len=14`; after reload shows 7 days / 14; new tab shows 7 days; no param renamed |
| 7 | Brief numbers | `scripts/test_brief.mjs` (in `npm test`) + click the button in Chrome | **PASS**: 7 sites × 3 scenarios identical to page values. Real button clicks (served build, 375 px, and offline file): every page stat found in the downloaded PDF |
| 8 | Brief honesty | test with `synthetic-demo` and smooth-sphere sites | **PASS**: PDF shows "SYNTHETIC TERRAIN" / "NO TERRAIN" warning box; real-terrain PDF shows neither |
| 9 | Offline preview | `dist-preview/rimlight-preview.html` via `file://` | **PASS**: `#/`, a site, compare, method all load with no errors; Moon vs home renders; PDF downloads |
| 10 | No data writes | `git diff --stat main..m3-polish -- public/data` | **PASS**: empty |

### PDF Site Brief (built in this milestone)
- One A4 page, generated in the browser with `jspdf@4.2.1` (pinned, loaded only on click; main bundle +2 KB).
- Contents: site, coordinates and terrain source, scenario and requirements, verdict, 5 stats, whole-stay timeline, 31-day slip strip, terrain horizon profile, data sources (+ JPL Horizons check when `validation.json` exists), disclaimer, link back to the scenario.
- Visual review of sample PDFs (real terrain from the merged data, and synthetic): fixed text overlapping the warning box and the axis labels before committing.
- Offline single-file preview grows from ~0.7 MB to ~1.4 MB because jsPDF is inlined.

### Merge note
`package.json` `"test"` conflicts with m4-map. Resolve to
`node scripts/crosscheck.mjs && node scripts/test_map.mjs && node scripts/test_brief.mjs`.
Verified on a trial merge of all four branches: all tests and both builds pass.
