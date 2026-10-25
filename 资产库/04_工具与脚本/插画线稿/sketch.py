# 照片 → 干净的建筑素描线稿（XDoG 线 + 少量排线阴影），纸色底，天空留白。给故事板的两座大剧院用。本地 OpenCV，不联网。
# 用法：python3 -I sketch.py 输入图 输出.png [宽度] [--blue-sky]
import sys
import numpy as np, cv2

args = [a for a in sys.argv[1:] if not a.startswith("--")]
src, out = args[0], args[1]
W = int(args[2]) if len(args) > 2 else 2000
BLUE = "--blue-sky" in sys.argv
PAPER = np.array([234, 240, 243], np.float32)  # BGR #F3F0EA
INK = np.array([58, 64, 72], np.float32)

img = cv2.imread(src)
img = cv2.resize(img, (W, int(img.shape[0] * W / img.shape[1])), interpolation=cv2.INTER_AREA)
sm = img.copy()
for _ in range(3): sm = cv2.bilateralFilter(sm, 9, 30, 7)
g = cv2.cvtColor(sm, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255

# XDoG：干净、粗细有变化的轮廓线
s, k, p, eps, phi = 1.35, 1.6, 30.0, 0.02, 14.0
d = (1 + p) * cv2.GaussianBlur(g, (0, 0), s) - p * cv2.GaussianBlur(g, (0, 0), s * k)
line = 1 - np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps)))
line = np.clip(line, 0, 1)
line = np.clip(cv2.GaussianBlur(cv2.dilate(line, np.ones((2, 2), np.uint8)), (0, 0), 0.7) * 1.25, 0, 1)  # 线条加一点粗细，避免发虚
# 去掉零碎噪点：小连通块不要
bw = (line > 0.35).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(bw, 8)
keep = np.isin(lab, [i for i in range(1, n) if st[i, 4] >= 40])
line = line * keep

# 天空：从顶边连通的偏蓝/很亮区域，留白
hsv = cv2.cvtColor(sm, cv2.COLOR_BGR2HSV)
skyish = (((hsv[..., 0] > 85) & (hsv[..., 0] < 130) & (hsv[..., 2] > 140)) | ((not BLUE) & (hsv[..., 1] < 30) & (hsv[..., 2] > 215))).astype(np.uint8)
skyish = cv2.morphologyEx(skyish, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
nn, cc = cv2.connectedComponents(skyish)
sky = np.isin(cc, [i for i in np.unique(cc[0]) if i])
sky = cv2.medianBlur(cv2.morphologyEx(sky.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)), 15) > 127  # 天空边缘抹顺，轮廓线不发毛
line[sky] *= 0.15
# 建筑和天空的交界画一道实线（白色屋面在天空前容易丢轮廓）
sil = cv2.morphologyEx(sky.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)).astype(np.float32)
gm = cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3))
sil *= (cv2.dilate((gm > 0.12).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)  # 只在照片里确有明暗交界处画，避免天空渐变处画出假轮廓
sil = cv2.GaussianBlur(sil, (0, 0), 0.8)
line = np.maximum(line, np.clip(sil * 1.6, 0, 1) * 0.95)
# 植物：线条太碎，压淡
green = ((hsv[..., 0] > 30) & (hsv[..., 0] < 90) & (hsv[..., 1] > 60)) | (((hsv[..., 0] < 12) | (hsv[..., 0] > 160)) & (hsv[..., 1] > 90))  # 绿植和红花
green = cv2.dilate(green.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
line[green] *= 0.4

# 暗部排线：45° 细斜线，只在较暗处出现，浓淡随明暗
yy, xx = np.mgrid[0:g.shape[0], 0:g.shape[1]]
hatch = ((xx + yy) % 9 < 1.2).astype(np.float32)
dark = np.clip((0.42 - cv2.GaussianBlur(g, (0, 0), 3)) / 0.25, 0, 1)
dark[sky] = 0
dark[green] *= 0.3
tone = hatch * dark * 0.45

a = np.clip(np.maximum(line, tone), 0, 1)[..., None]
cv2.imwrite(out, (PAPER * (1 - a) + INK * a).astype(np.uint8))
