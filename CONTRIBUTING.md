# Contributing

Read `AGENT.md` and your `milestones/Mx.md` first.

- Never commit to `main` directly. Branch per module: `m1-terrain`, `m2-validation`, `m3-polish`, `m4-map`. Open a small PR, get one review, merge within a day. CI (`npm test` + build) runs on every PR.
- Ownership: only the M1 owner regenerates/commits `public/data/*.json` (Git cannot merge them). Put new features in new files, with their own CSS. Do not edit another module's files.
- Contracts: never rename URL params (`d, slip, len, bat, earth, sites`) or `sites.json` fields; only add. New data goes in new JSON files.
- Never commit DEM `.tif` files (share via Drive) or `.bak` files.
- Do not show synthetic data as real, and do not invent numbers.
- Daily 10-min check-in; feature freeze once slip + compare work on real terrain.
