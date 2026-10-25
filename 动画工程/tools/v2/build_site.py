"""瑞府小区内的园林地面：照甲方总平面（只读参考）大致分出草坪、铺装、园路、消防车道和树，再用本片的扁平配色重画。
不把甲方图贴进画面：只取“哪里是草、哪里是路、哪里有树”，颜色、线条全部自绘。

读：视频/甲方提资/00_总平面_楼栋编号层数.jpg（只读）、public/city/site_boundary.json
    总平面 → 场景坐标：用 12 栋住宅色块中心和场景楼栋中心做最小二乘仿射，残差约 2 像素（< 1 米）
写：public/v2/site_day.png、site_night.png（带透明通道，0.4 米/像素）、site_meta.json（范围）、site_trees.json（[x, z, 冠幅半径]）
用法：python3 -I tools/v2/build_site.py
"""
import json
from pathlib import Path
import numpy as np
import cv2

HERE = Path(__file__).resolve().parents[2]
PLAN = HERE.parent / "甲方提资" / "00_总平面_楼栋编号层数.jpg"
OUT = HERE / "public" / "v2"
M = np.array([[2.8825, -0.004, 846.3984], [0.017, 2.8763, -1589.379]])  # 场景 (x, z, 1) → 总平面像素
RES = 0.4  # 米/像素

sb = json.load(open(HERE / "public" / "city" / "site_boundary.json"))["features"][0]
site = np.array(sb["properties"].get("polygon") or sb["geometry"]["coordinates"][0], float)
x0, z0 = site[:, 0].min() - 4, site[:, 1].min() - 4
x1, z1 = site[:, 0].max() + 4, site[:, 1].max() + 4
TW, TH = int((x1 - x0) / RES), int((z1 - z0) / RES)

# ---------- 在总平面上分类 ----------
im = cv2.imread(str(PLAN)).astype(np.float32)
B, G, R = im[..., 0], im[..., 1], im[..., 2]
V = im.max(axis=2); S = (V - im.min(axis=2)) / np.maximum(V, 1) * 255
green = G - (R + B) / 2; warm = (R + G) / 2 - B
UNK, LAWN, PAVE, PATH, LANE, WATER = 0, 1, 2, 3, 4, 5  # 6 = 植草砖（后面由 LANE 改出来）
cls = np.zeros(im.shape[:2], np.uint8)
cls[(green > 5) & (V > 95) & (S < 110)] = LAWN
cls[(warm > 14) & (V > 160) & (S < 110)] = PATH          # 米黄园路、木平台
cls[(np.abs(green) < 6) & (warm < 14) & (V > 175)] = PAVE  # 浅灰铺装
cls[(np.abs(green) < 8) & (V > 120) & (V <= 175) & (S < 30)] = LANE  # 中灰：消防车道、车行道
cls[(B > R + 25) & (B > G) & (V > 150) & (S > 40) & (S < 110)] = WATER
# 树：深绿圆块
tree_m = ((green > 12) & (V < 135) & (V > 40)).astype(np.uint8)
# 文字、尺寸线、编号圈、楼栋色块、阴影都当未知，用最近的已知类别补上；再做众数滤波去碎点
cls[(S >= 110) | (V < 70)] = UNK
# 编号圈和楼栋色块整块挖掉（圈里的白色数字也一起）：饱和色区域闭运算后填洞
satm = cv2.morphologyEx(((S >= 100) & (V > 60)).astype(np.uint8) * 255, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
ff = satm.copy(); cv2.floodFill(ff, np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8), (0, 0), 255)
holes = cv2.bitwise_not(ff)
hn, hl, hs, _ = cv2.connectedComponentsWithStats(holes)
holes = np.isin(hl, [i for i in range(1, hn) if hs[i, 4] < 6000]).astype(np.uint8) * 255  # 只填编号圈里的数字这种小洞，红线围起来的整个用地不算
cls[cv2.dilate(satm | holes, np.ones((7, 7), np.uint8)) > 0] = UNK
known = cls != UNK
_, idx = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
ys, xs = np.nonzero(known)
lut = np.zeros(idx.max() + 1, np.uint8); lut[idx[known]] = cls[known]
cls = lut[idx]
cls = cv2.medianBlur(cls, 7)

# 树中心
n, lab, st, cen = cv2.connectedComponentsWithStats(cv2.morphologyEx(tree_m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)))
Minv = cv2.invertAffineTransform(M.astype(np.float64))
trees = []
from matplotlib.path import Path as MPath  # noqa: E402
inside = MPath(site)
for i in range(1, n):
    a = st[i, 4]
    if a < 25 or a > 2500: continue
    w, h = st[i, 2], st[i, 3]
    if max(w, h) / max(1, min(w, h)) > 2.2: continue
    px_, py_ = cen[i]
    sx, sz = Minv @ np.array([px_, py_, 1.0])
    if not inside.contains_point((sx, sz)): continue
    r = max(2.2, min(5.5, np.sqrt(a / np.pi) / 2.88))
    trees.append([round(float(sx), 1), round(float(sz), 1), round(float(r), 1)])

# ---------- 重采样到场景纹理 ----------
gx, gz = np.meshgrid(x0 + (np.arange(TW) + 0.5) * RES, z0 + (np.arange(TH) + 0.5) * RES)
mapx = (M[0, 0] * gx + M[0, 1] * gz + M[0, 2]).astype(np.float32)
mapy = (M[1, 0] * gx + M[1, 1] * gz + M[1, 2]).astype(np.float32)
c = cv2.remap(cls, mapx, mapy, cv2.INTER_NEAREST, borderValue=PAVE)
mask = np.zeros((TH, TW), np.uint8)
cv2.fillPoly(mask, [np.round((site - [x0, z0]) / RES).astype(np.int32)], 255)
# 用地边界数据把外侧道路也框了进来：所有城市道路按宽度 + 3 米挖掉，路面交给底图和近景路面层
RW = {"trunk": 26, "primary": 20, "secondary": 14, "tertiary": 8}
for f in json.load(open(HERE / "public" / "city" / "roads.json"))["features"]:
    w = RW.get(f["properties"]["class"])
    if not w: continue
    pts = np.round((np.array(f["geometry"]["coordinates"], float) - [x0, z0]) / RES).astype(np.int32)
    cv2.polylines(mask, [pts], False, 0, int((w + 6) / RES))
mask = cv2.GaussianBlur(mask, (0, 0), 1.2)

# ---------- 按用户意见细化（2026-10-23） ----------
# 1) 小区和和园之间没有路：总平面上西侧那条灰色带（和园路）改成草地，后面沿它种一排树
gxs = x0 + (np.arange(TW) + 0.5) * RES; gzs = z0 + (np.arange(TH) + 0.5) * RES
GX, GZ = np.meshgrid(gxs, gzs)
strip = (GX < 140) & (GZ > 815) & (GZ < 1345)
c[strip & (c != WATER)] = LAWN
# 2) 总平面上楼的投影、消防车道被读成了“灰色路面”：豪宅小区里消防道多是植草砖，按植草砖画；楼脚下的投影区并到铺装
rects = json.load(open(OUT / "landmarks.json"))["ruifuRects"]
fp = np.zeros((TH, TW), np.uint8)
for r in rects:
    ca, sa = np.cos(r["a"]), np.sin(r["a"])
    corners = [(-r["w"] / 2, -r["d"] / 2), (r["w"] / 2, -r["d"] / 2), (r["w"] / 2, r["d"] / 2), (-r["w"] / 2, r["d"] / 2)]
    pts = [(r["c"][0] + lx * ca - lz * sa, r["c"][1] + lx * sa + lz * ca) for lx, lz in corners]
    cv2.fillPoly(fp, [np.round((np.array(pts) - [x0, z0]) / RES).astype(np.int32)], 255)
near_bld = cv2.dilate(fp, np.ones((int(9 / RES), int(9 / RES)), np.uint8)) > 0
c[(c == LANE) & near_bld] = PAVE
GRASSPAVE = 6
c[(c == LANE) & ~(GX > 330)] = GRASSPAVE  # 东侧沿滨河路的外圈车道保留灰色
# 3) 绿地里补树：在草坪上按 9 米间距撒点（避开楼 6 米、已有的树 6 米），西侧绿带再种一排行道树
lawn_free = (c == LAWN) & (mask > 220) & ~(cv2.dilate(fp, np.ones((int(12 / RES), int(12 / RES)), np.uint8)) > 0)
rng2 = np.random.default_rng(23)
cand = np.argwhere(lawn_free[::5, ::5]) * 5
rng2.shuffle(cand)
have = [(t[0], t[1]) for t in trees]
extra = []
occ_t = np.zeros((TH, TW), np.uint8)  # 已有树占位（6.5 米），新树之间 9 米
for hx, hz in have: cv2.circle(occ_t, (int((hx - x0) / RES), int((hz - z0) / RES)), int(6.5 / RES), 255, -1)
for zi, xi in cand:
    sx, sz = x0 + xi * RES, z0 + zi * RES
    if occ_t[zi, xi]: continue
    cv2.circle(occ_t, (int(xi), int(zi)), int(9.0 / RES), 255, -1)
    extra.append([round(float(sx), 1), round(float(sz), 1), round(float(2.6 + 1.8 * rng2.random()), 1)])
for zz in np.arange(822, 1340, 7.5):
    extra.append([round(float(126 + rng2.normal(0, 0.6)), 1), round(float(zz), 1), round(float(3.0 + 0.6 * rng2.random()), 1)])
trees += extra
# 4) 灌木：草坪和铺装交界处每 3 米一丛矮灌木（树篱的感觉），写 site_shrubs.json
edge_m = cv2.morphologyEx((c == LAWN).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
edge_m &= (mask > 220) & ~near_bld
shrubs = []
ez = np.argwhere(edge_m[::7, ::7]) * 7
for zi, xi in ez:
    shrubs.append([round(float(x0 + xi * RES), 1), round(float(z0 + zi * RES), 1), round(float(0.9 + 0.5 * rng2.random()), 2)])

def paint(pal, grain):
    img = np.zeros((TH, TW, 3), np.float32)
    for k, col in pal.items():
        img[c == k] = [int(col[i:i + 2], 16) for i in (5, 3, 1)]
    # 草坪轻微明暗起伏，铺装加细分缝，园路边缘一道浅线
    rng = np.random.default_rng(3)
    noise = cv2.resize(rng.random((TH // 40 + 2, TW // 40 + 2)).astype(np.float32), (TW, TH), interpolation=cv2.INTER_CUBIC)
    img[c == LAWN] *= (0.95 + 0.1 * noise[c == LAWN])[:, None]
    yy, xx = np.mgrid[0:TH, 0:TW]
    joints = ((xx % 8 == 0) | (yy % 8 == 0)) & ((c == PAVE) | (c == PATH))
    img[joints] *= grain
    img[((xx % 3 == 0) | (yy % 3 == 0)) & (c == 6)] *= 0.975  # 植草砖的格子
    edge = cv2.morphologyEx((c == PATH).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    img[edge & (c == LAWN)] = img[edge & (c == LAWN)] * 0.6 + np.array([[int(pal[PAVE][i:i + 2], 16) for i in (5, 3, 1)]], np.float32) * 0.4
    img = cv2.GaussianBlur(img, (0, 0), 0.6)
    return np.dstack([np.clip(img, 0, 255).astype(np.uint8), mask])

DAY = {LAWN: "#C9DEB0", PAVE: "#EEEAE2", PATH: "#E9DDC6", LANE: "#D9D9D6", WATER: "#9FCBE6", 6: "#D5E3C3"}
NIGHT = {LAWN: "#1C2D2B", PAVE: "#2A3148", PATH: "#3A3A44", LANE: "#262C40", WATER: "#1C4F8C", 6: "#1F2E2C"}
cv2.imwrite(str(OUT / "site_day.png"), paint(DAY, 0.965))
cv2.imwrite(str(OUT / "site_night.png"), paint(NIGHT, 0.9))
json.dump({"bounds": [x0, z0, x1, z1]}, open(OUT / "site_meta.json", "w"))
trees = [t for t in trees if mask[min(TH - 1, int((t[1] - z0) / RES)), min(TW - 1, int((t[0] - x0) / RES))] > 200]  # 路上的不要
json.dump(trees, open(OUT / "site_trees.json", "w"))
json.dump(shrubs, open(OUT / "site_shrubs.json", "w"))
print("texture", TW, TH, "trees", len(trees), "extra", len(extra), "shrubs", len(shrubs), "classes", {k: int((c == k).sum()) for k in range(6)})
