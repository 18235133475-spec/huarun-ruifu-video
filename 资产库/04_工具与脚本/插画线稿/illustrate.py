# 照片 → 非写实插画（线稿 + 平涂色块，天空换成纸色），给故事底板用。本地 OpenCV，不联网。
# 用法：python3 -I illustrate.py 输入图 输出前缀 [宽度] [--blue-sky]（白色石材建筑用，只把偏蓝的天空换成纸色）
#   写 <前缀>_line.png（纸面线稿）和 <前缀>.png（线稿 + 平涂）
import sys
import numpy as np, cv2

src, out = sys.argv[1], sys.argv[2]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
BLUE = "--blue-sky" in sys.argv
W = int(args[2]) if len(args) > 2 else 1600
PAPER = np.array([228, 237, 242], np.float32)  # BGR #F2EDE4
INK = np.array([82, 92, 104], np.float32)

img = cv2.imread(src)
img = cv2.resize(img, (W, int(img.shape[0] * W / img.shape[1])), interpolation=cv2.INTER_AREA)
H = img.shape[0]

# 平涂：多次双边滤波 + k-means 色块，再统一降饱和、偏暖
sm = img.copy()
for _ in range(8): sm = cv2.bilateralFilter(sm, 11, 30, 11)
Z = sm.reshape(-1, 3).astype(np.float32)
_, lab, cen = cv2.kmeans(Z, 9, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
hsv = cv2.cvtColor(cen.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
hsv[..., 1] *= 0.55; hsv[..., 2] = 70 + hsv[..., 2] * 0.72
cen2 = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).reshape(-1, 3).astype(np.float32)
cen2 = cen2 * 0.82 + PAPER * 0.18
flat = cen2[lab.ravel()].reshape(H, W, 3)
flat = cv2.medianBlur(cv2.medianBlur(flat.astype(np.uint8), 15), 9).astype(np.float32)

# 天空：从顶边连通的偏蓝/很亮的区域，换成纸色
h = cv2.cvtColor(sm, cv2.COLOR_BGR2HSV)
skyish = (((h[..., 0] > 85) & (h[..., 0] < 130) & (h[..., 2] > 140)) | ((not BLUE) & (h[..., 1] < 30) & (h[..., 2] > 215))).astype(np.uint8)
skyish = cv2.morphologyEx(skyish, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, cc = cv2.connectedComponents(skyish)
sky = np.isin(cc, [i for i in np.unique(cc[0]) if i]).astype(np.float32)
sky = cv2.GaussianBlur(sky, (0, 0), 3)[..., None]
flat = flat * (1 - sky) + PAPER * sky

# 线稿：铅笔减淡 + 边缘（同 reveal.py）
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
dodge = cv2.divide(gray, 255 - cv2.GaussianBlur(255 - gray, (0, 0), 6), scale=256).astype(np.float32)
line = np.clip((235 - dodge) / 90, 0, 1)
edges = cv2.Canny(cv2.GaussianBlur(gray, (0, 0), 1.6), 40, 110).astype(np.float32) / 255
line = np.clip(line * 0.8 + cv2.GaussianBlur(edges, (0, 0), 0.7) * 0.55, 0, 1) ** 0.9
line = line * (1 - sky[..., 0] * 0.9)
L = line[..., None]
cv2.imwrite(out + "_line.png", (PAPER * (1 - L * 0.9) + INK * L * 0.9).clip(0, 255).astype(np.uint8))
cv2.imwrite(out + ".png", (flat * (1 - L * 0.75) + INK * L * 0.75).clip(0, 255).astype(np.uint8))
