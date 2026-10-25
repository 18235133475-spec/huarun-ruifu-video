// 文章视频化（HR-VIDEO-002）：按公众号主稿讲一遍。
// 画面四种来源：即梦生成的大场景视频、文中户型图解、三维（转身、视线）、文字卡。
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import script from "./script2.json";
import { C, clamp, ease, lerp, prog, useT } from "./lib";
import { S13, S14 } from "./shots";
import { loadWorld, worldReady } from "./world";

const FPS = 30;
const LEAD = 0.35, TAIL = 0.45, OVERLAP = 12;
const SERIF = '"Songti SC", "STSong", serif';
const SANS = '"PingFang SC", "Hiragino Sans GB", sans-serif';
type Row = (typeof script)[number];

// ---------- 每个镜头的画面 ----------
type Note = "render" | "ai" | "diagram" | "none";
type Spec =
  | { kind: "ai"; clip: string; note: Note; from?: number; to?: number }
  | { kind: "still"; src: string; note: Note; fx?: number; fy?: number; z0?: number; z1?: number; dark?: boolean }
  | { kind: "diagram"; src: string; aspect: number; focus?: [number, number, number]; note?: Note }
  | { kind: "card"; card: string }
  | { kind: "s13" | "s14" | "portrait" | "units" | "data" | "end" };

const SPEC: Record<string, Spec> = {
  A1: { kind: "ai", clip: "V01", note: "render" },
  A2: { kind: "s13" },
  A3: { kind: "card", card: "south" },
  A4: { kind: "s14" },
  A5: { kind: "ai", clip: "V02", note: "render" },
  A6: { kind: "card", card: "ceiling" },
  B1: { kind: "ai", clip: "V03", note: "render" },
  B2: { kind: "ai", clip: "V04", note: "render" },
  B3: { kind: "ai", clip: "V05", note: "render" },
  B4: { kind: "ai", clip: "V06", note: "render" },
  B5: { kind: "card", card: "salute" },
  B6: { kind: "ai", clip: "V07", note: "ai" },
  B7: { kind: "ai", clip: "V08", note: "ai" },
  B8: { kind: "portrait" },
  B9: { kind: "ai", clip: "V09", note: "render" },
  B10: { kind: "ai", clip: "V10", note: "ai" },
  B11: { kind: "card", card: "notevery" },
  C1: { kind: "units" },
  C2: { kind: "diagram", src: "plan.jpg", aspect: 1375 / 1959, focus: [0.42, 0.36, 1.9], note: "diagram" },
  C3: { kind: "diagram", src: "plan.jpg", aspect: 1375 / 1959, focus: [0.55, 0.64, 1.6], note: "diagram" },
  D1: { kind: "diagram", src: "plan.jpg", aspect: 1375 / 1959, note: "diagram" },
  D2: { kind: "diagram", src: "zong.png", aspect: 2376 / 2272, focus: [0.6, 0.62, 1.1], note: "diagram" },
  D3: { kind: "diagram", src: "daynight.png", aspect: 1375 / 1015 },
  D4: { kind: "diagram", src: "window.png", aspect: 1375 / 1100 },
  D5: { kind: "diagram", src: "heng.png", aspect: 2376 / 2272, focus: [0.5, 0.62, 1.1], note: "diagram" },
  D6: { kind: "diagram", src: "master.png", aspect: 2376 / 2272, focus: [0.32, 0.65, 1.15], note: "diagram" },
  D7: { kind: "diagram", src: "both.png", aspect: 2376 / 2272, focus: [0.5, 0.62, 1.08], note: "diagram" },
  E1: { kind: "ai", clip: "V11", note: "render" },
  E2: { kind: "data" },
  F1: { kind: "ai", clip: "V12", note: "render" },
  F2: { kind: "still", src: "client/c05.jpg", note: "render", fx: 0.5, fy: 0.45, z0: 1.05, z1: 1.25 },
  F3: { kind: "end" },
};
const CHAPTER: Record<string, string> = { B1: "一 · 它转过身，看见了什么", C1: "二 · 独占一个单元", D1: "三 · 一纵一横，看懂这张平面", E1: "四 · 华润的耐心", F1: "五 · 天花板，到底是什么" };
const EXTRA: Record<string, number> = { A3: 0.6, A6: 1.0, B5: 1.0, B11: 0.6, E2: 0.8, F3: 3.0 };

// 时间线
const shots = (() => {
  let from = 0;
  return (script as Row[]).map((r) => {
    const length = Math.max(r.voLength + LEAD + TAIL + (EXTRA[r.id] ?? 0), 2.5);
    const frames = Math.round(length * FPS);
    const s = { ...r, length, frames, from };
    from += frames;
    return s;
  });
})();
export const FILM2_FRAMES = shots[shots.length - 1].from + shots[shots.length - 1].frames + OVERLAP;

// ---------- 画面组件 ----------
const NoteTag: React.FC<{ note: Note }> = ({ note }) =>
  note === "none" ? null : (
    <div style={{ position: "absolute", left: 40, bottom: 30, fontFamily: SANS, fontSize: 20, color: "rgba(255,255,255,.85)", textShadow: "0 1px 6px rgba(0,0,0,.7)" }}>
      {note === "render" ? "效果示意，最终以规划审批为准" : note === "ai" ? "示意画面，依据真实地形与建筑位置生成" : "按户型示意图绘制，尺寸以交付标准为准"}
    </div>
  );

/** 即梦视频：先放视频（必要时放慢），视频放完后接首帧静帧继续缓推 */
const AIClip: React.FC<{ clip: string; len: number }> = ({ clip, len }) => {
  const t = useT();
  const rate = clamp(5 / len, 0.55, 1);
  const vidLen = 5 / rate;
  const hold = prog(t, vidLen - 0.6, vidLen);
  const z = lerp(1.0, 1.06, t / len);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${z})` }}>
        <OffthreadVideo src={staticFile(`ai/${clip}.mp4`)} playbackRate={rate} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      {len > vidLen ? (
        <AbsoluteFill style={{ opacity: hold, transform: `scale(${lerp(1.04, 1.12, prog(t, vidLen - 0.6, len))})` }}>
          <Img src={staticFile(`ai/${clip}_last.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

const StillKB: React.FC<{ src: string; len: number; fx?: number; fy?: number; z0?: number; z1?: number }> = ({ src, len, fx = 0.5, fy = 0.5, z0 = 1.02, z1 = 1.15 }) => {
  const t = useT();
  const z = lerp(z0, z1, ease(t / len));
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})`, transformOrigin: `${fx * 100}% ${fy * 100}%` }} />
    </AbsoluteFill>
  );
};

/** 文中图解：放在米白画布中，缓慢推向重点区域 */
const Diagram: React.FC<{ src: string; aspect: number; len: number; focus?: [number, number, number] }> = ({ src, aspect, len, focus }) => {
  const t = useT();
  const H = 1000, W = H * aspect;
  const k = ease(prog(t, 0.6, Math.min(len - 0.3, 4.5)));
  const [fx, fy, fz] = focus ?? [0.5, 0.5, 1.06];
  const z = lerp(1, fz, k);
  const tx = (0.5 - fx) * W * (z - 1), ty = (0.5 - fy) * H * (z - 1);
  return (
    <AbsoluteFill style={{ background: "#f3efe8", overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: "blur(30px) brightness(1.05)", opacity: 0.5 }}>
        <Img src={staticFile(`article/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 960 - W / 2, top: 40, width: W, height: H, transform: `translate(${tx}px, ${ty}px) scale(${z})`, boxShadow: "0 20px 60px rgba(60,50,40,.25)" }}>
        <Img src={staticFile(`article/${src}`)} style={{ width: "100%", height: "100%", display: "block" }} />
      </div>
    </AbsoluteFill>
  );
};

const Card: React.FC<{ card: string; len: number }> = ({ card, len }) => {
  const t = useT();
  const a = prog(t, 0.2, 0.9);
  const bg = <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, #1d2126 0%, #0b0d10 75%)" }} />;
  if (card === "south")
    return (
      <AbsoluteFill>{bg}
        <div style={{ position: "absolute", top: 360, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#f3d7a6", fontSize: 120, fontWeight: 700, opacity: a, letterSpacing: 10 }}>朝南吗？</div>
        <div style={{ position: "absolute", top: 560, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#d9cdb8", fontSize: 44, opacity: prog(t, len * 0.45, len * 0.55) }}>放着正南不朝，它图什么？</div>
      </AbsoluteFill>
    );
  if (card === "ceiling") {
    const items = ["位置", "楼栋", "平面", "耐心"];
    return (
      <AbsoluteFill>{bg}
        <div style={{ position: "absolute", top: 230, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#d9cdb8", fontSize: 40, opacity: a }}>太原三百多平的大平层</div>
        <div style={{ position: "absolute", top: 300, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#f3d7a6", fontSize: 150, fontWeight: 700, letterSpacing: 16, opacity: prog(t, 0.8, 1.6) }}>天花板</div>
        <div style={{ position: "absolute", top: 600, width: "100%", display: "flex", justifyContent: "center", gap: 70 }}>
          {items.map((s, i) => {
            const k = prog(t, len * 0.55 + i * 0.45, len * 0.55 + i * 0.45 + 0.4);
            return <div key={i} style={{ opacity: k, transform: `translateY(${(1 - k) * 16}px)`, border: "1.5px solid rgba(243,215,166,.6)", padding: "18px 34px", fontFamily: SERIF, fontSize: 46, color: "#f3d7a6" }}>{s}</div>;
          })}
        </div>
      </AbsoluteFill>
    );
  }
  if (card === "salute")
    return (
      <AbsoluteFill>
        <StillKB src="ai/V10_last.jpg" len={len} />
        <AbsoluteFill style={{ background: "rgba(8,10,12,.62)" }} />
        <div style={{ position: "absolute", top: 380, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#fff", fontSize: 54, opacity: a, letterSpacing: 4 }}>它转过身，是把正面留给太原</div>
        <div style={{ position: "absolute", top: 500, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#f3d7a6", fontSize: 72, fontWeight: 700, opacity: prog(t, len * 0.5, len * 0.6), letterSpacing: 8 }}>这一转，是看，也是致敬</div>
      </AbsoluteFill>
    );
  // notevery
  return (
    <AbsoluteFill>
      <StillKB src="ai/V03.jpg" len={len} />
      <AbsoluteFill style={{ background: "rgba(8,10,12,.6)" }} />
      <div style={{ position: "absolute", top: 400, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#fff", fontSize: 50, opacity: a, lineHeight: 1.6 }}>
        不是每一层、每一扇窗<br />都能把这些一次装进来
      </div>
    </AbsoluteFill>
  );
};

export const PORTRAIT_THEATRE = [
  "M560 700 L 1360 700 L 1360 560 L 560 560 Z", "M500 560 C 700 470 1220 470 1420 560",
  "M470 520 C 700 400 1220 400 1450 520 L 1420 560 M 470 520 L 500 560",
  "M640 700 L 640 560 M 800 700 L 800 560 M 960 700 L 960 560 M 1120 700 L 1120 560 M 1280 700 L 1280 560", "M420 760 L 1500 760",
];
const Portrait: React.FC<{ len: number }> = ({ len }) => {
  const t = useT();
  const split = len * 0.5;
  const reveal = prog(t, 0.2, 2.6);
  const out = 1 - prog(t, split - 0.4, split + 0.3);
  return (
    <AbsoluteFill style={{ background: "#0b0d10" }}>
      <div style={{ position: "absolute", left: 960 - 380, top: 90, width: 760, height: 760, opacity: out, clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)`, transform: `scale(${lerp(1, 1.04, t / len)})` }}>
        <Img src={staticFile("article/portrait.png")} style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 870, textAlign: "center", fontFamily: SERIF, color: C.gold, opacity: prog(t, 1.6, 2.4) * out }}>
        <div style={{ fontSize: 40, letterSpacing: 6 }}>让-马里·夏邦杰　1939–2010</div>
        <div style={{ fontSize: 22, marginTop: 6, letterSpacing: 4, color: C.goldSoft }}>Arte Charpentier 事务所创始人　·　线描依据事务所官方肖像</div>
      </div>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, opacity: prog(t, split, split + 0.3) }}>
        {PORTRAIT_THEATRE.map((d, i) => (
          <path key={i} d={d} pathLength={1} fill="none" stroke={C.gold} strokeWidth={3} strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - prog(t, split + i * 0.3, split + 1.2 + i * 0.3)} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 820, textAlign: "center", fontFamily: SERIF, fontSize: 44, color: C.gold, letterSpacing: 8, opacity: prog(t, split + 1.4, split + 2.0) }}>上海大剧院</div>
    </AbsoluteFill>
  );
};

/** 2号楼两个单元的示意 */
const Units: React.FC<{ len: number }> = ({ len }) => {
  const t = useT();
  const a = prog(t, 0.3, 1.0), b = prog(t, len * 0.45, len * 0.6);
  const floors = 14;
  return (
    <AbsoluteFill style={{ background: "#f3efe8" }}>
      <div style={{ position: "absolute", left: 120, top: 90, fontFamily: SERIF, color: "#2c2a26" }}>
        <div style={{ fontFamily: SANS, fontSize: 22, letterSpacing: 6, color: "#a0896a" }}>2号楼 · 两个单元</div>
        <div style={{ fontSize: 58, fontWeight: 700, marginTop: 8 }}>这一层，只住一家人</div>
      </div>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: floors }).map((_, i) => {
          const y = 760 - i * 40;
          return (
            <g key={i} opacity={a}>
              <rect x={560} y={y} width={190} height={32} fill="#d9d3c8" />
              <rect x={754} y={y} width={190} height={32} fill="#d9d3c8" />
              <rect x={990} y={y} width={380} height={32} fill={b > 0 ? `rgba(217,180,106,${0.35 + 0.65 * b})` : "#d9d3c8"} />
            </g>
          );
        })}
        <text x={752} y={845} textAnchor="middle" fontFamily={SANS} fontSize={30} fill="#5e564c" opacity={a}>单元一 · 每层两套</text>
        <text x={752} y={885} textAnchor="middle" fontFamily={SANS} fontSize={24} fill="#8a7f70" opacity={a}>230㎡+　＋　270㎡+</text>
        <text x={1180} y={845} textAnchor="middle" fontFamily={SANS} fontSize={30} fill="#7a5a22" fontWeight={600} opacity={b}>单元二 · 每层只有一套</text>
        <text x={1180} y={885} textAnchor="middle" fontFamily={SANS} fontSize={24} fill="#7a5a22" opacity={b}>约355㎡　·　两梯一户</text>
      </svg>
      <div style={{ position: "absolute", right: 60, bottom: 26, fontFamily: SANS, fontSize: 18, color: "#8a7f70" }}>示意图，不对应实际层数</div>
    </AbsoluteFill>
  );
};

const Data: React.FC<{ len: number }> = ({ len }) => {
  const t = useT();
  const k = ease(prog(t, 1.0, 3.2));
  const homes = Math.round(lerp(1290, 1186, k));
  return (
    <AbsoluteFill style={{ background: "#0d1013" }}>
      <div style={{ position: "absolute", left: 140, top: 110, fontFamily: SANS, fontSize: 24, letterSpacing: 6, color: "#a99a80" }}>2025 · 地块一规划调整公示（6月方案 → 9月拟变更方案）</div>
      <div style={{ position: "absolute", left: 140, top: 230, fontFamily: SERIF, color: "#fff" }}>
        <div style={{ fontSize: 34, color: "#cfc6b6" }}>地上计容面积</div>
        <div style={{ fontSize: 86, fontWeight: 700, marginTop: 10 }}>461,359.07㎡ <span style={{ fontSize: 40, color: "#f3d7a6" }}>一平米没变</span></div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 520, fontFamily: SERIF, color: "#fff" }}>
        <div style={{ fontSize: 34, color: "#cfc6b6" }}>总户数</div>
        <div style={{ fontSize: 86, fontWeight: 700, marginTop: 10 }}>1290 → {homes}户 <span style={{ fontSize: 40, color: "#f3d7a6", opacity: prog(t, 3.0, 3.6) }}>少了104户</span></div>
      </div>
      <div style={{ position: "absolute", left: 140, top: 820, fontFamily: SERIF, fontSize: 56, color: "#f3d7a6", opacity: prog(t, len - 2.6, len - 1.8), letterSpacing: 6 }}>往大，往少</div>
      <div style={{ position: "absolute", left: 140, bottom: 30, fontFamily: SANS, fontSize: 18, color: "#7e776c" }}>口径为地块一整体，非2号楼单栋</div>
    </AbsoluteFill>
  );
};

const End: React.FC<{ len: number }> = ({ len }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: "#0b0d10" }}>
      <div style={{ position: "absolute", top: 330, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#d9cdb8", fontSize: 46, opacity: prog(t, 0.2, 0.9) }}>所谓天花板，意思很简单</div>
      <div style={{ position: "absolute", top: 430, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#f3d7a6", fontSize: 110, fontWeight: 700, letterSpacing: 14, opacity: prog(t, 1.6, 2.4) }}>再往上，没有了</div>
      <div style={{ position: "absolute", top: 700, width: "100%", textAlign: "center", fontFamily: SERIF, color: "#f3d7a6", opacity: prog(t, len - 3.2, len - 2.4) }}>
        <div style={{ fontSize: 38, letterSpacing: 6 }}>华润 · 太原瑞府</div>
        <div style={{ fontSize: 26, marginTop: 10, letterSpacing: 4 }}>2号楼　建筑面积约355㎡</div>
      </div>
      <div style={{ position: "absolute", bottom: 26, width: "100%", textAlign: "center", fontFamily: SANS, fontSize: 16, color: "#6f695f", opacity: prog(t, len - 3.2, len - 2.4), lineHeight: 1.6 }}>
        效果图及部分 AI 生成画面均为示意，最终以规划审批和交付标准为准　｜　建筑数据：3D-GloBFP（Che et al., 2024）CC BY 4.0　｜　地图数据：© OpenStreetMap contributors　｜　高程：AWS Terrain Tiles
      </div>
    </AbsoluteFill>
  );
};

const Visual: React.FC<{ id: string; len: number }> = ({ id, len }) => {
  const s = SPEC[id];
  switch (s.kind) {
    case "ai": return <><AIClip clip={s.clip} len={len} /><NoteTag note={s.note} /></>;
    case "still": return <><StillKB src={s.src} len={len} fx={s.fx} fy={s.fy} z0={s.z0} z1={s.z1} /><NoteTag note={s.note} /></>;
    case "diagram": return <><Diagram src={s.src} aspect={s.aspect} len={len} focus={s.focus} />{s.note ? <NoteTagDark note={s.note} /> : null}</>;
    case "card": return <Card card={s.card} len={len} />;
    case "s13": return <S13 len={len} beats={{ click: [0.9] }} />;
    case "s14": return <S14 len={len} beats={{ chime: [2.2, 3.0, 4.6, 7.4, 8.8] }} />;
    case "portrait": return <Portrait len={len} />;
    case "units": return <Units len={len} />;
    case "data": return <Data len={len} />;
    case "end": return <End len={len} />;
  }
};
const NoteTagDark: React.FC<{ note: Note }> = ({ note }) => (
  <div style={{ position: "absolute", left: 40, bottom: 30, fontFamily: SANS, fontSize: 18, color: "#8a7f70" }}>{note === "diagram" ? "按户型示意图绘制，尺寸以交付标准为准" : ""}</div>
);

// ---------- 字幕 ----------
const cuesOf = (text: string, len: number) => {
  const parts = text.split(/(?<=[，。；：？！])/).map((s) => s.trim()).filter(Boolean);
  // 合并成每条不超过18字
  const lines: string[] = [];
  for (const p of parts) {
    const clean = p.replace(/[，。；：]$/, "");
    if (lines.length && (lines[lines.length - 1] + clean).length <= 18 && !/[。？！]$/.test(lines[lines.length - 1] + "")) lines[lines.length - 1] += "，" + clean;
    else lines.push(clean);
  }
  const total = lines.reduce((a, l) => a + l.length, 0);
  let at = LEAD;
  return lines.map((l) => { const d = (len - LEAD - TAIL) * (l.length / total); const c = { text: l, start: at, end: at + d }; at += d; return c; });
};
const Captions: React.FC<{ text: string; len: number }> = ({ text, len }) => {
  const t = useCurrentFrame() / FPS;
  const cues = React.useMemo(() => cuesOf(text, len), [text, len]);
  const cue = cues.find((c) => t >= c.start && t < c.end + 0.1);
  if (!cue) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 72, display: "flex", justifyContent: "center" }}>
      <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 600, color: "#fff", padding: "8px 24px", borderRadius: 8, background: "rgba(0,0,0,.40)", letterSpacing: 1 }}>{cue.text}</div>
    </div>
  );
};
const Chapter: React.FC<{ title: string }> = ({ title }) => {
  const t = useT();
  const k = prog(t, 0.3, 1.0) * (1 - prog(t, 3.2, 3.9));
  return k > 0 ? (
    <div style={{ position: "absolute", left: 60, top: 50, opacity: k, fontFamily: SERIF, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>
      <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: 4 }}>{title}</div>
      <div style={{ width: 120 * k, height: 2, background: "#f3d7a6", marginTop: 12 }} />
    </div>
  ) : null;
};

const FadeIn: React.FC<{ first: boolean; children: React.ReactNode }> = ({ first, children }) => {
  const f = useCurrentFrame();
  const o = first ? 1 : interpolate(f, [0, OVERLAP], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Film2: React.FC = () => {
  const [ready, setReady] = useState(worldReady());
  useEffect(() => { if (!ready) loadWorld().then(() => setReady(true)); }, [ready]);
  const total = FILM2_FRAMES / FPS;
  if (!ready) return <AbsoluteFill style={{ background: "#000" }} />;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {shots.map((s, i) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.frames + OVERLAP} name={`${s.id} ${s.section}`}>
          <FadeIn first={i === 0}>
            <Visual id={s.id} len={s.length} />
            {CHAPTER[s.id] ? <Chapter title={CHAPTER[s.id]} /> : null}
            <Captions text={s.vo} len={s.length} />
          </FadeIn>
        </Sequence>
      ))}
      {shots.map((s) => (
        <Sequence key={`vo${s.id}`} from={s.from + Math.round(LEAD * FPS)} durationInFrames={Math.ceil((s.voLength + 0.3) * FPS)}>
          <Audio src={staticFile(`vo2/${s.id}.wav`)} />
        </Sequence>
      ))}
      <Audio src={staticFile("music/piano.mp3")} volume={(f) => 0.16 * clamp(f / 60) * clamp((total * FPS - f) / 90)} />
    </AbsoluteFill>
  );
};
