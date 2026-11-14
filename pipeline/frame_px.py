"""Decisive frame test: the PGDA 5 m/px site tiles and the 20 m/px 80-90S mosaic overlap.
Cross-correlate them. Zero shift => same frame & longitude convention.
A constant lon shift => different frames (e.g. IAU30135 Moon2015 vs MOON_ME).

Inputs: the original PGDA 5 m/px site tiles, not the 20 m/px crops that
pipeline/fetch_dems.py writes into pipeline/dem/. Re-download the tiles from the
SiteNN URLs in docs/M1-STATUS.md to re-run this check.
"""
import os

import numpy as np
import rasterio
from rasterio.windows import Window

os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
os.environ["GDAL_HTTP_TIMEOUT"] = "120"

HERE = os.path.dirname(os.path.abspath(__file__))
MOSAIC = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"

mos = rasterio.open(MOSAIC)

for sid in ("connecting-ridge", "de-gerlache-rim", "nobile-rim-1"):
    t = rasterio.open(os.path.join(HERE, "dem", f"{sid}.tif"))
    tx = t.transform.c + t.width * t.transform.a / 2
    ty = t.transform.f + t.height * t.transform.e / 2
    mrow, mcol = mos.index(tx, ty)

    # same physical footprint from both: 12 km square centred on the site
    half = 6000
    n20 = int(2 * half / mos.res[0])          # mosaic pixels
    n5 = int(2 * half / t.res[0])              # tile pixels
    mwin = Window(mcol - n20 // 2, mrow - n20 // 2, n20, n20)
    m = mos.read(1, window=mwin)
    trow, tcol = t.index(tx, ty)
    t5 = t.read(1, window=Window(tcol - n5 // 2, trow - n5 // 2, n5, n5))
    t5 = t5.reshape(n20, 4, n20, 4).mean(axis=(1, 3)) if False else t5[::4, ::4]

    print(f"\n{sid}: mosaic {m.shape} tile/dec {t5.shape}")
    if m.shape != t5.shape:
        print("   shape mismatch, skip")
        continue
    d = m - t5
    print(f"   zero-shift: mean {np.nanmean(d):7.2f} m  rms {np.nanstd(d):7.2f}  "
          f"max|d| {np.nanmax(np.abs(d)):7.1f}")

    best = None
    for dr in range(-30, 31, 3):
        for dc in range(-30, 31, 3):
            a = m[max(0, dr):m.shape[0] + min(0, dr), max(0, dc):m.shape[1] + min(0, dc)]
            b = t5[max(0, -dr):t5.shape[0] + min(0, -dr), max(0, -dc):t5.shape[1] + min(0, -dc)]
            if a.shape != b.shape or a.size < 5000:
                continue
            v = float(np.nanstd(a - b))
            if best is None or v < best[0]:
                best = (v, dr * mos.res[1], dc * mos.res[0])
    print(f"   best shift: dY={best[1]:+.0f} m dX={best[2]:+.0f} m  rms {best[0]:.2f} m "
          f"(= {best[1]/mos.res[1]:+.1f} px Y, {best[2]/mos.res[0]:+.1f} px X)")
    t.close()
mos.close()
