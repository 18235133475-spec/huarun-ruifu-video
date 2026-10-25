"""动态分镜用的临时音乐和音效（Python 合成，仅供定节奏，成片另行制作）。

读 src/timeline.json：音乐按段落换和声（前半段小调偏暗，提亮转场后转大调），镜13转身前留半秒空白；
音效按每个镜头的 beats 落点合成。输出 public/audio/music.wav 和 public/audio/sfx.wav（48kHz 立体声）。
用法：python3 -I tools/make_audio.py
"""
import json
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent.parent
TL = json.loads((HERE / "src" / "timeline.json").read_text(encoding="utf-8"))
SR = 48000
TOTAL = TL["totalFrames"] / TL["fps"]
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(7)
SHOT = {s["id"]: s for s in TL["shots"]}


def t0(sid):
    return SHOT[sid]["start"]


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def piano(freq, dur=3.5, vel=0.25):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * 2.2) * (1 - np.exp(-t * 400))
    tone = sum(np.sin(2 * np.pi * freq * h * t) * a for h, a in ((1, 1), (2, 0.35), (3, 0.12), (4, 0.06)))
    return tone * env * vel


def pad(freqs, dur, vel=0.06):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for f in freqs:
        for det in (-0.6, 0.6):
            ph = 2 * np.pi * (f + det) * t
            sig += 2 * (ph / (2 * np.pi) % 1) - 1  # 锯齿波
    # 一阶低通
    out = np.zeros(n)
    a = np.exp(-2 * np.pi * 900 / SR)
    acc = 0.0
    for i in range(0, n, 1):
        acc = acc * a + sig[i] * (1 - a)
        out[i] = acc
    att = np.minimum(1, t / 1.5) * np.minimum(1, (dur - t) / 1.5)
    return out * att * vel / len(freqs)


def add(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def music():
    buf = np.zeros(N)
    # 段落与和声：(开始秒, 结束秒, 和弦根音列表[MIDI], 每拍秒数, 亮度)
    dark = [57, 53, 48, 52]   # Am F C Em
    bright = [48, 53, 57, 55]  # C F Am G
    sections = [
        (0, t0("12"), dark, 0.9, 0),
        (t0("12"), t0("16"), bright, 0.75, 1),
        (t0("16"), t0("19"), [53, 57], 1.2, 0),
        (t0("19"), t0("23"), bright, 0.6, 1),
        (t0("23"), TOTAL, dark[:2], 1.0, 0),
    ]
    for a, b, roots, beat, br in sections:
        t = a
        k = 0
        while t < b - 0.5:
            root = roots[(k // 8) % len(roots)]
            chord = [root, root + (4 if br else 3), root + 7] if root in (48, 53, 55) or br else [root, root + 3, root + 7]
            note = chord[[0, 1, 2, 1, 2, 0, 1, 2][k % 8]] + 12
            add(buf, piano(midi(note), vel=0.16 if br else 0.13), t)
            if k % 8 == 0:
                add(buf, pad([midi(n - 12) for n in chord], min(beat * 8 + 1.5, b - t + 1.0)), t)
            t += beat
            k += 1
    # 镜13转身前留半秒空白：0.8–1.3秒静音，前后各30毫秒淡入淡出
    s13 = t0("13")
    i0, i1 = int((s13 + 0.8) * SR), int((s13 + 1.3) * SR)
    fade = int(0.03 * SR)
    buf[i0 - fade:i0] *= np.linspace(1, 0, fade)
    buf[i0:i1] = 0
    buf[i1:i1 + fade] *= np.linspace(0, 1, fade)
    # 片尾淡出
    tail = int(3 * SR)
    end = int(TOTAL * SR)
    buf[end - tail:end] *= np.linspace(1, 0, tail)
    buf[end:] = 0
    return buf


def noise(n):
    return rng.standard_normal(n)


def lowpass(sig, cutoff):
    out = np.zeros_like(sig)
    acc = 0.0
    cut = np.broadcast_to(cutoff, sig.shape)
    for i in range(len(sig)):
        a = np.exp(-2 * np.pi * cut[i] / SR)
        acc = acc * a + sig[i] * (1 - a)
        out[i] = acc
    return out


def sfx_pencil():
    d = 3.6; n = int(d * SR); t = np.arange(n) / SR
    strokes = (np.sin(2 * np.pi * 3.1 * t) > 0.2).astype(float) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t))
    hi = noise(n) - lowpass(noise(n), 2500)
    return hi * strokes * 0.05


def sfx_whoosh():
    d = 1.2; n = int(d * SR); t = np.arange(n) / SR
    env = np.sin(np.pi * t / d) ** 2
    return lowpass(noise(n), 300 + 3500 * env) * env * 0.5


def sfx_water():
    d = 4.0; n = int(d * SR); t = np.arange(n) / SR
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 1.2)
    return lowpass(noise(n), 900) * (0.7 + 0.3 * np.sin(2 * np.pi * 1.7 * t)) * env * 0.25


def sfx_rise():
    d = 1.6; n = int(d * SR); t = np.arange(n) / SR
    f = 45 + 50 * t / d
    env = np.minimum(1, t / 0.3) * np.exp(-np.maximum(0, t - 1.2) * 8)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env * 0.35


def sfx_thud():
    d = 0.6; n = int(d * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 58 * t) * np.exp(-t * 9) * 0.5 + lowpass(noise(n), 400) * np.exp(-t * 30) * 0.3)


def sfx_paper():
    d = 0.9; n = int(d * SR); t = np.arange(n) / SR
    env = np.exp(-t * 4) * (1 + 0.6 * np.sin(2 * np.pi * 18 * t))
    return (noise(n) - lowpass(noise(n), 1500)) * env * 0.12


def sfx_click():
    d = 0.5; n = int(d * SR); t = np.arange(n) / SR
    c = np.zeros(n)
    for at in (0.0, 0.07):
        i = int(at * SR)
        k = int(0.012 * SR)
        c[i:i + k] += noise(k) * np.exp(-np.arange(k) / (k / 4))
    return c * 0.35 + np.sin(2 * np.pi * 110 * t) * np.exp(-t * 18) * 0.25


def sfx_chime():
    d = 1.4; n = int(d * SR); t = np.arange(n) / SR
    f = 1568
    return sum(np.sin(2 * np.pi * f * h * t) * a for h, a in ((1, 1), (2.76, 0.3), (5.4, 0.1))) * np.exp(-t * 3.5) * 0.06


LEVEL = {"pencil": 0.22, "whoosh": 0.4, "water": 0.3, "rise": 0.45, "thud": 0.6, "paper": 0.3, "click": 0.75, "chime": 0.35}
BANK = {"pencil": sfx_pencil, "whoosh": sfx_whoosh, "water": sfx_water, "rise": sfx_rise, "thud": sfx_thud,
        "paper": sfx_paper, "click": sfx_click, "chime": sfx_chime}


def sfx():
    buf = np.zeros(N)
    cache = {}
    for s in TL["shots"]:
        for kind, times in s.get("beats", {}).items():
            for at in times:
                if kind not in cache or kind in ("pencil", "water", "whoosh", "paper"):
                    sig = BANK[kind]()
                    cache[kind] = sig / (np.max(np.abs(sig)) or 1) * LEVEL[kind]
                add(buf, cache[kind], s["start"] + at)
    return buf


def write(path, mono, gain=0.9, normalize=True):
    peak = np.max(np.abs(mono)) or 1
    mono = mono / peak * gain if normalize else np.clip(mono, -1, 1)
    st = np.stack([mono, mono], axis=1)
    data = (st * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    out = HERE / "public" / "audio"
    out.mkdir(parents=True, exist_ok=True)
    write(out / "music.wav", music(), 0.8)
    write(out / "sfx.wav", sfx(), normalize=False)
    print("ok", round(TOTAL, 1), "s")
