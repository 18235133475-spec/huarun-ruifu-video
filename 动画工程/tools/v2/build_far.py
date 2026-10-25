"""远景底图：把区域底图向西南扩到晋阳湖（B1 远眺晋阳湖用）。

读：模型/city/source/3dglobfp/ 下两块 3D-GloBFP 原始瓦片（CC BY 4.0，建模交付时已下载，只读），
    素材/14_远景地理/ 下的 OSM 数据（Overpass 公开接口取得，© OpenStreetMap，ODbL）：
      lake.json：晋阳湖 relation 6748970；far.json：远景范围内的道路、水面、公园、用地。
写：public/v2/far_buildings.json（近景城市数据范围以外的建筑：场景米制轮廓 + 高度）、
    public/v2/far_day.png、far_night.png（10 公里见方、约 2.4 米/像素的远景地面）、public/v2/far_meta.json。
用法：python3 tools/v2/build_far.py（需要 shapely；只读本地文件，不联网）
"""
import json, math, sys
from pathlib import Path
import numpy as np
import cv2

HERE = Path(__file__).resolve().parents[2]
VID = HERE.parent
sys.path.insert(0, str(VID / "模型" / "源文件"))
from shapefile_stdlib import iter_crop_records  # noqa: E402  建模交付的只读读取器
from shapely.geometry import Polygon  # noqa: E402

OUT = HERE / "public" / "v2"
E0, N0 = 634430.0964288089, 4185498.7249752167

def utm(lon, lat, zone=49):
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    lam0 = math.radians(zone * 6 - 183)
    phi, lam = math.radians(lat), math.radians(lon)
    N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    T = math.tan(phi) ** 2; C = ep2 * math.cos(phi) ** 2; A = math.cos(phi) * (lam - lam0)
    M = a * ((1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256) * phi - (3 * e2 / 8 + 3 * e2**2 / 32 + 45 * e2**3 / 1024) * math.sin(2 * phi)
             + (15 * e2**2 / 256 + 45 * e2**3 / 1024) * math.sin(4 * phi) - (35 * e2**3 / 3072) * math.sin(6 * phi))
    E = 500000 + k0 * N * (A + (1 - T + C) * A**3 / 6 + (5 - 18 * T + T**2 + 72 * C - 58 * ep2) * A**5 / 120)
    Nn = k0 * (M + N * math.tan(phi) * (A**2 / 2 + (5 - T + 9 * C + 4 * C**2) * A**4 / 24 + (61 - 58 * T + T**2 + 600 * C - 330 * ep2) * A**6 / 720))
    return E - E0, N0 - Nn

# 远景范围（场景米）和近景城市数据已覆盖的范围
X0, Z0, SIZE = -10000.0, -8000.0, 18000.0  # 2026-10-23 扩到北侧和东侧，B4 全城视角不留空白
NEAR = (-2600, 2900, -2300, 3300)  # 近景 buildings.json 的范围，里面的楼不重复取
BBOX = (112.41, 37.71, 112.64, 37.88)  # 经纬度

# ---------- 建筑 ----------
blds = []
for tile in (VID / "模型" / "city" / "source" / "3dglobfp").glob("*/*.shp"):
    stats = {}
    for rec, props, g, err in iter_crop_records(tile, BBOX, stats):
        if err or g is None or not g.is_valid: continue
        h = props.get("Height")
        if h is None or not math.isfinite(h) or h <= 3: continue
        for part in (g.geoms if g.geom_type == "MultiPolygon" else [g]):
            ring = [utm(lo, la) for lo, la in part.exterior.coords]
            cx = sum(p[0] for p in ring) / len(ring); cz = sum(p[1] for p in ring) / len(ring)
            if not (X0 <= cx <= X0 + SIZE and Z0 <= cz <= Z0 + SIZE): continue
            if NEAR[0] <= cx <= NEAR[1] and NEAR[2] <= cz <= NEAR[3]: continue
            p = Polygon(ring)
            if p.area < 60: continue
            p = p.simplify(2.0) if p.area > 1500 else p.minimum_rotated_rectangle  # 远景小楼用外接矩形，控制面数
            if p.is_empty or p.geom_type != "Polygon": continue
            blds.append([round(float(h), 1), [[round(x, 1), round(z, 1)] for x, z in list(p.exterior.coords)[:-1]]])
print("far buildings", len(blds))
# 直接写成合并好的三角网（位置 + 法线，float32），前端不用再逐栋挤出
from shapely.ops import triangulate
pos, nor = [], []
def tri(a, b, c, n):
    pos.extend([*a, *b, *c]); nor.extend([*n, *n, *n])
for h, poly in blds:
    pg = Polygon(poly).buffer(0)
    if pg.is_empty or pg.geom_type != "Polygon": continue
    ring = list(pg.exterior.coords)[:-1]
    if Polygon(ring).exterior.is_ccw: ring = ring[::-1]
    y0, y1 = -1.6, -1.6 + h
    for i in range(len(ring)):
        (ax, az), (bx, bz) = ring[i], ring[(i + 1) % len(ring)]
        dx, dz = bx - ax, bz - az; L = math.hypot(dx, dz) or 1
        n = (dz / L, 0.0, -dx / L)
        A, B, C, D = (ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)
        tri(A, C, B, n); tri(A, D, C, n)
    for t_ in triangulate(pg):
        if not pg.contains(t_.representative_point()): continue
        cs = list(t_.exterior.coords)[:3]
        a_, b_, c_ = [(x, y1, z) for x, z in cs]
        cross = (b_[0] - a_[0]) * (c_[2] - a_[2]) - (b_[2] - a_[2]) * (c_[0] - a_[0])
        tri(a_, b_, c_, (0, 1, 0)) if cross < 0 else tri(a_, c_, b_, (0, 1, 0))
np.array(pos, np.float32).tofile(OUT / "far_city_pos.bin"); np.array(nor, np.float32).tofile(OUT / "far_city_nor.bin")
print("far triangles", len(pos) // 9)

# ---------- 地面 ----------
PX = 4096; S = PX / SIZE
def px(pts): return np.round(np.array([[(x - X0) * S * 4, (z - Z0) * S * 4] for x, z in pts])).astype(np.int32)
hexc = lambda h: tuple(int(h[i:i + 2], 16) for i in (5, 3, 1))
far = json.load(open(VID / "素材" / "14_远景地理" / "far.json"))["elements"] + json.load(open(VID / "素材" / "14_远景地理" / "wide.json"))["elements"]
lake = json.load(open(VID / "素材" / "14_远景地理" / "lake.json"))["elements"][0]

def rings(role):
    """把 multipolygon 的同角色成员首尾拼成闭合环"""
    segs = [[(g["lon"], g["lat"]) for g in m["geometry"]] for m in lake["members"] if m.get("role") == role and "geometry" in m]
    out = []
    while segs:
        r = segs.pop(0)
        while r[0] != r[-1]:
            for i, s in enumerate(segs):
                if s[0] == r[-1]: r += s[1:]; segs.pop(i); break
                if s[-1] == r[-1]: r += s[::-1][1:]; segs.pop(i); break
            else: break
        out.append([utm(lo, la) for lo, la in r])
    return out
lake_outer, lake_inner = rings("outer"), rings("inner")
json.dump({"bounds": [X0, Z0, SIZE], "lake": {"outer": [[[round(x, 1), round(z, 1)] for x, z in r] for r in lake_outer],
           "inner": [[[round(x, 1), round(z, 1)] for x, z in r] for r in lake_inner]}}, open(OUT / "far_meta.json", "w"))

RW = {"motorway": 30, "trunk": 26, "primary": 20, "secondary": 14, "tertiary": 9}
def paint(pal):
    img = np.full((PX, PX, 3), hexc(pal["ground"]), np.uint8)
    for e in far:
        t = e.get("tags", {}); g = e.get("geometry")
        if not g: continue
        pts = [utm(p["lon"], p["lat"]) for p in g]
        if t.get("landuse") in ("residential",): cv2.fillPoly(img, [px(pts)], hexc(pal["resid"]), cv2.LINE_AA, 2)
        if t.get("leisure") == "park" or t.get("landuse") in ("grass", "farmland", "allotments", "meadow", "forest"): cv2.fillPoly(img, [px(pts)], hexc(pal["green"]), cv2.LINE_AA, 2)
    for e in far:
        t = e.get("tags", {}); g = e.get("geometry")
        if g and t.get("natural") == "water": cv2.fillPoly(img, [px([utm(p["lon"], p["lat"]) for p in g])], hexc(pal["water"]), cv2.LINE_AA, 2)
    cv2.fillPoly(img, [px(r) for r in lake_outer], hexc(pal["water"]), cv2.LINE_AA, 2)
    cv2.fillPoly(img, [px(r) for r in lake_inner], hexc(pal["green"]), cv2.LINE_AA, 2)
    for cls in ("tertiary", "secondary", "primary", "trunk", "motorway"):
        for e in far:
            t = e.get("tags", {}); g = e.get("geometry")
            if g and t.get("highway") == cls:
                q = [px([utm(p["lon"], p["lat"]) for p in g])]
                if "asphalt" in pal:  # 夜景：深色路面 + 车流灯带
                    cv2.polylines(img, q, False, hexc(pal["asphalt"]), max(1, int(RW[cls] * S)), cv2.LINE_AA, 2)
                    cv2.polylines(img, q, False, hexc(pal[cls]), max(1, int(RW[cls] * 0.45 * S)), cv2.LINE_AA, 2)
                else:
                    cv2.polylines(img, q, False, hexc(pal[cls]), max(1, int(RW[cls] * S)), cv2.LINE_AA, 2)
    return img
DAY = {"ground": "#F2F1ED", "resid": "#F6F5F2", "green": "#D3E5BD", "water": "#A3CFEA",
       "tertiary": "#E0E3E6", "secondary": "#CDD2D6", "primary": "#BCC2C7", "trunk": "#A7AEB4", "motorway": "#A7AEB4"}
NIGHT = {"ground": "#1A2136", "resid": "#1D2439", "green": "#1D3330", "water": "#1C4F8C", "asphalt": "#262C40",
         "tertiary": "#6E5636", "secondary": "#B8874A", "primary": "#E8B05C", "trunk": "#FFD58A", "motorway": "#FFD58A"}
cv2.imwrite(str(OUT / "far_day.png"), paint(DAY))
cv2.imwrite(str(OUT / "far_night.png"), paint(NIGHT))
lx = [p[0] for r in lake_outer for p in r]; lz = [p[1] for r in lake_outer for p in r]
print("lake x", round(min(lx)), round(max(lx)), "z", round(min(lz)), round(max(lz)))
