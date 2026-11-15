"""Is the DEM's periodic ripple real terrain or an artifact? Read RAW pixels (no resampling)
along pixel rows/columns through each site, and test for periodicity.

Also check whether the observer sits on a crest (local maximum) or on a slope.
"""
import os

import numpy as np
import rasterio

DEM = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dem")
SITES = {"connecting-ridge": (-89.4632, 222.510), "shackleton-rim": (-89.7668, 188.130),
         "peak-near-shackleton": (-88.8110, 123.690), "de-gerlache-rim": (-88.6834, 292.070),
         "nobile-rim-1": (-85.4381, 37.367)}

for sid, (lat, lon) in SITES.items():
    p = os.path.join(DEM, f"{sid}.tif")
    if not os.path.exists(p):
        continue
    ds = rasterio.open(p)
    a = ds.read(1).astype("float64")
    px = abs(ds.transform.a)
    h, w = a.shape
    # site is at the tile centre (PGDA tiles are centred on the site)
    r0, c0 = h // 2, w // 2

    print(f"=== {sid}  shape={a.shape} px={px} m   site at pixel ({r0},{c0}) z={a[r0, c0]:.1f}")
    row = a[r0, max(0, c0 - 60):c0 + 60:6]
    print("    raw z along pixel row through site (every 6 px = 30 m), 120 samples:")
    print("      " + " ".join(f"{v:6.0f}" for v in row))
    col = a[max(0, r0 - 60):r0 + 60:6, c0]
    print("      " + " ".join(f"{v:6.0f}" for v in col))

    # periodicity test: detrend a long row and look at the dominant wavelength
    line = a[r0, :] - np.convolve(a[r0, :], np.ones(201) / 201, mode="same")
    spec = np.abs(np.fft.rfft(line * np.hanning(len(line))))
    freqs = np.fft.rfftfreq(len(line), d=px)
    k = int(np.argmax(spec[5:])) + 5
    print(f"    dominant residual wavelength in E-W row: {1/freqs[k]:.0f} m (amplitude {spec[k]/len(line)*2:.1f} m)")

    # is the observer on a crest? compare z0 with the neighbourhood
    win = a[max(0, r0 - 40):r0 + 40, max(0, c0 - 40):c0 + 40]
    print(f"    z0={a[r0, c0]:.1f}; window min {win.min():.0f} max {win.max():.0f} mean {win.mean():.0f} "
          f"-> site at {100*(a[r0, c0] > win.mean()):.0f}th pct of 800 m window")
    ds.close()
    print()
