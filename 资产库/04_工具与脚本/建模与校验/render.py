"""Tiny numpy software renderer for QA comparison images (flat Lambert + sky term + shadow map).
Pure numpy: no numba / GPU. Reads GLBs back from disk (never adds cameras or lights to assets)."""
from __future__ import annotations
import json, math, struct
from pathlib import Path
import numpy as np


# ------------------------------------------------------------------ GLB read-back
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def node_matrix(n):
    m = np.eye(4)
    if 'matrix' in n: return np.asarray(n['matrix'], float).reshape(4, 4).T
    s = np.diag(n.get('scale', [1, 1, 1]) + [1])
    r = np.eye(4); r[:3, :3] = quat_mat(n.get('rotation', [0, 0, 0, 1]))
    t = np.eye(4); t[:3, 3] = n.get('translation', [0, 0, 0])
    return t @ r @ s


def read_glb(path):
    """Returns doc, list of dict(node, root, name, material, color, tris(N,3,3) world)."""
    b = Path(path).read_bytes(); jl = struct.unpack('<I', b[12:16])[0]
    doc = json.loads(b[20:20 + jl]); off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]; binary = b[off + 8:off + 8 + bl]
    def acc(i):
        a = doc['accessors'][i]; v = doc['bufferViews'][a['bufferView']]
        dt = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
        k = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        arr = np.frombuffer(binary, dt, a['count'] * k, v.get('byteOffset', 0) + a.get('byteOffset', 0))
        return arr.reshape(-1, k) if k > 1 else arr
    out = []
    def walk(i, M, root):
        n = doc['nodes'][i]; M2 = M @ node_matrix(n)
        if 'mesh' in n:
            for p in doc['meshes'][n['mesh']]['primitives']:
                xyz = acc(p['attributes']['POSITION']).astype(np.float64)
                idx = acc(p['indices']).reshape(-1, 3)
                w = (np.c_[xyz, np.ones(len(xyz))] @ M2.T)[:, :3]
                mat = doc['materials'][p['material']]
                out.append(dict(node=n['name'], root=root, material=mat['name'],
                                color=np.asarray(mat['pbrMetallicRoughness']['baseColorFactor'][:3]), tris=w[idx]))
        for c in n.get('children', []): walk(c, M2, root)
    for r in doc['scenes'][doc.get('scene', 0)]['nodes']:
        walk(r, np.eye(4), doc['nodes'][r]['name'])
    return doc, out


# ------------------------------------------------------------------ rasteriser
def raster(sx, sy, sd, W, H, zbuf, ibuf, id_offset=0, budget=6_000_000):
    """sx,sy (N,3) pixel coords, sd (N,3) depth key (larger = nearer, linear in screen space).
    Updates zbuf/ibuf in place (flattened arrays of size W*H)."""
    x0 = np.floor(sx.min(1)).astype(np.int64); x1 = np.ceil(sx.max(1)).astype(np.int64)
    y0 = np.floor(sy.min(1)).astype(np.int64); y1 = np.ceil(sy.max(1)).astype(np.int64)
    x0 = np.maximum(x0, 0); y0 = np.maximum(y0, 0); x1 = np.minimum(x1, W - 1); y1 = np.minimum(y1, H - 1)
    ok = (x1 >= x0) & (y1 >= y0)
    den = (sy[:, 1] - sy[:, 2]) * (sx[:, 0] - sx[:, 2]) + (sx[:, 2] - sx[:, 1]) * (sy[:, 0] - sy[:, 2])
    ok &= np.abs(den) > 1e-12
    ids = np.nonzero(ok)[0]
    ext = np.maximum(x1 - x0 + 1, y1 - y0 + 1)[ids]
    sizes = 1 << np.ceil(np.log2(np.maximum(ext, 1))).astype(np.int64)
    for S in np.unique(sizes):
        sel = ids[sizes == S]
        if S > 1024:   # very large on-screen triangles: tile them
            for k in sel:
                for ty in range(y0[k], y1[k] + 1, 512):
                    for tx in range(x0[k], x1[k] + 1, 512):
                        _frag(np.array([k]), 512, sx, sy, sd, den, np.array([tx]), np.array([ty]),
                              np.array([min(x1[k], tx + 511)]), np.array([min(y1[k], ty + 511)]), W, zbuf, ibuf, id_offset)
            continue
        chunk = max(1, budget // int(S * S))
        for c in range(0, len(sel), chunk):
            s = sel[c:c + chunk]
            _frag(s, int(S), sx, sy, sd, den, x0[s], y0[s], x1[s], y1[s], W, zbuf, ibuf, id_offset)


def _frag(s, S, sx, sy, sd, den, bx0, by0, bx1, by1, W, zbuf, ibuf, id_offset):
    g = np.arange(S)
    px = bx0[:, None, None] + g[None, None, :]            # (n,1,S)
    py = by0[:, None, None] + g[None, :, None]            # (n,S,1)
    px = np.broadcast_to(px, (len(s), S, S)); py = np.broadcast_to(py, (len(s), S, S))
    inb = (px <= bx1[:, None, None]) & (py <= by1[:, None, None])
    fx = px + 0.5; fy = py + 0.5
    ax, ay = sx[s, 0][:, None, None], sy[s, 0][:, None, None]
    bx, by = sx[s, 1][:, None, None], sy[s, 1][:, None, None]
    cx, cy = sx[s, 2][:, None, None], sy[s, 2][:, None, None]
    d = den[s][:, None, None]
    u = ((by - cy) * (fx - cx) + (cx - bx) * (fy - cy)) / d
    v = ((cy - ay) * (fx - cx) + (ax - cx) * (fy - cy)) / d
    w = 1 - u - v
    m = inb & (u >= -1e-6) & (v >= -1e-6) & (w >= -1e-6)
    if not m.any(): return
    z = u * sd[s, 0][:, None, None] + v * sd[s, 1][:, None, None] + w * sd[s, 2][:, None, None]
    tid = np.broadcast_to(s[:, None, None], m.shape)
    pix = (py * W + px)[m]; zz = z[m]; tt = tid[m]
    order = np.lexsort((-zz, pix))
    pix = pix[order]; zz = zz[order]; tt = tt[order]
    first = np.ones(len(pix), bool); first[1:] = pix[1:] != pix[:-1]
    pix = pix[first]; zz = zz[first]; tt = tt[first]
    better = zz > zbuf[pix]
    zbuf[pix[better]] = zz[better]; ibuf[pix[better]] = tt[better] + id_offset


class Cam:
    def __init__(self, pos, target, vfov_deg, W, H):
        self.pos = np.asarray(pos, float); f = np.asarray(target, float) - self.pos; f /= np.linalg.norm(f)
        r = np.cross(f, [0, 1.0, 0]); r /= np.linalg.norm(r); u = np.cross(r, f)
        self.f, self.r, self.u, self.W, self.H = f, r, u, W, H
        self.fl = (H / 2) / math.tan(math.radians(vfov_deg) / 2)

    def view(self, P):
        d = P - self.pos
        return d @ self.r, d @ self.u, d @ self.f


def clip_near(tris, cam, near=1.0):
    """Clip triangles against the camera near plane (zf >= near)."""
    _, _, zf = cam.view(tris.reshape(-1, 3)); zf = zf.reshape(-1, 3)
    inside = zf >= near; cnt = inside.sum(1)
    keep = tris[cnt == 3]; keep_idx = np.nonzero(cnt == 3)[0]
    extra = []; extra_idx = []
    for k in np.nonzero((cnt > 0) & (cnt < 3))[0]:
        poly = []
        for i in range(3):
            j = (i + 1) % 3; a, b = tris[k, i], tris[k, j]; za, zb = zf[k, i], zf[k, j]
            if za >= near: poly.append(a)
            if (za >= near) != (zb >= near):
                t = (near - za) / (zb - za); poly.append(a + (b - a) * t)
        for i in range(1, len(poly) - 1):
            extra.append([poly[0], poly[i], poly[i + 1]]); extra_idx.append(k)
    if extra:
        return np.concatenate([keep, np.asarray(extra)]), np.concatenate([keep_idx, np.asarray(extra_idx, np.int64)])
    return keep, keep_idx


def render(tris, cols, cam, sun, sky=(0.93, 0.94, 0.95), ss=2, shadow_centre=(330, 0, 900), shadow_ext=700.0, SM=4096,
           haze=2600.0, edges=True):
    tris = np.asarray(tris, np.float64); cols = np.asarray(cols, np.float64)
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]); nl = np.linalg.norm(n, axis=1)
    good = nl > 1e-9; tris, cols, n, nl = tris[good], cols[good], n[good], nl[good]; n /= nl[:, None]
    # ---- shadow map (orthographic along the sun direction)
    L = np.asarray(sun, float); L /= np.linalg.norm(L)
    lr = np.cross(L, [0, 1.0, 0]); lr /= np.linalg.norm(lr); lu = np.cross(lr, L)
    C = np.asarray(shadow_centre, float)
    def lproj(P):
        d = P - C
        return (d @ lr) / shadow_ext * SM / 2 + SM / 2, SM / 2 - (d @ lu) / shadow_ext * SM / 2, d @ L
    sx, sy, sd = lproj(tris.reshape(-1, 3))
    smz = np.full(SM * SM, -1e18); smi = np.full(SM * SM, -1, np.int64)
    raster(sx.reshape(-1, 3), sy.reshape(-1, 3), sd.reshape(-1, 3), SM, SM, smz, smi)
    # ---- camera pass
    W, H = cam.W * ss, cam.H * ss
    ct, cidx = clip_near(tris, cam)
    xr, yu, zf = cam.view(ct.reshape(-1, 3))
    fl = cam.fl * ss
    px = (W / 2 + fl * xr / zf).reshape(-1, 3); py = (H / 2 - fl * yu / zf).reshape(-1, 3); pw = (1.0 / zf).reshape(-1, 3)
    zb = np.full(W * H, -1e18); ib = np.full(W * H, -1, np.int64)
    raster(px, py, pw, W, H, zb, ib)
    img = np.empty((H * W, 3)); img[:] = sky
    hit = np.nonzero(ib >= 0)[0]
    tid = cidx[ib[hit]]
    iy, ix = np.divmod(hit, W)
    z = 1.0 / zb[hit]
    rr = (ix + 0.5 - W / 2) * z / fl; uu = (H / 2 - iy - 0.5) * z / fl
    Pw = cam.pos + rr[:, None] * cam.r + uu[:, None] * cam.u + z[:, None] * cam.f
    nn = n[tid].copy(); flip = np.einsum('ij,ij->i', nn, Pw - cam.pos) > 0; nn[flip] *= -1
    lam = np.clip(nn @ L, 0, 1)
    Q = Pw + nn * 0.25
    qx, qy, qd = lproj(Q)
    acc = np.zeros(len(hit))
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        xi = np.clip(qx.astype(np.int64) + dx, 0, SM - 1); yi = np.clip(qy.astype(np.int64) + dy, 0, SM - 1)
        acc += (qd + 0.15 >= smz[yi * SM + xi])
    lit = acc / 5.0
    skyl = 0.5 + 0.5 * nn[:, 1]
    shade = 0.68 + 0.08 * skyl + 0.30 * lam * lit
    c = cols[tid] * shade[:, None]
    if haze:
        dist = np.linalg.norm(Pw - cam.pos, axis=1); f = (1 - np.exp(-dist / haze)) * 0.55
        c = c * (1 - f[:, None]) + np.asarray(sky) * f[:, None]
    img[hit] = c
    img = img.reshape(H, W, 3)
    if edges:   # subtle outline where the visible triangle's plane changes (illustration look)
        ibg = np.full(H * W, -1, np.int64); ibg[hit] = tid; ibg = ibg.reshape(H, W)
        N = np.zeros((H * W, 3)); N[hit] = nn; N = N.reshape(H, W, 3)
        D = np.full(H * W, 1e9); D[hit] = z; D = D.reshape(H, W)
        e = np.zeros((H, W), bool)
        for a, b in (((slice(1, None), slice(None)), (slice(None, -1), slice(None))), ((slice(None), slice(1, None)), (slice(None), slice(None, -1)))):
            dn = 1 - np.einsum('ijk,ijk->ij', N[a], N[b])
            dd = np.abs(D[a] - D[b]) / np.minimum(D[a], D[b])
            m = (dn > 0.3) | (dd > 0.02)
            e[a] |= m
        img[e] *= 0.86
    from PIL import Image
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8))
    return im.resize((cam.W, cam.H), Image.LANCZOS)
