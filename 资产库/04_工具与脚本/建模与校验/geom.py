"""Flat-shaded solid primitives for pilot_o1. Every face gets its own vertices and an
explicit outward normal; winding is checked against that normal, so no back-facing or
inverted triangles reach the GLB."""
from __future__ import annotations
import math
import numpy as np
import mapbox_earcut
from shapely.geometry import Polygon, MultiPolygon, GeometryCollection
from shapely.geometry.polygon import orient


class Parts:
    """Accumulates triangles per material slot."""
    def __init__(self):
        self.d = {}

    def _add(self, slot, pts, nrm, faces):
        if slot is None or not len(faces): return
        P, N, F = self.d.setdefault(slot, ([], [], []))
        off = sum(len(p) for p in P)
        P.append(np.asarray(pts, np.float64)); N.append(np.asarray(nrm, np.float64)); F.append(np.asarray(faces, np.int64) + off)

    def quad(self, slot, a, b, c, d):
        """a,b,c,d counter-clockwise when seen from the outside."""
        a, b, c, d = (np.asarray(p, np.float64) for p in (a, b, c, d))
        n = np.cross(b - a, c - a) + np.cross(c - a, d - a)
        ln = np.linalg.norm(n)
        if ln < 1e-12: return
        n /= ln
        self._add(slot, [a, b, c, d], [n] * 4, [[0, 1, 2], [0, 2, 3]])

    def tri(self, slot, a, b, c):
        a, b, c = (np.asarray(p, np.float64) for p in (a, b, c))
        n = np.cross(b - a, c - a); ln = np.linalg.norm(n)
        if ln < 1e-12: return
        self._add(slot, [a, b, c], [n / ln] * 3, [[0, 1, 2]])

    def merge(self, other, transform=None):
        for slot, (P, N, F) in other.d.items():
            pts = np.vstack(P); nrm = np.vstack(N); ff = np.vstack(F)
            if transform is not None:
                pts, nrm = transform(pts, nrm)
            self._add(slot, pts, nrm, ff)

    def arrays(self):
        out = {}
        for slot, (P, N, F) in self.d.items():
            xyz = np.vstack(P); nrm = np.vstack(N); ff = np.vstack(F)
            # final winding/degeneracy guard after float32 storage
            x32 = xyz.astype('<f4').astype(np.float64)
            cr = np.cross(x32[ff[:, 1]] - x32[ff[:, 0]], x32[ff[:, 2]] - x32[ff[:, 0]])
            keep = np.linalg.norm(cr, axis=1) > 1e-10
            ff = ff[keep]; cr = cr[keep]
            rev = np.einsum('ij,ij->i', cr, nrm[ff].mean(axis=1)) < 0
            ff[rev] = ff[rev][:, [0, 2, 1]]
            out[slot] = (xyz.astype('<f4'), nrm.astype('<f4'), ff.astype('<u4'))
        return out

    def count(self):
        return sum(sum(len(f) for f in F) for _, _, F in self.d.values())


FACES = ('px', 'nx', 'py', 'ny', 'pz', 'nz')


def _mats(m):
    if isinstance(m, dict):
        default = m.get('*')
        return {f: m.get(f, default) for f in FACES}
    return {f: m for f in FACES}


def box(parts, x0, x1, y0, y1, z0, z1, mat):
    """Axis-aligned box; mat is a slot name or {'px':..,'*':default}; None skips a face."""
    if x1 - x0 < 1e-6 or y1 - y0 < 1e-6 or z1 - z0 < 1e-6: return
    m = _mats(mat)
    parts.quad(m['px'], (x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1))
    parts.quad(m['nx'], (x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0))
    parts.quad(m['py'], (x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0))
    parts.quad(m['ny'], (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1))
    parts.quad(m['pz'], (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))
    parts.quad(m['nz'], (x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0))


def obox(parts, cx, cz, yaw_dir, length, width, y0, y1, mat, along_offset=0.0):
    """Box centred at (cx,cz) whose 'length' axis follows unit direction yaw_dir=(dx,dz)."""
    dx, dz = yaw_dir; nx, nz = -dz, dx
    hl, hw = length / 2, width / 2
    c = np.array([cx + dx * along_offset, cz + dz * along_offset])
    corners = [c + np.array([dx, dz]) * a + np.array([nx, nz]) * b for a, b in ((-hl, -hw), (hl, -hw), (hl, hw), (-hl, hw))]
    prism(parts, Polygon(corners), y0, y1, mat if not isinstance(mat, dict) else mat.get('side'),
          mat if not isinstance(mat, dict) else mat.get('top'), mat if not isinstance(mat, dict) else mat.get('bottom'))


def polys(g):
    if g is None or g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)):
        return [p for q in g.geoms for p in polys(q)]
    return []


def prism(parts, poly, y0, y1, side, top, bottom=None, min_area=1e-4):
    """Extrude a shapely polygon (x,z) between y0 and y1."""
    for p in polys(poly):
        if p.area < min_area: continue
        p = orient(p, sign=1)
        rings = [np.asarray(p.exterior.coords[:-1], np.float64)] + [np.asarray(r.coords[:-1], np.float64) for r in p.interiors]
        rings = [r for r in rings if len(r) >= 3]
        coords = np.vstack(rings); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        tri = np.asarray(mapbox_earcut.triangulate_float64(coords, ends)).reshape(-1, 3)
        for slot, yy, normal in ((top, y1, (0, 1, 0)), (bottom, y0, (0, -1, 0))):
            if slot is None: continue
            pts = np.column_stack([coords[:, 0], np.full(len(coords), yy), coords[:, 1]])
            ff = tri.copy()
            a = pts[ff[:, 0]]; b = pts[ff[:, 1]]; c = pts[ff[:, 2]]
            flip = np.cross(b - a, c - a) @ np.asarray(normal, float) < 0
            ff[flip] = ff[flip][:, [0, 2, 1]]
            parts._add(slot, pts, np.tile(normal, (len(pts), 1)), ff)
        if side is None: continue
        for ring in rings:
            n = len(ring)
            for i in range(n):
                a = ring[i]; b = ring[(i + 1) % n]
                if np.hypot(*(b - a)) < 1e-6: continue
                # CCW exterior (in x,z with shapely sign=1) -> outward normal = (dz,-dx)? test by quad cross
                q = [(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])]
                d = b - a; out = np.array([d[1], 0, -d[0]])  # right-hand normal of CCW ring in x/z plane
                # for interior rings (CW after orient) the same formula points into the hole = outward of solid
                qa = np.asarray(q); nrm = np.cross(qa[1] - qa[0], qa[2] - qa[0])
                if nrm @ out < 0: q = q[::-1]
                parts.quad(side, *q)


def ngon(parts, cx, cz, r, y0, y1, mat, n=8, r_top=None, sx=1.0, dirv=(1.0, 0.0), top=True, bottom=False):
    """Vertical n-gon prism / frustum, optionally stretched by sx along dirv."""
    r_top = r if r_top is None else r_top
    dx, dz = dirv; nx, nz = -dz, dx
    def ring(rr, y):
        out = []
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n
            u = math.cos(a) * rr * sx; v = math.sin(a) * rr
            out.append((cx + dx * u + nx * v, y, cz + dz * u + nz * v))
        return out
    lo = ring(r, y0); hi = ring(r_top, y1)
    # make sure ring order is CCW seen from above (+y): signed area in x/z
    area = sum(lo[i][0] * lo[(i + 1) % n][2] - lo[(i + 1) % n][0] * lo[i][2] for i in range(n))
    if area > 0:
        lo = lo[::-1]; hi = hi[::-1]
    for i in range(n):
        j = (i + 1) % n
        a, b, c, d = lo[i], lo[j], hi[j], hi[i]
        cen = np.array([cx, (y0 + y1) / 2, cz])
        q = [a, b, c, d]
        qa = np.asarray(q); nrm = np.cross(qa[1] - qa[0], qa[2] - qa[0])
        if nrm @ (qa.mean(0) - cen) < 0: q = q[::-1]
        parts.quad(mat, *q)
    topm = mat if top is True else (top or None)
    if topm:
        for i in range(1, n - 1):
            parts.tri(topm, *(sorted_up(hi[0], hi[i], hi[i + 1], +1)))
    if bottom:
        for i in range(1, n - 1):
            parts.tri(mat, *(sorted_up(lo[0], lo[i], lo[i + 1], -1)))


def sorted_up(a, b, c, sign):
    n = np.cross(np.subtract(b, a), np.subtract(c, a))
    return (a, b, c) if n[1] * sign > 0 else (a, c, b)


def beam(parts, p0, p1, w, h, mat):
    """Square-ish bar from p0 to p1 (3D), cross-section w (horizontal) x h (vertical-ish)."""
    p0 = np.asarray(p0, float); p1 = np.asarray(p1, float); d = p1 - p0; L = np.linalg.norm(d)
    if L < 1e-6: return
    t = d / L; up = np.array([0, 1.0, 0])
    s = np.cross(t, up)
    if np.linalg.norm(s) < 1e-6: s = np.array([1.0, 0, 0])
    s /= np.linalg.norm(s); u = np.cross(s, t)
    hw, hh = w / 2, h / 2
    def corners(p):
        return [p - s * hw - u * hh, p + s * hw - u * hh, p + s * hw + u * hh, p - s * hw + u * hh]
    A = corners(p0); B = corners(p1)
    cen = (p0 + p1) / 2
    for i in range(4):
        j = (i + 1) % 4
        q = [A[i], A[j], B[j], B[i]]
        qa = np.asarray(q); nrm = np.cross(qa[1] - qa[0], qa[2] - qa[0])
        if nrm @ (qa.mean(0) - cen) < 0: q = q[::-1]
        parts.quad(mat, *q)
    for cap, sgn in ((A, -1), (B, 1)):
        q = list(cap); qa = np.asarray(q); nrm = np.cross(qa[1] - qa[0], qa[2] - qa[0])
        if nrm @ (t * sgn) < 0: q = q[::-1]
        parts.quad(mat, *q)
