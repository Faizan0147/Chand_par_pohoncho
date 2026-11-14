"""
Terrain horizon mask from a lunar DEM (e.g. a PGDA 5 m site DEM or a LOLA LDEM GeoTIFF).

For each azimuth we walk outwards from the site, sample the DEM, and keep the largest
elevation angle seen. The Moon's curvature is handled exactly (spherical geometry) and
there is no refraction term (no atmosphere).

DEM assumptions: heights in metres relative to the 1737.4 km reference sphere (LOLA LDEM
convention); the GeoTIFF carries its own CRS (polar stereographic on a 1737.4 km sphere).
"""
import numpy as np
import rasterio
from pyproj import Transformer

R_M = 1_737_400.0
SPHERE = f"+proj=longlat +R={R_M} +no_defs"


def _destination(lat, lon, az_deg, dist_m):
    """Great-circle destination on the lunar sphere. All inputs/outputs in degrees/metres."""
    la, lo, az = np.radians(lat), np.radians(lon), np.radians(az_deg)
    d = dist_m / R_M
    la2 = np.arcsin(np.sin(la) * np.cos(d) + np.cos(la) * np.sin(d) * np.cos(az))
    lo2 = lo + np.arctan2(np.sin(az) * np.sin(d) * np.cos(la), np.cos(d) - np.sin(la) * np.sin(la2))
    return np.degrees(la2), (np.degrees(lo2) + 540.0) % 360.0 - 180.0


def _bilinear(arr, rows, cols):
    r0 = np.floor(rows).astype(int)
    c0 = np.floor(cols).astype(int)
    fr, fc = rows - r0, cols - c0
    h, w = arr.shape
    ok = (r0 >= 0) & (c0 >= 0) & (r0 < h - 1) & (c0 < w - 1)
    r0c, c0c = np.clip(r0, 0, h - 2), np.clip(c0, 0, w - 2)
    v = (arr[r0c, c0c] * (1 - fr) * (1 - fc) + arr[r0c, c0c + 1] * (1 - fr) * fc
         + arr[r0c + 1, c0c] * fr * (1 - fc) + arr[r0c + 1, c0c + 1] * fr * fc)
    return np.where(ok, v, np.nan)


def horizon_profile(dem_path, lat, lon, observer_height_m=2.0, n_az=360,
                    max_dist_m=15_000.0, step_m=None):
    """Return elevation angle (deg) of the terrain horizon for n_az azimuths
    (index i = azimuth i*360/n_az, measured clockwise from north). `lon` is east-positive."""
    with rasterio.open(dem_path) as ds:
        dem = ds.read(1).astype("float64")
        if ds.nodata is not None:
            dem[dem == ds.nodata] = np.nan
        inv = ~ds.transform
        px = abs(ds.transform.a)
        to_dem = Transformer.from_crs(SPHERE, ds.crs, always_xy=True)
        lon180 = (lon + 180.0) % 360.0 - 180.0

        x0, y0 = to_dem.transform(lon180, lat)
        c0, r0 = inv * (x0, y0)
        z0 = float(_bilinear(dem, np.array([r0 - 0.5]), np.array([c0 - 0.5]))[0])
        if not np.isfinite(z0):
            raise ValueError("site lies outside the DEM (or on nodata)")
        r_obs = R_M + z0 + observer_height_m

        step = step_m or px
        dists = np.arange(step, max_dist_m + step, step)                  # (m,)
        azs = np.arange(n_az) * 360.0 / n_az                              # (n,)
        A, D = np.meshgrid(azs, dists, indexing="ij")
        la, lo = _destination(lat, lon, A, D)
        x, y = to_dem.transform(lo, la)
        cols, rows = inv * (x, y)
        z = _bilinear(dem, rows - 0.5, cols - 0.5)                        # pixel centres
        theta = D / R_M
        r1 = R_M + z
        ang = np.degrees(np.arctan2(r1 * np.cos(theta) - r_obs, r1 * np.sin(theta)))
        ang = np.where(np.isfinite(ang), ang, -90.0)
        return ang.max(axis=1)
