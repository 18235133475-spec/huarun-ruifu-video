# 效果图“线稿进场”：纸面 → 线稿逐片画出 → 色彩按有机斑块晕开。本地 numpy/OpenCV，不调用任何外部服务。
# 用法：python3 reveal.py 输入图 输出mp4 [焦点x 焦点y] [--from=起始图]
#   焦点为 0–1，颜色先从这里晕开；给了 --from 就不画线稿，改为从起始图（如区域底图）按同样的剪纸斑块翻到输入图。
import sys, subprocess
import numpy as np, cv2

W, H, FPS, SEC = 1920, 1080, 30, 5.0
PAPER = np.array([228, 237, 242], np.float32)  # BGR #F2EDE4
INK = np.array([92, 102, 111], np.float32)     # BGR #6F665C

args = [a for a in sys.argv[1:] if not a.startswith("--from=")]
start = next((a[7:] for a in sys.argv[1:] if a.startswith("--from=")), None)
src, out = args[0], args[1]
fx, fy = (float(args[2]), float(args[3])) if len(args) > 3 else (0.5, 0.5)

img = cv2.imread(src)
h0, w0 = img.shape[:2]
s = max(W * 1.08 / w0, H * 1.08 / h0)  # 留 8% 余量做推镜
big = cv2.resize(img, (int(w0 * s), int(h0 * s)), interpolation=cv2.INTER_AREA)
BH, BW = big.shape[:2]

# 线稿：铅笔减淡 + 少量边缘
gray = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY)
inv = 255 - gray
dodge = cv2.divide(gray, 255 - cv2.GaussianBlur(inv, (0, 0), 6), scale=256).astype(np.float32)
line = np.clip((235 - dodge) / 90, 0, 1)
edges = cv2.Canny(cv2.GaussianBlur(gray, (0, 0), 1.6), 40, 110).astype(np.float32) / 255
line = np.clip(line * 0.85 + cv2.GaussianBlur(edges, (0, 0), 0.7) * 0.5, 0, 1) ** 0.9

# 有机斑块时间图：多倍频值噪声 + 到焦点的距离
rng = np.random.default_rng(7)
def vnoise(cells):
    g = rng.random((cells + 1, int(cells * BW / BH) + 1)).astype(np.float32)
    return cv2.resize(g, (BW, BH), interpolation=cv2.INTER_CUBIC)
noise = vnoise(4) * 0.55 + vnoise(9) * 0.3 + vnoise(22) * 0.15
yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
dist = np.hypot((xx / BW - fx) * BW / BH, yy / BH - fy)
tmap = dist / dist.max() * 0.62 + noise * 0.38
tmap = (tmap - tmap.min()) / (tmap.max() - tmap.min())
lmap = noise * 0.7 + (yy / BH) * 0.3  # 线稿从上往下、斑块状画出
lmap = (lmap - lmap.min()) / (lmap.max() - lmap.min())

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

KER = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
color = big.astype(np.float32)
base = cv2.resize(cv2.imread(start), (BW, BH), interpolation=cv2.INTER_AREA).astype(np.float32) if start else None
paper = np.broadcast_to(PAPER, color.shape)
ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                       "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", out], stdin=subprocess.PIPE)
N = int(SEC * FPS)
for i in range(N):
    t = i / FPS
    kl = ss(0.0, 1.3, t)            # 线稿画出
    kc = ss(0.7, 3.3, t) if start else ss(1.3, 3.9, t)  # 颜色晕开
    la = 1 - ss(0, 1, (lmap - kl * 1.15 + 0.15) / 0.15) if kl < 1 else np.ones_like(lmap)
    # 颜色区域：硬边蒙版 + 1.5像素羽化；白边固定4像素宽，像剪开的纸片
    m = (tmap < kc * 1.12 - 0.02).astype(np.uint8) if kc > 0 else np.zeros(tmap.shape, np.uint8)
    ca = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.5)
    rim = cv2.GaussianBlur((cv2.dilate(m, KER) - m).astype(np.float32), (0, 0), 1.0) if 0 < kc < 1 else np.zeros_like(ca)
    sketch = base if start else paper * (1 - (line * la)[..., None]) + INK * (line * la)[..., None]
    f = sketch * (1 - ca[..., None]) + color * ca[..., None]
    f = f * (1 - rim[..., None] * 0.95) + 252 * rim[..., None] * 0.95
    # 推镜：1.0 → 1.06（相对留量）
    z = 1 + 0.06 * (t / SEC)
    cw, ch = BW / (1.08 * z) * 1.0, BH / (1.08 * z)
    x0, y0 = (BW - cw) * fx, (BH - ch) * 0.5
    M = np.float32([[W / cw, 0, -x0 * W / cw], [0, H / ch, -y0 * H / ch]])
    frame = cv2.warpAffine(np.clip(f, 0, 255).astype(np.uint8), M, (W, H), flags=cv2.INTER_LINEAR)
    ff.stdin.write(frame.tobytes())
ff.stdin.close(); ff.wait()
print("ok", out, N, "frames")
