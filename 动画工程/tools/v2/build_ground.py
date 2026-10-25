"""区域底图的地面烘焙（v2 明亮版，参考投标动画的配色和“空地都有内容”的做法）。

读：素材/01_地理数据/01_长风_全量.geojson（OSM：草地、居住/工业用地、步行道、溪沟），
    素材/13_植被核对/veg_mask_scene.png（Sentinel-2 2025-09-01 NDVI≥0.35 植被掩膜，与本底图逐像素对齐），
    public/city/ 下的 buildings / roads / water / parks / island / site_boundary（场景米制），
    public/v2/landmarks.json 里补充的体块（数据里缺的新建高层，也要避开不种树）。
绿地和树只放在卫星看得到植被的地方（2026-10-23 植被核对后改）。
写：public/v2/ground_day.png、ground_night.png（约1.4米/像素的地面底图）和 public/v2/trees.json（树的位置、大小、色号）。
投影：WGS84 → UTM 49N（自写横轴墨卡托公式，与建模交付的场景坐标一致）。只读本地文件，不联网。
用法：python3 -I tools/v2/build_ground.py
"""
import json, math
from pathlib import Path
import numpy as np
import cv2

HERE = Path(__file__).resolve().parents[2]
CITY = HERE / "public" / "city"
OUT = HERE / "public" / "v2"
OUT.mkdir(parents=True, exist_ok=True)
OSM = HERE.parent / "素材" / "01_地理数据" / "01_长风_全量.geojson"
VEG = HERE.parent / "素材" / "13_植被核对" / "veg_mask_scene.png"
E0, N0 = 634430.0964288089, 4185498.7249752167  # 场景原点：山西大剧院形心（scene_meta.json）

# ---------- 投影 ----------
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
    return E - E0, N0 - Nn  # 场景 x, z

# ---------- 画布 ----------
X0, Z0, SIZE_M, PX = -2600.0, -2300.0, 5600.0, 4096
S = PX / SIZE_M
def px(pts):
    return np.array([[(x - X0) * S, (z - Z0) * S] for x, z in pts], np.float64)
def poly(img, pts, color):
    cv2.fillPoly(img, [np.round(px(pts) * 4).astype(np.int32)], color, lineType=cv2.LINE_AA, shift=2)
def line(img, pts, color, width_m):
    cv2.polylines(img, [np.round(px(pts) * 4).astype(np.int32)], False, color, max(1, int(round(width_m * S))), lineType=cv2.LINE_AA, shift=2)
def mask_poly(m, pts):
    cv2.fillPoly(m, [np.round(px(pts)).astype(np.int32)], 255)
def mask_line(m, pts, width_m):
    cv2.polylines(m, [np.round(px(pts)).astype(np.int32)], False, 255, max(1, int(round(width_m * S))))
hexc = lambda h: tuple(int(h[i:i + 2], 16) for i in (5, 3, 1))  # BGR

# ---------- 数据 ----------
osm = json.load(open(OSM))["features"]
def osm_polys(pred):
    out = []
    for f in osm:
        g, p = f["geometry"], f["properties"]
        if not pred(p): continue
        rings = [g["coordinates"][0]] if g["type"] == "Polygon" else [c[0] for c in g["coordinates"]] if g["type"] == "MultiPolygon" else []
        out += [[utm(lo, la) for lo, la in r] for r in rings]
    return out
def osm_lines(pred):
    return [[utm(lo, la) for lo, la in f["geometry"]["coordinates"]] for f in osm if f["geometry"]["type"] == "LineString" and pred(f["properties"])]

buildings = [poly_ for h, poly_ in json.load(open(CITY / "buildings.json")) if len(poly_) >= 3]
roads = [(f["properties"]["class"], f["geometry"]["coordinates"]) for f in json.load(open(CITY / "roads.json"))["features"]]
water = [f["properties"]["polygon"] for f in json.load(open(CITY / "water.json"))["features"]]
parks = [f["properties"]["polygon"] for f in json.load(open(CITY / "parks.json"))["features"]]
island = json.load(open(CITY / "island.json"))["features"][0]["properties"]["polygon"]
sb = json.load(open(CITY / "site_boundary.json"))["features"][0]
site = sb["properties"].get("polygon") or sb["geometry"]["coordinates"][0]

grass = osm_polys(lambda p: p.get("landuse") in ("grass", "recreation_ground", "allotments"))
resid = osm_polys(lambda p: p.get("landuse") == "residential")
indus = osm_polys(lambda p: p.get("landuse") in ("industrial", "commercial", "retail", "civic_admin", "governmental"))
plaza = osm_polys(lambda p: p.get("highway") == "pedestrian")
owater = osm_polys(lambda p: p.get("natural") == "water")
paths = osm_lines(lambda p: p.get("highway") in ("footway", "cycleway", "pedestrian", "path", "steps"))
streams = osm_lines(lambda p: p.get("waterway") in ("stream", "ditch", "river"))

RW = {"trunk": 26, "primary": 20, "secondary": 14, "tertiary": 8}

# ---------- 占用掩膜：哪里是空地 ----------
occ = np.zeros((PX, PX), np.uint8)
for b in buildings: mask_poly(occ, b)
LM = json.load(open(OUT / "landmarks.json"))
for v in LM.get("supplement", []): mask_poly(occ, v["poly"])
mask_poly(occ, LM["wanxiang"]["poly"])
if "round" in LM:
    rc, rh = LM["round"]["c"], LM["round"]["podium"] / 2
    mask_poly(occ, [[rc[0] - rh, rc[1] - rh], [rc[0] + rh, rc[1] - rh], [rc[0] + rh, rc[1] + rh], [rc[0] - rh, rc[1] + rh]])
occ = cv2.dilate(occ, np.ones((5, 5), np.uint8))
road_m = np.zeros_like(occ)
for c, pts in roads: mask_line(road_m, pts, RW.get(c, 8) + 4)
water_m = np.zeros_like(occ)
for w in water + owater: mask_poly(water_m, w)
for s_ in streams: mask_line(water_m, s_, 4)
green_m = np.zeros_like(occ)
for g in parks + grass: mask_poly(green_m, g)
resid_m = np.zeros_like(occ)
for r in resid: mask_poly(resid_m, r)
site_m = np.zeros_like(occ); mask_poly(site_m, site)
island_m = np.zeros_like(occ); mask_poly(island_m, island)
free = (occ == 0) & (road_m == 0) & (water_m == 0)
dist = cv2.distanceTransform(free.astype(np.uint8), cv2.DIST_L2, 5) / S  # 到最近建筑/道路/水的米数

rng = np.random.default_rng(11)
def vnoise(cells, seed):
    r = np.random.default_rng(seed).random((cells + 1, cells + 1)).astype(np.float32)
    return cv2.resize(r, (PX, PX), interpolation=cv2.INTER_CUBIC)
noise = vnoise(18, 1) * 0.6 + vnoise(55, 2) * 0.4
veg = cv2.imread(str(VEG), 0) > 127
veg10 = cv2.dilate(veg.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) > 0  # 10米内有树冠
east_ok = np.zeros_like(veg); east_ok[:, : int((2700 - X0) * S)] = True  # 东缘缺建筑数据，不当空地处理
# 空地上的草：卫星上是植被、又不在建筑道路水面上的地方；居住区和瑞府地块里是院子，留白
lawn = veg & free & (resid_m == 0) & (site_m == 0) & east_ok
green_real = (green_m > 0) & cv2.dilate(veg.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)  # 公园范围内只涂真有植被的部分（文化岛平台大多是铺装）

# ---------- 白天 ----------
D = {"ground": "#F2F1ED", "resid": "#F6F5F2", "indus": "#EEEDE8", "site": "#F7F6F2", "lawn": "#DCEACB", "lawn2": "#E6EFD9", "green": "#C9E0AE",
     "plaza": "#ECE8E0", "path": "#E8E1D3", "water": "#A3CFEA", "road4": "#E0E3E6", "road3": "#CDD2D6", "road2": "#BCC2C7", "road1": "#A7AEB4", "island": "#F4F1EA"}
def paint(pal, night=False):
    img = np.full((PX, PX, 3), hexc(pal["ground"]), np.uint8)
    for r in resid: poly(img, r, hexc(pal["resid"]))
    for r in indus: poly(img, r, hexc(pal["indus"]))
    poly(img, island, hexc(pal["island"]))
    poly(img, site, hexc(pal["site"]))
    lawn_c = np.where((noise > 0.6)[..., None], np.array(hexc(pal["lawn"]), np.uint8), np.array(hexc(pal["lawn2"]), np.uint8))
    img = np.where(lawn[..., None], lawn_c, img)
    img = np.where(green_real[..., None], np.array(hexc(pal["green"]), np.uint8), img)
    for p_ in plaza: poly(img, p_, hexc(pal["plaza"]))
    for p_ in paths: line(img, p_, hexc(pal["path"]), 2.2)
    if "lampdot" in pal:  # 夜景：文化岛平台和公园的步道灯——沿园路每 9 米一盏暖色灯点，平台四周一圈灯带
        from shapely.geometry import Polygon as _P, Point as _Pt, LineString as _L
        isl_p = _P(island).buffer(30)
        for p_ in paths + [pts for c, pts in roads if c == "tertiary"]:
            ln = _L(p_)
            if not ln.intersects(isl_p) and not any(_P(g).buffer(5).intersects(ln) for g in parks[:2]): continue
            for d in np.arange(0, ln.length, 9.0):
                q = ln.interpolate(d)
                if not isl_p.contains(q) and not any(_P(g).contains(q) for g in parks[:2]): continue
                cx, cz = (q.x - X0) * S, (q.y - Z0) * S
                cv2.circle(img, (int(cx * 4), int(cz * 4)), 7, hexc(pal["lampdot"]), -1, cv2.LINE_AA, 2)
        line(img, island + [island[0]], hexc(pal["lampdot"]), 2.4)
    for w in water + owater: poly(img, w, hexc(pal["water"]))
    for s_ in streams: line(img, s_, hexc(pal["water"]), 4)
    order = [("tertiary", "road4"), ("secondary", "road3"), ("primary", "road2"), ("trunk", "road1")]
    for cls, key in order:
        for c, pts in roads:
            if c != cls: continue
            if "asphalt" in pal:  # 夜景：深色路面 + 两道车流灯带（不是整条路涂亮）
                line(img, pts, hexc(pal["asphalt"]), RW[cls])
                line(img, pts, hexc(pal[key]), max(1.6, RW[cls] * 0.42))
                line(img, pts, hexc(pal["asphalt"]), max(0.8, RW[cls] * 0.12))
            else:
                line(img, pts, hexc(pal[key]), RW[cls])
    return img
cv2.imwrite(str(OUT / "ground_day.png"), paint(D))
NT = {"ground": "#1A2136", "resid": "#1D2439", "indus": "#1E253A", "site": "#222A40", "lawn": "#1B2C2A", "lawn2": "#1A2829", "green": "#1D3330",
      "plaza": "#2C2E3E", "path": "#B88A50", "water": "#1C4F8C", "road4": "#7A5E3A", "road3": "#C9944C", "road2": "#F0B85E", "road1": "#FFD58A", "island": "#252A3E", "asphalt": "#262C40", "lampdot": "#FFD796"}  # 夜景：蓝紫底、金色路网（参考甲方夜景效果图的色调）
cv2.imwrite(str(OUT / "ground_night.png"), paint(NT))

# ---------- 树 ----------
trees = []
def scatter(mask, step, keep, size, seed):
    r = np.random.default_rng(seed)
    for z in np.arange(Z0, Z0 + SIZE_M, step):
        for x in np.arange(X0, X0 + SIZE_M, step):
            jx, jz = x + (r.random() - 0.5) * step * 0.9, z + (r.random() - 0.5) * step * 0.9
            i, j = int((jz - Z0) * S), int((jx - X0) * S)
            if not (0 <= i < PX and 0 <= j < PX) or not mask[i, j]: continue
            if r.random() > keep(i, j): continue
            trees.append([round(jx, 1), round(jz, 1), round(size[0] + r.random() * size[1], 1), int(r.random() * 4)])
tree_free = (occ == 0) & (road_m == 0) & (water_m == 0) & veg & east_ok
isl = island_m.astype(bool)
scatter((green_m > 0) & ~isl & tree_free, 10.0, lambda i, j: 0.3 + 0.55 * noise[i, j], (3.6, 2.8), 3)   # 公园、草地
scatter(lawn & (green_m == 0) & ~isl & tree_free, 14.0, lambda i, j: 0.22 + 0.4 * noise[i, j], (3.4, 2.6), 4)  # 其余植被：卫星上是成片树林的空地也要有树
scatter(isl & tree_free, 13.0, lambda i, j: 0.55, (3.2, 2.0), 5)                                     # 文化岛：只在真有树的地方
# 主干道行道树：两侧、约11米一棵
for c, pts in roads:
    if c not in ("trunk", "primary", "secondary"): continue
    off = RW[c] / 2 + 3.5
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        L = math.hypot(bx - ax, bz - az)
        if L < 1: continue
        ux, uz = (bx - ax) / L, (bz - az) / L
        for t in np.arange(0, L, 12.0):
            for sgn in (-1, 1):
                x, z = ax + ux * t - uz * off * sgn, az + uz * t + ux * off * sgn
                i, j = int((z - Z0) * S), int((x - X0) * S)
                if 0 <= i < PX and 0 <= j < PX and occ[i, j] == 0 and water_m[i, j] == 0 and veg10[i, j]:
                    trees.append([round(x, 1), round(z, 1), 3.0, 1])
json.dump({"trees": trees, "bounds": [X0, Z0, SIZE_M]}, open(OUT / "trees.json", "w"))
print("ok", len(trees), "trees; grass", len(grass), "resid", len(resid), "paths", len(paths), "streams", len(streams))

# ---------- 旧貌（二十多年前）：田块 + 收窄的汾河 ----------
# 依据：素材/04_历史影像 2002-06 Landsat7（长风一带是成片农田，汾河只是一条细线）。田块形状为示意。
old = np.full((PX, PX, 3), hexc("#EFE8D6"), np.uint8)
rr = np.random.default_rng(23)
ang = math.radians(-1.5)
step = 55.0  # 田块约55米一条
for gz in np.arange(Z0 - 600, Z0 + SIZE_M + 600, step):
    for gx in np.arange(X0 - 600, X0 + SIZE_M + 600, step * rr.uniform(2.5, 5.0)):
        w_ = step * rr.uniform(2.5, 5.0); d_ = step * rr.uniform(0.85, 1.0)
        c = ["#E6DBB6", "#DCE2B9", "#E9DFBE", "#D3DDAE", "#E3D6AA", "#E8E2C6"][rr.integers(0, 6)]
        pts = [(gx, gz), (gx + w_ - 6, gz), (gx + w_ - 6, gz + d_ - 5), (gx, gz + d_ - 5)]
        pts = [(x * math.cos(ang) - z * math.sin(ang), x * math.sin(ang) + z * math.cos(ang)) for x, z in pts]
        cv2.fillPoly(old, [np.round(px(pts) * 4).astype(np.int32)], hexc(c), lineType=cv2.LINE_AA, shift=2)
        if rr.random() < 0.5:  # 田垄
            for t in np.arange(8, d_ - 8, 9):
                a, b = (gx + 4, gz + t), (gx + w_ - 10, gz + t)
                a = (a[0] * math.cos(ang) - a[1] * math.sin(ang), a[0] * math.sin(ang) + a[1] * math.cos(ang))
                b = (b[0] * math.cos(ang) - b[1] * math.sin(ang), b[0] * math.sin(ang) + b[1] * math.cos(ang))
                line(old, [a, b], tuple(int(v * 0.93) for v in hexc(c)), 1.6)
# 村庄：几簇小方块屋
for _ in range(26):
    cx, cz = rr.uniform(X0 + 400, X0 + SIZE_M - 400), rr.uniform(Z0 + 400, Z0 + SIZE_M - 400)
    for _ in range(rr.integers(12, 30)):
        x, z = cx + rr.normal(0, 60), cz + rr.normal(0, 45); s_ = rr.uniform(8, 16)
        poly(old, [(x, z), (x + s_, z), (x + s_, z + s_ * 0.7), (x, z + s_ * 0.7)], hexc("#D9D2C4"))
# 汾河：按今天河道的中心线画一条约70米宽的细河，两侧是沙滩
fen_m = np.zeros((PX, PX), np.uint8); mask_poly(fen_m, water[0])
cl = []
for i in range(0, PX, 4):
    xs_ = np.nonzero(fen_m[i])[0]
    if len(xs_): cl.append((xs_.mean() / S + X0, i / S + Z0))
cl_s = [(float(np.mean([p[0] for p in cl[max(0, k - 6):k + 7]])), cl[k][1]) for k in range(len(cl))]
line(old, cl_s, hexc("#E9E1C4"), 190)
line(old, cl_s, hexc("#B5D3E2"), 70)
line(old, [(x - 400, z) for x, z in cl_s], hexc("#E2D9BE"), 9)  # 河西一条土路
# 河东是老城区，二十多年前就已经是城市：河东一侧保留今天的底图
day_img = cv2.imread(str(OUT / "ground_day.png"))
east = np.zeros((PX, PX), bool)
fen_center = []
for (x, z) in cl_s[::25]: fen_center.append([round(z, 1), round(x, 1)])
for i in range(PX):
    zc = i / S + Z0
    k = min(range(len(cl_s)), key=lambda q: abs(cl_s[q][1] - zc))
    xc = cl_s[k][0] + 130
    east[i, max(0, int((xc - X0) * S)):] = True
old = np.where(east[..., None], day_img, old)
LM["fenCenter"] = fen_center
json.dump(LM, open(OUT / "landmarks.json", "w"), ensure_ascii=False)
cv2.imwrite(str(OUT / "ground_old.png"), old)
print("old ok")
