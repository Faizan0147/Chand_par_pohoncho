"""
Sun and Earth directions in the Moon-fixed mean-Earth/polar-axis (ME) frame.

Data: JPL DE421 (NASA/JPL) via the `de421` PyPI bundle + `jplephem==1.2`.
  - positions: Sun, Moon (geocentric), Earth-Moon barycentre
  - lunar orientation: DE421 physical-libration Euler angles (phi, theta, psi),
    the same quantities NAIF's lunar PCK (moon_pa_de421_*.bpc) is built from.

Frame chain:  ICRF --[psi]3[theta]1[phi]3--> MOON_PA --small constant--> MOON_ME

NOT modelled (all < ~0.01 deg): light-time/aberration, TDB-TT difference.
UTC -> TDB uses TAI-UTC = 37 s (valid since 2017; check if a leap second is added).
"""
import numpy as np
import de421
from jplephem import Ephemeris

_EPH = None
TT_MINUS_UTC_S = 37.0 + 32.184          # seconds
R_MOON_KM = 1737.4
ARCSEC = np.pi / (180.0 * 3600.0)

# MOON_PA -> MOON_ME constant rotation. Magnitudes (67.92", 78.56", 0.30" about axes 3,2,1)
# are from the DE421 frame kernel (moon_080317.tf), written here from memory; their total
# (~104" = 0.029 deg) matches the published PA-ME offset. The SIGN was NOT taken from memory:
# tests/test_geometry.py checks that with PA_TO_ME_SIGN = -1 the 1990-2030 mean sub-Earth point
# lands within ~0.01 deg of lon=0, lat=0 (it is ~0.04 deg off with +1).
# If you load the real NAIF kernels (moon_de440_*.tf + moon_pa_*.bpc) you can drop this.
PA_TO_ME_ARCSEC = (67.92, 78.56, 0.30)
PA_TO_ME_SIGN = -1.0


def eph():
    global _EPH
    if _EPH is None:
        _EPH = Ephemeris(de421)
    return _EPH


def utc_to_tdb_jd(jd_utc):
    return np.asarray(jd_utc, dtype=float) + TT_MINUS_UTC_S / 86400.0


def _rz(a):  # passive rotation about z, vectorised over a -> (n,3,3)
    c, s = np.cos(a), np.sin(a)
    z, o = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([c, s, z], -1), np.stack([-s, c, z], -1), np.stack([z, z, o], -1)], -2)


def _rx(a):
    c, s = np.cos(a), np.sin(a)
    z, o = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([o, z, z], -1), np.stack([z, c, s], -1), np.stack([z, -s, c], -1)], -2)


def _ry(a):
    c, s = np.cos(a), np.sin(a)
    z, o = np.zeros_like(a), np.ones_like(a)
    return np.stack([np.stack([c, z, -s], -1), np.stack([z, o, z], -1), np.stack([s, z, c], -1)], -2)


def pa_to_me_matrix(sign=PA_TO_ME_SIGN):
    a3, a2, a1 = (sign * x * ARCSEC for x in PA_TO_ME_ARCSEC)
    return (_rx(np.array([a1])) @ _ry(np.array([a2])) @ _rz(np.array([a3])))[0]


def icrf_to_pa(jd_tdb):
    phi, theta, psi = eph().position("librations", jd_tdb)
    return _rz(psi) @ _rx(theta) @ _rz(phi)          # (n,3,3)


def moon_frame_vectors(jd_utc, pa_me_sign=PA_TO_ME_SIGN):
    """Return (sun_unit[n,3], earth_km[n,3]) = directions/positions of Sun and Earth
    relative to the Moon's centre, expressed in the MOON_ME frame."""
    jd = utc_to_tdb_jd(jd_utc)
    e = eph()
    moon_geo = e.position("moon", jd).T                         # Earth -> Moon (km, ICRF)
    emb = e.position("earthmoon", jd).T
    sun_ssb = e.position("sun", jd).T
    earth_ssb = emb - moon_geo / (1.0 + e.EMRAT)
    moon_ssb = earth_ssb + moon_geo
    earth_rel = -moon_geo                                       # Moon -> Earth
    sun_rel = sun_ssb - moon_ssb                                # Moon -> Sun
    M = pa_to_me_matrix(pa_me_sign) @ icrf_to_pa(jd)            # ICRF -> ME
    earth_me = np.einsum("nij,nj->ni", M, earth_rel)
    sun_me = np.einsum("nij,nj->ni", M, sun_rel)
    sun_me /= np.linalg.norm(sun_me, axis=1, keepdims=True)
    return sun_me, earth_me


def sub_point_deg(vec):
    """Selenographic (east-positive) longitude, latitude of the sub-point of vec."""
    v = vec / np.linalg.norm(vec, axis=-1, keepdims=True)
    lon = np.degrees(np.arctan2(v[..., 1], v[..., 0]))
    lat = np.degrees(np.arcsin(np.clip(v[..., 2], -1, 1)))
    return lon, lat


def az_el(vec_unit, lat_deg, lon_deg):
    """Azimuth (deg, from north, clockwise toward east) and elevation of a direction
    seen from a surface point (smooth sphere)."""
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.cross(up, east)
    el = np.degrees(np.arcsin(np.clip(vec_unit @ up, -1, 1)))
    az = np.degrees(np.arctan2(vec_unit @ east, vec_unit @ north)) % 360.0
    return az, el, up
