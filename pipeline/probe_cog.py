"""Probe the large-area PGDA COGs over HTTP (range reads) instead of downloading GBs.
Reports CRS, size, and whether windowed reads work."""
import os

import numpy as np
import rasterio
from rasterio.windows import Window

os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
os.environ["CPL_VSIL_CURL_ALLOWED_EXTENSIONS"] = ".TIF,.tif,.tiff"
os.environ["GDAL_HTTP_TIMEOUT"] = "120"

BASE = "https://pgda.gsfc.nasa.gov/data"
FILES = [
    f"{BASE}/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF",
    f"{BASE}/LOLA_5mpp/87S/ldem_87s_5mpp.tif",
    f"{BASE}/LOLA_20mpp/LDEM_75S_30MPP_ADJ.TIF",
]

for url in FILES:
    print("=" * 90)
    print(url)
    try:
        with rasterio.open(f"/vsicurl/{url}") as ds:
            print("  driver:", ds.driver, " size:", ds.width, "x", ds.height)
            print("  res:", ds.res, " bounds:", ds.bounds)
            print("  crs:", ds.crs)
            print("  nodata:", ds.nodata, " dtype:", ds.dtypes)
            print("  overviews:", ds.overviews(1))
            print("  block_shapes:", ds.block_shapes)
            w = Window(ds.width // 2, ds.height // 2, 8, 8)
            a = ds.read(1, window=w)
            print("  centre 8x8 sample:", np.nanmin(a), np.nanmax(a), "mean", float(np.nanmean(a)))
    except Exception as e:
        print("  ERROR:", type(e).__name__, e)
