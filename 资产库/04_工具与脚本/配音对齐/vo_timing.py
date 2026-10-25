"""配音分句对时：用静音检测找出每段配音里的停顿，对到文稿的标点分句上。
输出 src/v2/vo_timing.json：每镜 speech 起止和每个分句的起止（秒，相对配音文件开头）。
画面里的动作和字幕都按这里卡点。只读本地音频，不调用外部服务。
用法：python3 -I tools/vo_timing.py
"""
import json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
VER = sys.argv[1] if len(sys.argv) > 1 else "2"  # 2：v1/v2 配音；3：2026-10-24 改稿后的配音
script = json.loads((HERE / "src" / f"script{VER}.json").read_text(encoding="utf-8"))
out = {}
for row in script:
    wav = HERE / "public" / f"vo{VER}" / f"{row['id']}.wav"
    log = subprocess.run(["ffmpeg", "-i", str(wav), "-af", "silencedetect=n=-38dB:d=0.10", "-f", "null", "-"], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", log)]
    en = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", log)]
    dur = float(re.search(r"Duration: (\d+):(\d+):([0-9.]+)", log).groups()[2]) + 60 * int(re.search(r"Duration: (\d+):(\d+)", log).group(2))
    sil = list(zip(st, en + [dur] * (len(st) - len(en))))
    s0 = sil[0][1] if sil and sil[0][0] < 0.05 else 0.0
    s1 = sil[-1][0] if sil and sil[-1][1] >= dur - 0.05 else dur
    gaps = [(a, b) for a, b in sil if a > s0 + 0.05 and b < s1 - 0.05]
    segs = [s for s in re.split(r"(?<=[，。；：？！])", row["vo"]) if s.strip()]
    n = len(segs)
    clean = lambda s: re.sub(r"[，。；：？！、“”‘’\s]", "", s)
    lens = [max(1, len(clean(s))) for s in segs]
    tot = sum(lens)
    # 按字数比例估计每个分句边界，再用动态规划整体对齐到真实停顿：
    # 停顿可以多余（不用），边界也可以对不上（罚分），对不上的边界按字数在相邻已对齐边界之间插值
    cum = [sum(lens[: k + 1]) for k in range(n - 1)]
    exp = [s0 + (s1 - s0) * c / tot for c in cum]
    G, K, MISS = len(gaps), n - 1, 1.6  # 停顿数刚好等于分句边界数时，DP 会一一对上
    INF = float("inf")
    dp = [[INF] * (G + 1) for _ in range(K + 1)]; bk = [[None] * (G + 1) for _ in range(K + 1)]
    for g in range(G + 1): dp[0][g] = 0
    for k in range(1, K + 1):
        for g in range(G + 1):
            if g and dp[k][g - 1] < dp[k][g]: dp[k][g], bk[k][g] = dp[k][g - 1], ("skipgap", g - 1)
            if dp[k - 1][g] + MISS < dp[k][g]: dp[k][g], bk[k][g] = dp[k - 1][g] + MISS, ("miss", g)
            if g:
                c = (gaps[g - 1][0] + gaps[g - 1][1]) / 2
                v = dp[k - 1][g - 1] + abs(c - exp[k - 1]) - 0.3 * min(gaps[g - 1][1] - gaps[g - 1][0], 0.6)
                if v < dp[k][g]: dp[k][g], bk[k][g] = v, ("match", g - 1)
    match = [None] * K; k, g = K, G
    while k > 0:
        op, pg = bk[k][g]
        if op == "skipgap": g = pg
        elif op == "miss": k -= 1
        else: match[k - 1] = gaps[pg]; k -= 1; g = pg
    known = [(-1, s0, 0)] + [(i, (match[i][0] + match[i][1]) / 2, cum[i]) for i in range(K) if match[i]] + [(K, s1, tot)]
    bounds = []
    for i in range(K):
        if match[i]: bounds.append(match[i]); continue
        lo = max(x for x in known if x[0] < i); hi = min(x for x in known if x[0] > i)
        t = lo[1] + (hi[1] - lo[1]) * (cum[i] - lo[2]) / max(1, hi[2] - lo[2])
        bounds.append((t, t))
    edges = [(s0, None)] + bounds + [(None, s1)]
    res = []
    for k in range(n):
        a = edges[k][1] if k else s0
        b = edges[k + 1][0] if k < n - 1 else s1
        res.append({"text": segs[k], "start": round(a, 3), "end": round(b, 3)})
    out[row["id"]] = {"speechStart": round(s0, 3), "speechEnd": round(s1, 3), "segs": res}
(HERE / "src" / "v2" / ("vo_timing.json" if VER == "2" else f"vo_timing{VER}.json")).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("ok", len(out))
