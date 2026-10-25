"""把一整条人声配音按镜头切开，并对时（字幕、画面卡点用）。
读：src/human_vo.json（逐镜头的人声实际说法，按录音校对过；cut 为要剪掉的口误/重复，秒）、src/script3.json（原脚本，画面关键词按它找）、
    whisper 逐词时间戳 JSON、处理过的整条人声 wav
做法：whisper 词 → 摊到每个字 → 和人声文本做字符对齐（difflib，没对上的字按前后插值）→ 每镜头从第一个字前 0.12 秒切到最后一个字后 0.3 秒；
    镜头里的 cut 段从音频里拿掉，后面的时间跟着前移。原脚本分句再和人声文本对齐一次，得到画面关键词的时刻（ksegs）。
写：public/vo4/<镜头号>.wav、src/v2/vo_timing4.json、src/script4.json
用法：python3 -I tools/align_human.py 词表.json 人声.wav
"""
import json, re, subprocess, sys, difflib
from pathlib import Path
HERE = Path(__file__).resolve().parent.parent
words, wav = json.load(open(sys.argv[1])), sys.argv[2]
human = json.loads((HERE / "src" / "human_vo.json").read_text(encoding="utf-8"))
script = {r["id"]: r for r in json.loads((HERE / "src" / "script3.json").read_text(encoding="utf-8"))}
PUN = set("，。；：？！、“”‘’—…（）《》 ,.;:?!\"'()·")
CUTS = [c for r in human for c in r.get("cut", [])]
DIG = [("1、2号楼", "一二号楼"), ("2号楼", "二号楼"), ("355", "三五五"), ("300", "三百"), ("270", "二七零"), ("104", "一零四"), ("22.8", "二十二点八"), ("100", "一百"), ("20", "二十")]
def spoken(t):
    for a, b in DIG: t = t.replace(a, b)
    return t
# ASR 字流（剪掉 cut 段里的词；阿拉伯数字也换成汉字读法）
achars, atimes = [], []
for s, e, w in words:
    if any(a - 0.02 <= s and e <= b + 0.02 for a, b in CUTS): continue
    cs = [c for c in spoken(w) if c not in PUN and not c.isspace()]
    for i, c in enumerate(cs):
        achars.append(c); atimes.append((s + (e - s) * i / len(cs), s + (e - s) * (i + 1) / len(cs)))
# 人声文本字流
hchars, hidx, hsegs = [], [], []
for k, r in enumerate(human):
    segs = [s for s in re.split(r"(?<=[，。；：？！])", r["text"]) if s.strip()]
    hsegs.append(segs)
    for j, sg in enumerate(segs):
        for c in spoken(sg):
            if c in PUN or c.isspace(): continue
            hchars.append(c); hidx.append((k, j))
def align(src, dst, dtimes):
    sm = difflib.SequenceMatcher(None, src, dst, autojunk=False)
    m = [None] * len(src)
    for a, b, n in sm.get_matching_blocks():
        for i in range(n): m[a + i] = dtimes[b + i]
    known = [i for i, x in enumerate(m) if x]
    for i in range(len(m)):
        if m[i]: continue
        lo = max([k for k in known if k < i], default=None); hi = min([k for k in known if k > i], default=None)
        if lo is None: m[i] = (m[hi][0], m[hi][0])
        elif hi is None: m[i] = (m[lo][1], m[lo][1])
        else: f = (i - lo) / (hi - lo); t0 = m[lo][1] + (m[hi][0] - m[lo][1]) * f; m[i] = (t0, t0)
    return m, sum(1 for x in sm.get_matching_blocks() for _ in range(x[2]))
tmap, hit = align(hchars, achars, atimes)
print("human↔ASR matched", hit, "/", len(hchars))
rng = [(tmap[[i for i, x in enumerate(hidx) if x[0] == k][0]][0], tmap[[i for i, x in enumerate(hidx) if x[0] == k][-1]][1]) for k in range(len(human))]
rng = [(human[k].get("start", a), human[k].get("end", b)) for k, (a, b) in enumerate(rng)]  # 人工指定的起止（口误处）
(HERE / "public" / "vo4").mkdir(exist_ok=True)
out_t, out_s = {}, []
# 切点对到真正的停顿上：whisper 的词时间常有 ±0.2 秒误差，所以在两镜之间的空当里找最安静的 60ms 下刀，
# 再从刀口往里找到声音真正开始/结束的地方，前后各留一点气口
import wave as _w, numpy as _np
_f = _w.open(wav); SR = _f.getframerate(); A = _np.frombuffer(_f.readframes(_f.getnframes()), _np.int16).astype(float) / 32768
HOP = int(0.01 * SR); E = _np.array([_np.sqrt((A[i:i + 6 * HOP] ** 2).mean() + 1e-12) for i in range(0, len(A) - 6 * HOP, HOP)])
EDB = 20 * _np.log10(E)
def quiet(a, b):
    i0, i1 = max(0, int(a / 0.01)), min(len(E) - 1, int(b / 0.01))
    return (i0 + int(_np.argmin(E[i0:i1 + 1]))) * 0.01 + 0.03 if i1 > i0 else (a + b) / 2
def onset(t, d, lim=0.6, th=-42):  # 从 t 起朝 d 方向找第一个超过阈值的点
    i = int(t / 0.01); n = int(lim / 0.01)
    for k_ in range(n):
        j = i + d * k_
        if 0 <= j < len(EDB) and EDB[j] > th: return j * 0.01
    return t
B = [max(0.0, rng[0][0] - 0.4)] + [quiet(rng[k - 1][1] - 0.15, rng[k][0] + 0.15) for k in range(1, len(human))] + [rng[-1][1] + 0.6]
BS, BE = B[:-1], B[1:]  # 每镜的下刀点：起点、终点（默认两镜共用一个刀口）
for k, r in enumerate(human):  # 口误处人工指定了起止：起止各自对到最近的停顿，中间那段不用
    if "start" in r: BS[k] = quiet(r["start"] - 0.25, r["start"] + 0.02)
    if "end" in r: BE[k] = quiet(r["end"], r["end"] + 0.25)
for k, r in enumerate(human):
    sid = r["id"]; s0, s1 = rng[k]
    c0 = max(BS[k], onset(BS[k], 1, 1.5) - 0.12)
    c1 = min(BE[k], onset(BE[k], -1, 1.5) + 0.25 if k + 1 < len(human) else BE[k])
    cuts = [(quiet(a - 0.2, a + 0.1), quiet(b - 0.1, b + 0.2)) for a, b in r.get("cut", []) if c0 < a < c1]
    keep = []; t = c0
    for a, b in cuts: keep.append((t, a)); t = b
    keep.append((t, c1))
    shift = lambda x: x - c0 - sum(min(b, max(a, x)) - a for a, b in cuts)
    parts = "".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.015,areverse,afade=t=in:d=0.04,areverse[p{i}];" for i, (a, b) in enumerate(keep))
    fc = parts + "".join(f"[p{i}]" for i in range(len(keep))) + f"concat=n={len(keep)}:v=0:a=1[o]"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", "-ac", "1", str(HERE / "public" / "vo4" / f"{sid}.wav")], check=True)
    dur = sum(b - a for a, b in keep)
    segs = []
    for j, sg in enumerate(hsegs[k]):
        ii = [i for i, x in enumerate(hidx) if x == (k, j)]
        if ii: segs.append({"text": sg, "start": round(shift(tmap[ii[0]][0]), 3), "end": round(shift(tmap[ii[-1]][1]), 3)})
    # 原脚本分句 → 人声时间（画面关键词用）
    ksegs = []
    if sid in script:
        hc = [c for c in spoken(r["text"]) if c not in PUN and not c.isspace()]
        ht = [(shift(tmap[i][0]), shift(tmap[i][1])) for i, x in enumerate(hidx) if x[0] == k]
        sc, sj = [], []
        ssegs = [s for s in re.split(r"(?<=[，。；：？！])", script[sid]["vo"]) if s.strip()]
        for j, sg in enumerate(ssegs):
            for c in spoken(sg):
                if c in PUN or c.isspace(): continue
                sc.append(c); sj.append(j)
        sm_, _ = align(sc, hc, ht)
        for j, sg in enumerate(ssegs):
            ii = [i for i, x in enumerate(sj) if x == j]
            if ii: ksegs.append({"text": sg, "start": round(sm_[ii[0]][0], 3), "end": round(sm_[ii[-1]][1], 3)})
    out_t[sid] = {"speechStart": segs[0]["start"], "speechEnd": segs[-1]["end"], "segs": segs, "ksegs": ksegs}
    base = script.get(sid, {"id": sid, "section": r.get("section", "")})
    out_s.append({"id": sid, "section": r.get("section", base.get("section", "")), "vo": r["text"], "voLength": round(dur, 3)})
    print(f"{sid:4s} {c0:7.2f}-{c1:7.2f} ({dur:5.2f}s)  {r['text'][:22]}")
json.dump(out_t, open(HERE / "src" / "v2" / "vo_timing4.json", "w"), ensure_ascii=False, indent=1)
json.dump(out_s, open(HERE / "src" / "script4.json", "w"), ensure_ascii=False, indent=2)
print("total speech", round(sum(r["voLength"] for r in out_s), 1))
