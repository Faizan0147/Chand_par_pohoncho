"""
Verify the MOON_PA -> MOON_ME constant rotation used in ephemeris.py against NAIF's
real frame kernel (moon_080317.tf, the DE421 lunar reference frame kernel).

Needs:  pip install spiceypy
Kernels (auto-downloaded into pipeline/kernels/ on first run, NAIF public data):
  https://naif.jpl.nasa.gov/pub/naif/LADEE/kernels/fk/moon_080317.tf                 (21 KB, committed)
  https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc (1.7 MB, git-ignored)

Run:  python pipeline/check_frame.py
Exit 0 when ephemeris.py matches the kernel (to 0.01 arcsec), 1 otherwise.
"""
import os
import sys
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ephemeris import PA_TO_ME_ARCSEC, PA_TO_ME_SIGN, pa_to_me_matrix  # noqa: E402

KERNEL_DIR = os.path.join(HERE, "kernels")
TF = os.path.join(KERNEL_DIR, "moon_080317.tf")
BPC = os.path.join(KERNEL_DIR, "moon_pa_de421_1900-2050.bpc")
SOURCES = {
    TF: "https://naif.jpl.nasa.gov/pub/naif/LADEE/kernels/fk/moon_080317.tf",
    BPC: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc",
}


def ensure_kernels():
    """Download any missing NAIF kernel. Returns a list of paths that could not be fetched."""
    failed = []
    for path, url in SOURCES.items():
        if os.path.exists(path):
            continue
        os.makedirs(KERNEL_DIR, exist_ok=True)
        try:
            urllib.request.urlretrieve(url, path)
            print(f"downloaded {os.path.basename(path)}")
        except OSError as e:
            print(f"could not download {url}: {e}")
            if os.path.exists(path):
                os.remove(path)
            failed.append(path)
    return failed


def rot_angle_deg(ra, rb):
    """Angle of the rotation that takes matrix ra to matrix rb."""
    c = np.clip((np.trace(ra.T @ rb) - 1.0) / 2.0, -1.0, 1.0)
    return np.degrees(np.arccos(c))


def main():
    missing = ensure_kernels()
    if missing:
        print("MISSING KERNEL(S): " + ", ".join(missing))
        print("Download them from NAIF (URLs in the docstring) and rerun.")
        return 1
    try:
        import spiceypy as sp
    except ImportError:
        print("spiceypy not installed:  pip install spiceypy")
        return 1

    sp.furnsh(BPC)
    sp.furnsh(TF)

    # Constant rotation, so any epoch works; use a couple inside the app's date range.
    ets = [0.0, 816672000.0, 831446400.0]          # 2000, 2026-01, 2027-01 (ET seconds past J2000)
    errs = []
    for et in ets:
        spice_pa2me = sp.sxform("MOON_PA_DE421", "MOON_ME_DE421", et)[:3, :3]   # x_ME = M x_PA
        for sign in (-1.0, +1.0):
            ours = pa_to_me_matrix(sign)
            errs.append((et, sign, rot_angle_deg(ours, spice_pa2me)))
    worst = {s: max(e[2] for e in errs if e[1] == s) for s in (-1.0, +1.0)}

    print(f"kernel constants : {PA_TO_ME_ARCSEC} arcsec about axes (3, 2, 1)  [moon_080317.tf]")
    print(f"ephemeris.py     : PA_TO_ME_ARCSEC = {PA_TO_ME_ARCSEC}, sign = {PA_TO_ME_SIGN}")
    print(f"worst |ours - SPICE| with sign -1 : {worst[-1.0] * 3600:.4f} arcsec")
    print(f"worst |ours - SPICE| with sign +1 : {worst[+1.0] * 3600:.4f} arcsec")

    # Euler angles of our matrix in the kernel's (3, 2, 1) arcsec convention, for the record.
    R = pa_to_me_matrix(PA_TO_ME_SIGN)
    a3 = np.degrees(np.arctan2(R[1, 0], R[0, 0]))          # about axis 3
    a2 = np.degrees(np.arcsin(np.clip(-R[2, 0], -1, 1)))    # about axis 2
    a1 = np.degrees(np.arctan2(R[2, 1], R[2, 2]))           # about axis 1
    print(f"our matrix as (3,2,1) Euler        : ({a3 * 3600:+.3f}, {a2 * 3600:+.3f}, {a1 * 3600:+.3f}) arcsec")

    ok = worst[PA_TO_ME_SIGN] < 0.01 / 3600                 # match to 0.01 arcsec
    print("\nPASS frame offset matches NAIF kernel" if ok else "\nFAIL frame offset does NOT match the kernel")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
