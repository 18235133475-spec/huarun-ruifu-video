"""长风 2003 / 2025 卫星对比图：用户提供的谷歌地球截图（同一范围）→ 去掉地名、兴趣点图标 → 裁成 16:9 → 轻微锐化。
读：视频/素材/04_历史影像/用户提供_谷歌地球/长风_2003_谷歌地球截图.png、长风_2025_谷歌地球截图.png（只读）
写：public/v2/ge_2003.jpg、ge_2025.jpg（1090×613，原始像素，不放大）
用法：python3 -I tools/v2/build_ge.py
"""
from pathlib import Path
import numpy as np, cv2

HERE = Path(__file__).resolve().parents[2]
SRC = HERE.parent / "素材" / "04_历史影像" / "用户提供_谷歌地球"
OUT = HERE / "public" / "v2"
X0, X1 = 300, 1390  # 裁切：左边 296 像素以内的 2003 年影像是另一期拼接（发白），不用；1090×613 正好 16:9
# 地名、图标的位置（裁切后坐标，x0, y0, x1, y1），两期截图位置相同
LABELS = [(328, 0, 370, 16), (345, 133, 462, 168), (498, 105, 530, 125), (845, 152, 885, 170), (77, 190, 107, 207), (124, 235, 172, 253),
          (312, 240, 425, 270), (622, 377, 658, 394), (70, 393, 110, 410), (195, 403, 235, 421), (241, 409, 290, 427), (664, 499, 712, 517),
          (108, 528, 150, 547), (122, 585, 163, 602), (965, 4, 992, 20), (1018, 600, 1052, 613), (425, 585, 475, 613), (1035, 592, 1090, 613)]
for year in ("2003", "2025"):
    im = cv2.imread(str(SRC / f"长风_{year}_谷歌地球截图.png"))[:, X0:X1]
    mask = np.zeros(im.shape[:2], np.uint8)
    for x0, y0, x1, y1 in LABELS:
        box = im[y0:y1, x0:x1]
        hsv = cv2.cvtColor(box, cv2.COLOR_BGR2HSV)
        # 文字是白字带深色描边、图标是紫色圆钉：只挖掉这些像素（再外扩 2 像素），底下的影像尽量保留
        t = ((hsv[..., 2] > 185) & (hsv[..., 1] < 60)) | ((hsv[..., 0] > 120) & (hsv[..., 0] < 160) & (hsv[..., 1] > 80))
        t = cv2.dilate(t.astype(np.uint8) * 255, np.ones((3, 3), np.uint8), iterations=2)
        mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], t)
    im = cv2.inpaint(im, mask, 4, cv2.INPAINT_TELEA)
    if year == "2003":  # 2003 年河东是另一期影像（偏亮偏青），按河西的色调把河东整体压一压，接缝处 60 像素渐变
        f = im.astype(np.float32)
        L, R = f[:, 420:540].reshape(-1, 3).mean(0), f[:, 580:700].reshape(-1, 3).mean(0)
        gain = (L / R) ** 0.85
        ramp = np.clip((np.arange(f.shape[1]) - 540) / 60.0, 0, 1)[None, :, None]
        im = np.clip(f * (1 + (gain[None, None, :] - 1) * ramp), 0, 255).astype(np.uint8)
    blur = cv2.GaussianBlur(im, (0, 0), 1.2)
    im = cv2.addWeighted(im, 1.35, blur, -0.35, 0)  # 轻微锐化
    cv2.imwrite(str(OUT / f"ge_{year}.jpg"), im, [cv2.IMWRITE_JPEG_QUALITY, 95])
print("ok")
