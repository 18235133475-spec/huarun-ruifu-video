// 人声版时间线（2026-10-25）：配音是用户的真人录音，按镜头切成 public/vo4，文本和对时见 script4.json、vo_timing4.json（tools/align_human.py）。
// 镜号 O 开场、P 位置、Q 楼栋、R 户型、S 耐心、T 天花板；CP/CQ/CR/CS/CT 是章节标题卡（没有配音，只有配乐）。
// 每个镜头从 from 开始、长 frames 帧；它的画面再往后多留 tail 帧，给下一镜的进场转场垫底。
import { getInputProps } from "remotion";
import script from "../script4.json";
import timing from "./vo_timing4.json";
import openQ from "./open_q.json";

/** 新开头（2026-10-25 用户补录）：黑幕闪出问句“好房子一定要朝正南吗？”，再用三句垫场，然后接 O1。--props 里 "openQ":false 回到 v11 的片名卡开头 */
export const OPEN_Q = (getInputProps() as { openQ?: boolean }).openQ !== false;

export const FPS = 30;
export const LEAD = 0.35, TAIL = 0.45;
export const INTRO = OPEN_Q ? 0.5 : 4.0; // 片名卡，在 A1 配音之前；新开头时只留半秒黑场
const EXTRA: Record<string, number> = { O0: 0.6, P1: 0.6, O3: 0.6, O8: 1.0, O9: 2.8, P3: 0.6, S2: 0.8, T3: 3.5 };
/** 配音中间插一段空当（秒，配音文件内时刻）：这一版没有 */
type Seg = { text: string; start: number; end: number };
/** 配音开头剪掉的秒数：新开头已经问过“朝南吗、正南正北是标准答案”，O3 不再重复前半句，只留“那么，华润的这两栋楼，它为什么要偏偏选择侧身呢？”（整 127 帧 = 4.233 秒，让镜头缩短的帧数和声音剪掉的长度完全相等） */
export const TRIM: Record<string, number> = OPEN_Q ? { O3: 127 / 30 } : {};
type Timing = { speechStart: number; speechEnd: number; segs: Seg[]; ksegs: Seg[] };
const trim = (id: string, v: Timing): Timing => {
  const c = TRIM[id]; if (!c) return v;
  const cut = (ss: Seg[]) => ss.filter((x) => x.start >= c - 0.1).map((x) => ({ ...x, start: x.start - c, end: x.end - c }));
  const segs = cut(v.segs);
  return { speechStart: segs[0].start, speechEnd: v.speechEnd - c, segs, ksegs: cut(v.ksegs) };
};
const T: Record<string, Timing> = Object.fromEntries(Object.entries({ ...(timing as Record<string, Timing>), ...(OPEN_Q ? { O0: openQ.timing } : {}) }).map(([k, v]) => [k, trim(k, v)]));
const segEnd = (id: string, head: string) => (T[id].ksegs.find((s) => s.text.startsWith(head))?.end ?? 0) + 0.06;
export const SPLIT: Record<string, { at: number; gap: number }> = {
  O5: { at: segEnd("O5", "让传统的阴面"), gap: 2.6 }, // “让传统的阴面变成了东北向”之后停一下，留时间看2号楼背面被晨光照亮
  Q3: { at: segEnd("Q3", "电梯门一开"), gap: 1.0 }, // “电梯门一开”之后停一下：看电梯门打开、人走出来
};
const shiftT = (id: string, t: number) => (SPLIT[id] && t >= SPLIT[id].at ? t + SPLIT[id].gap : t);

/** 进场方式：fade 叠化；match 同图连续（短叠化，前后帧几乎一致）；slide 纸面从下方滑入；under 垫在上一镜下面（上一镜自己滑走）；turn 转身；cutpaper 剪纸斑块 */
export type Enter = "fade" | "match" | "slide" | "under" | "turn" | "cutpaper";
const ENTER: Record<string, Enter> = {
  O0: "fade", O1: OPEN_Q ? "fade" : "match", O2: "match", O3: "slide", O4: "under", O5: "match", O5S: "slide", O6: "cutpaper", O7: "match", O8: "slide", O9: "match",
  CP: "fade", P1: "match", P2: "cutpaper", P3: "fade", P4: "slide", P5: "match",
  CQ: "fade", Q1: "turn", Q2: "fade", Q3: "fade",
  CR: "fade", R1: "fade", R2: "turn", R3: "match", R4: "match", R5: "match", R6: "match", R7: "match", R8: "match", R9: "match", R10: "match",
  CS: "fade", S1: "turn", S2: "fade",
  CT: "fade", T1: "fade", T2: "under", T3: "fade",
};
/** 自己滑走、把下一镜露出来的纸面镜头 */
export const EXITS_UP = new Set(["O3", "P3", "T1"]); // O9 不再滑走：镜头升到长风正上方，接 P1 的卫星图
const OVER: Record<Enter, number> = { fade: 12, match: 8, slide: 16, under: 16, turn: 22, cutpaper: 40 };

type Row = (typeof script)[number];
export type Shot = Row & { from: number; frames: number; len: number; enter: Enter; tail: number };
export const SHOTS: Shot[] = (() => {
  let from = Math.round(INTRO * FPS);
  const rows = [...(OPEN_Q ? [openQ.row as Row] : []), ...(script as Row[])].map((r0) => {
    const r = TRIM[r0.id] ? { ...r0, voLength: r0.voLength - TRIM[r0.id] } : r0;
    const len = Math.max(r.voLength + LEAD + TAIL + (EXTRA[r.id] ?? 0) + (SPLIT[r.id]?.gap ?? 0), 2.5);
    const frames = Math.round(len * FPS);
    const s = { ...r, from, frames, len, enter: ENTER[r.id] ?? "fade", tail: 0 };
    from += frames;
    return s;
  });
  rows.forEach((s, i) => { s.tail = i + 1 < rows.length ? OVER[rows[i + 1].enter] : 0; });
  return rows;
})();
export const shotById = (id: string) => SHOTS.find((s) => s.id === id)!;
export const TOTAL_FRAMES = SHOTS[SHOTS.length - 1].from + SHOTS[SHOTS.length - 1].frames + 30;

// ---------- 配音卡点 ----------
/** 关键词在本镜里出现的时刻（秒，镜头内时间）：按原脚本分句（已对到真人录音的时间）和字在句中的位置估算；
 *  真人念法和脚本不同的地方，也能按脚本的词找到对应时刻 */
export const kw = (id: string, word: string, nth = 0) => {
  let seen = 0;
  for (const s of T[id].ksegs.length ? T[id].ksegs : T[id].segs) {
    let idx = s.text.indexOf(word);
    while (idx >= 0) {
      if (seen === nth) {
        const clean = s.text.replace(/[，。；：？！]$/, "");
        return LEAD + shiftT(id, s.start + (s.end - s.start) * (idx / Math.max(1, clean.length)));
      }
      seen++; idx = s.text.indexOf(word, idx + 1);
    }
  }
  throw new Error(`kw: ${id} 里找不到“${word}”`);
};
/** 字幕：分句合并成每条不超过18字 */
export const cues = (id: string) => {
  const out: { text: string; start: number; end: number }[] = [];
  for (const s of T[id].segs) {
    if (id === "O0" && s.text.startsWith("好房子")) continue; // 问句已经大字写在黑幕上，不再出字幕
    const clean = s.text.replace(/[，。；：]$/, "");
    const last = out[out.length - 1];
    const st = LEAD + shiftT(id, Math.max(0, s.start)), en = LEAD + shiftT(id, s.end);
    const brk = SPLIT[id] && s.start >= SPLIT[id].at && last && last.end < st - 1;
    if (last && !brk && (last.text + clean).length <= 17 && !/[。？！]$/.test(last.text)) { last.text += "，" + clean; last.end = en; }
    else out.push({ text: clean, start: st, end: en });
  }
  return out.map((c) => ({ ...c, text: digits(c.text.replace(/[。]$/, "")) }));
};
/** 字幕里的数字统一写成阿拉伯数字（配音仍按中文读），和画面上的 355㎡、22.8米 等一致 */
const DIGITS: [RegExp, string][] = [
  [/三百五十五平方米/g, "355平方米"], [/三百五十五/g, "355"], [/三五五/g, "355"], [/二十二点八米/g, "22.8米"],
  [/二百七十平方米/g, "270平方米"], [/一百零四户/g, "104户"], [/三百平以上/g, "300平以上"], [/三百多平/g, "300多平"],
  [/一百平方米/g, "100平方米"], [/上午十一点/g, "上午11点"],
];
const digits = (s: string) => DIGITS.reduce((a, [re, to]) => a.replace(re, to), s);
