"""新开头版（O0：黑幕问句 + 三句垫场）的整片声音：开头自己拼，O1 起接用户的完整录音。
- 开头 [0, O1 起点)：钢琴配乐（与片头同一首、同样的音量）+ 用户补录的开头配音（降 2dB，和完整录音的人声响度一致）
- O1 起：用户完整录音整体提前 85ms 后，从旧时间轴 O1 起点（4.0 秒）接上；接口前 0.3 秒等功率交叉淡化（O1 人声 0.1 秒后才开始）
- O3：剪掉前半句“在整个北方买房，南北朝向，它几乎是标准答案”（开头已经问过），剪口在旧 O3 配音的 −0.133 至 4.100 秒（127 帧，两端都落在无人声处），剪口做 30ms 交叉淡化；
  与 timeline.ts 的 TRIM 一致，O3 之后画面与声音整体前移同样的 127 帧
用法：python3 -I tools/build_audio_openq.py 输出.wav [总帧数]
"""
import subprocess, sys, wave
import numpy as np

SR, FPS = 48000, 30
OUT = sys.argv[1]
TOTAL = int(sys.argv[2]) if len(sys.argv) > 2 else 13362
V = "../素材/06_音乐/人声配音_2026-10-24/"
MIX, SUP, PIANO = V + "用户完整版原始_2026-10-25.wav", V + "补充配音_开头_2026-10-25.wav", "public/music/piano.mp3"
O1_NEW, O1_OLD = 474 / FPS, 120 / FPS          # O1 在新、旧时间轴上的起点（秒）
SUP_SHIFT = 1.6 - (15 / FPS + 0.35)             # 补录文件 1.6 秒处 = O0 起点 + LEAD
MIX_SHIFT = 0.085                               # 用户完整录音比时间轴晚 85ms
O3_VO_OLD = 590 / FPS + 0.35                    # 旧时间轴 O3 配音起点（秒）
CUT0, CUTN = O3_VO_OLD - 4 / FPS, 127 / FPS     # O3 剪口：起点、长度

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).reshape(-1, 2).astype(np.float64)

mix, sup, piano = load(MIX), load(SUP), load(PIANO)
N = round(TOTAL / FPS * SR)
out = np.zeros((N, 2))
J = round(O1_NEW * SR)

# 开头：钢琴（循环）× 音量包络。原片头前 4 秒是 0.24、之后 0.15；这里问句黑幕段保持 0.24，3.2–4.0 秒过渡到 0.15
t = np.arange(J) / SR
vol = np.clip(t * FPS / 45, 0, 1) * np.interp(t, [0, 3.2, 4.0, 1e9], [0.24, 0.24, 0.15, 0.15])
out[:J] = piano[np.arange(J) % len(piano)] * vol[:, None]
# 开头配音：补录文件 1.6–15.5 秒，降 2dB
a, b = round(1.6 * SR), round(15.5 * SR)
seg = sup[a:b] * 10 ** (-2 / 20)
seg[: round(0.05 * SR)] *= np.linspace(0, 1, round(0.05 * SR))[:, None]
seg[-round(0.1 * SR):] *= np.linspace(1, 0, round(0.1 * SR))[:, None]
s0 = round((1.6 - SUP_SHIFT) * SR)
out[s0 : s0 + len(seg)] += seg
# O1 起：用户完整录音，接口前 0.3 秒交叉淡化
d = round(0.3 * SR)
m0 = round((O1_OLD + MIX_SHIFT) * SR)            # 用户录音里对应 O1 起点的位置
x0 = round((CUT0 + MIX_SHIFT) * SR); xn = round(CUTN * SR); xf = round(0.03 * SR)
kk = np.linspace(0, np.pi / 2, xf)[:, None]
blend = mix[x0 : x0 + xf] * np.cos(kk) + mix[x0 + xn : x0 + xn + xf] * np.sin(kk)   # 剪口 30ms 交叉淡化：剪口起点往后淡出、剪口终点往后淡入，总长不变
rest = np.concatenate([mix[m0 - d : x0], blend, mix[x0 + xn + xf :]])
k = np.linspace(0, np.pi / 2, d)[:, None]
out[J - d : J] = out[J - d : J] * np.cos(k) + rest[:d] * np.sin(k)
n = min(N - J, len(rest) - d)
out[J : J + n] = rest[d : d + n]

w = wave.open(OUT, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes(np.clip(np.round(out), -32768, 32767).astype(np.int16).tobytes()); w.close()
print(f"{OUT}: {N / SR:.3f} 秒；开头配音 {s0 / SR:.2f}–{(s0 + len(seg)) / SR:.2f} 秒；O1 接口 {O1_NEW:.2f} 秒；峰值 {np.abs(out).max() / 32768:.3f}")
