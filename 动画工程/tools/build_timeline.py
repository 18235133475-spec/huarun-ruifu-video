"""从分镜脚本生成动态分镜的时间线和临时配音。

读取 视频/脚本/HR-VIDEO-001_…分镜脚本.md 里的24个镜头，逐镜用 macOS 语音“婷婷”生成临时配音，
按“计划时长”和“配音时长”取较长者定每个镜头的长度，写出 src/timeline.json。
用法：python3 -I tools/build_timeline.py
"""
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SCRIPT = HERE.parent / "脚本" / "HR-VIDEO-001_一栋楼为太原转了个身_分镜脚本.md"
VO = HERE / "public" / "vo"
FPS = 30
VOICE, RATE = "Tingting", 205
LEAD = 0.35  # 每个镜头开始后多久开口
TAIL = 0.45  # 说完到镜头结束至少留多久
PAUSE_AFTER = {"17": 1.0}  # “豪宅比的，是窗外”说完停一拍
PAUSE_BEFORE = {"13": 0.5}  # 转身前留半秒空白
# 画面动作和音效共用的节拍（秒，相对镜头开始）。动画组件和音频脚本都从 timeline.json 读这里
BEATS = {
    "2": {"pencil": [0.2]},
    "5": {"whoosh": [0.0]},
    "6": {"water": [0.8]},
    "7": {"rise": [0.8]},
    "8": {"thud": [1.0, 2.1, 3.2, 4.3, 5.4]},
    "10": {"rise": [0.5]},
    "11": {"paper": [0.4]},
    "12": {"thud": [1.6, 2.2, 2.8, 3.4, 4.0]},
    "13": {"click": [1.3]},
    "14": {"chime": [2.6, 4.6, 6.2, 8.0, 9.4]},
    "16": {"rise": [0.3]},
    "17": {"chime": [0.6, 1.2, 1.8, 2.4, 3.0]},
    "18": {"whoosh": [2.4]},
    "19": {"whoosh": [0.0]},
    "24": {"whoosh": [0.6]},
}

def tsec(t):
    m, s = t.split(":")
    return int(m) * 60 + float(s)


def parse():
    shots, section = [], None
    for line in SCRIPT.read_text(encoding="utf-8").splitlines():
        if line.startswith("### "):
            section = line[4:].split("（")[0].strip()
        m = re.match(r"\|\s*(\d+)\s*\|\s*(\d+:\d+)[–-](\d+:\d+)\s*\|(.*)\|\s*$", line)
        if not m:
            continue
        cells = [c.strip() for c in m.group(4).split("|")]
        picture, vo, subs, flower, ref = (cells + [""] * 5)[:5]
        shots.append({
            "id": m.group(1), "section": section,
            "planned": round(tsec(m.group(3)) - tsec(m.group(2)), 2),
            "picture": picture, "vo": vo,
            "subs": [s for s in subs.split("／") if s] if subs else [],
            "flower": [f.strip() for f in re.split(r"[／]", flower) if f.strip()] if flower else [],
            "ref": ref,
        })
    return shots


def tts(shot):
    aiff, wav = VO / f"s{shot['id']}.aiff", VO / f"s{shot['id']}.wav"
    subprocess.run(["say", "-v", VOICE, "-r", str(RATE), "-o", str(aiff), shot["vo"]], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff), "-ar", "48000", "-ac", "1", str(wav)], check=True)
    aiff.unlink()
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)], capture_output=True, text=True, check=True)
    return float(out.stdout)


def main():
    VO.mkdir(parents=True, exist_ok=True)
    shots = parse()
    assert len(shots) == 24, f"解析到 {len(shots)} 个镜头"
    t = 0.0
    for s in shots:
        d = tts(s)
        lead = LEAD + PAUSE_BEFORE.get(s["id"], 0)
        length = max(s["planned"], lead + d + TAIL + PAUSE_AFTER.get(s["id"], 0))
        s.update({"start": round(t, 3), "length": round(length, 3), "voStart": round(lead, 3), "voLength": round(d, 3),
                  "from": round(t * FPS), "frames": round(length * FPS)})
        # 字幕按字数在配音时长内分配
        total = sum(len(x) for x in s["subs"]) or 1
        acc, cues = lead, []
        for x in s["subs"]:
            dur = d * len(x) / total
            cues.append({"text": x, "start": round(acc, 3), "end": round(acc + dur, 3)})
            acc += dur
        s["cues"] = cues
        s["beats"] = BEATS.get(s["id"], {})
        t += length
    out = {"fps": FPS, "width": 1920, "height": 1080, "totalFrames": sum(s["frames"] for s in shots), "shots": shots}
    (HERE / "src" / "timeline.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(shots)} shots, {t:.1f}s")
    for s in shots:
        print(s["id"], s["section"], s["planned"], "→", s["length"], s["vo"][:18])


if __name__ == "__main__":
    main()
