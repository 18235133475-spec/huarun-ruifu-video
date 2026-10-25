"""Camera specs reverse-engineered from 动画工程/src/v2/geo.tsx (makeCamera / axo / eyeCam)
and the per-shot CamSpec constants in open.tsx / ch1.tsx / ch1b.tsx / unitshots.tsx / end.tsx
(read-only sources). Returns (pos, look, vfov_deg) tuples for render.Cam.

Conventions (geo.tsx): bearing az clockwise from north (+z is scene south);
back = [sin(az)*cos(el), sin(el), -cos(az)*cos(el)]; fov = 2*atan(span/2/D);
look is t shifted by screen offsets (sx, sy) at ppm = 1080/span pixels/metre.
"""
from __future__ import annotations
import math
import numpy as np

PAIR = np.array([(146.607 + 204.874) / 2, 0.0, (737.806 + 780.752) / 2])   # geo.tsx PAIR
B02 = np.array([204.874, 0.0, 780.752])


def _dir_of(bearing_deg):
    a = math.radians(bearing_deg)
    return np.array([math.sin(a), 0.0, -math.cos(a)])


def cam_spec(t, az, el, D, span, sx=960, sy=540):
    """geo.tsx makeCamera -> (pos, look, vfov_deg)."""
    t = np.asarray(t, float)
    ce, se = math.cos(math.radians(el)), math.sin(math.radians(el))
    back = _dir_of(az) * ce
    back[1] = se
    f = -back
    r = np.cross(f, [0.0, 1.0, 0.0]); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    ppm = 1080.0 / span
    look = t + r * (-(sx - 960) / ppm) + u * ((sy - 540) / ppm)
    pos = look + back * D
    fov = 2 * math.degrees(math.atan(span / 2 / D))
    return pos, look, fov


def axo_spec(center_xz, az=180, el=60, D=600, span=20, sx=960, sy=540, y=0.4):
    """unitshots.tsx camOf: axo([x, 0.4, z(y)], 180, 60, 600, span, sx, sy)."""
    return cam_spec([center_xz[0], y, center_xz[1] - 17.9], az, el, D, span, sx, sy)


# ---------------- shot table (all values copied from the animation sources) ----------------
def _at(bearing, dist):            # geo.tsx at(): from PAIR
    d = _dir_of(bearing)
    return (PAIR[0] + d[0] * dist, 0.0, PAIR[2] + d[2] * dist)


O9_TG = _at(217.7, 300.0)
SHOTS = {
    # 006 driving rigs (render_compare.py CAMS): (pos, target, vfov)
    'A': ((404, 96, 504), (388, 18, 793), 36.9),
    'B': ((427, 96, 739), (399, 18, 1027), 36.9),
    'C': ((432, 96, 880), (406, 18, 1169), 36.9),
    # O2 top-down (open.tsx TOP0 -> TOP1; mid point of the move)
    'O2': cam_spec([177.5, 0, 965], 180, 74, 24000, 790, sy=560),
    # O4 from 2号楼 roof towards 和园 then 晋阳湖 (ch1.tsx B1K0)
    'O4': cam_spec([-55, 0, 1050], 44, 17, 378, 300, sy=600),
    # O5 thirds (ch1.tsx): north look, roof look at fen river, plaza end (B2K1)
    'O5_N': cam_spec([234.87, 30, 840.75], 0, 34, 620, 330, sy=620),
    'O5_R': cam_spec([420, 0, 440], 212, 14, 480, 400, sy=560),
    'O5_END': cam_spec([70, 6, 60], 172, 21, 760, 560, sy=560),
    # O7 facade dive end (open.tsx FAC1)
    'O7': cam_spec([PAIR[0] + 10, 56, PAIR[1]], 226, 13, 620, 330),
    # O9 dusk golden line, mid keyframe (ch1b.tsx k1)
    'O9': cam_spec(O9_TG, 36, 16, 700, 520, sy=650),
    # P2 island intro end (ch1b.tsx ISL)
    'P2': cam_spec([70, 0, 20], 160, 46, 24000, 1050, sy=560),
    # Q1 two eyes (ch1b.tsx TIERS, eyeCam convention: pos/look/fov directly)
    'Q1_LOW': ((152, 20, 842), (-70, 6, 1085), 58.0),
    'Q1_HIGH': ((188, 104, 806), (-2600, 60, 3200), 58.0),
    # Q2 (unitshots.tsx Q2K)
    'Q2': cam_spec([B02[0] + 6, 50, B02[2] - 10], 232, 24, 340, 150, sx=640, sy=560),
    # S1 dusk growth (end.tsx E1K0, SITE=[170,1120])
    'S1': cam_spec([170, 20, 1120], 236, 26, 1500, 820, sy=600),
    # S2 pair close (end.tsx S2K0 -> S2K1 mid)
    'S2': cam_spec([PAIR[0] - 10, 40, PAIR[1] + 30], 154, 60, 975, 365, sx=720, sy=560),
    # T2 night aerial end (end.tsx N2K1), rendered day
    'T2': cam_spec([60, 40, 760], 128, 17, 1500, 820, sy=600),
}

# package F unit views (unitshots.tsx camOf + section 7.F): az 180, el 60, D 600, north-up
UNIT_VIEWS = {
    'Q3_entry': ((9.4, 7.9), 6.8, 960, 545),
    'R4_dining': ((15.8, 7.2), 13.0, 880, 545),
    'R5_ne': ((19.0, 5.2), 12.5, 860, 545),
    'R8_master': ((4.6, 10.0), 16.5, 900, 545),
    'whole': ((11.4, 8.95), 21.5, 960, 540),
}

# reference frames (任务书/HR-VIDEO-TASK-007_参考帧) for the F left panels
UNIT_REFS = {
    'Q3_entry': 'Q3_b_3m45.1s.jpg',
    'R4_dining': 'R4_b_4m42.8s.jpg',
    'R5_ne': 'R5_b_4m57.1s.jpg',
    'R8_master': 'R8_b_5m32.7s.jpg',
    'whole': 'R1_a_3m58.1s.jpg',
}
