// “位置 · 长风的来历”的故事底板：P1 这里原来是什么样（2003 / 2025 同一范围卫星照片）、P4 法国事务所与两座大剧院（素描线稿）、P5 田地长成了城市名片。
// 叙事段不在三维模型上讲：同一块纸面底板 + 顶部时间轴。
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp, ease } from "../lib";
import { pr, useT } from "./open";
import { Footnote, P, SANS, SERIF } from "./theme";
import { kw, shotById } from "./timeline";

const NODES = [
  { y: "二十多年前", t: "长风还是一片田地" },
  { y: "造岛", t: "引汾河水，围出文化岛" },
  { y: "法国事务所", t: "夏邦杰创立" },
  { y: "2012", t: "山西大剧院交付" },
  { y: "今天", t: "太原的城市名片" },
];
/** 顶部时间轴：at 为当前节点（可为小数，表示正在走向下一个） */
const Timeline: React.FC<{ at: number; k?: number }> = ({ at, k = 1 }) => {
  const x0 = 260, x1 = 1660, y = 190;
  const xs = NODES.map((_, i) => x0 + ((x1 - x0) * i) / (NODES.length - 1));
  const px = x0 + (x1 - x0) * clamp(at / (NODES.length - 1));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: k, fontFamily: SANS }}>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
        <line x1={x0} y1={y} x2={x1} y2={y} stroke={P.line} strokeWidth={3} />
        <line x1={x0} y1={y} x2={px} y2={y} stroke={P.hero} strokeWidth={4} />
        {xs.map((x, i) => <circle key={i} cx={x} cy={y} r={i <= at + 0.01 ? 11 : 8} fill={i <= at + 0.01 ? P.hero : "#fff"} stroke={i <= at + 0.01 ? P.hero : P.line} strokeWidth={3} />)}
      </svg>
      {NODES.map((n, i) => {
        const on = i <= at + 0.01, cur = Math.abs(i - at) < 0.5;
        return (
          <div key={i} style={{ position: "absolute", left: xs[i], top: y - 66, transform: "translateX(-50%)", textAlign: "center", whiteSpace: "nowrap", opacity: on ? 1 : 0.45 }}>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: cur ? 28 : 22, color: on ? P.ink : P.ink2, height: 40 }}>{n.y}</div>
            <div style={{ fontSize: 17, color: P.ink2, marginTop: 44 }}>{n.t}</div>
          </div>
        );
      })}
    </div>
  );
};
const Card: React.FC<{ x: number; y: number; w: number; h: number; k: number; children: React.ReactNode; caption?: string; sub?: string }> = ({ x, y, w, h, k, children, caption, sub }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, opacity: k, transform: `translateY(${(1 - k) * 18}px)` }}>
    <div style={{ width: w, height: h, overflow: "hidden", background: "#fff", boxShadow: "0 14px 40px rgba(60,45,30,.16)", border: "8px solid #fff", position: "relative" }}>{children}</div>
    {caption ? <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 34, color: P.ink, marginTop: 16 }}>{caption}</div> : null}
    {sub ? <div style={{ fontFamily: SANS, fontSize: 19, color: P.ink2, marginTop: 6 }}>{sub}</div> : null}
  </div>
);
const Board: React.FC<{ children: React.ReactNode; at: number; credit?: string }> = ({ children, at, credit }) => (
  <AbsoluteFill style={{ background: P.paper }}>
    <div style={{ position: "absolute", left: 96, top: 60, fontFamily: SANS, fontSize: 22, color: P.hero, letterSpacing: 3 }}>位置 · 长风的来历</div>
    {children}
    <Timeline at={at} />
    {credit ? <Footnote text={credit} /> : null}
  </AbsoluteFill>
);

/** 素描线稿进场：像笔从左往右扫过去一样画出来（边缘带一段羽化），只有线，不再晕染颜色 */
const Sketch: React.FC<{ name: string; k: number; pos?: string }> = ({ name, k, pos = "50% 50%" }) => {
  const e = k * 130 - 15;
  const mask = `linear-gradient(100deg, #000 ${e}%, transparent ${e + 15}%)`;
  return (
    <div style={{ position: "absolute", inset: 0, WebkitMaskImage: mask, maskImage: mask }}>
      <Img src={staticFile(`v2/${name}.png`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos }} />
    </div>
  );
};

// ---------- 卫星照片对比（2003 / 2025，用户提供的谷歌地球同范围截图，build_ge.py 去掉地名） ----------
const GE = { x: 96, y: 268, w: 1180, h: 664 }; // 卡片位置：1090×613 原图放大 1.08 倍
const GE_S = GE.w / 1090;
const geXY = (X: number, Z: number): [number, number] => [GE.x + (410 + (X - 605) / 6.55) * GE_S, GE.y + (240 + (Z + 12) / 6.55) * GE_S]; // 场景坐标 → 卡片上的像素（汾河、跻汾桥、南中环桥对位，约 6.55 米/像素）
const SAT_CREDIT = "卫星影像：Google 地球，2003 年与 2025 年同一范围（地名标注已去除）";
const RUIFU_XY: [number, number] = [175.7, 759.3];
const GeFrame: React.FC<{ r: { x: number; y: number; w: number; h: number }; reveal: number; border: number; children?: React.ReactNode }> = ({ r, reveal, border, children }) => (
  <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, overflow: "hidden", zIndex: 5, boxShadow: border > 0.02 ? "0 14px 40px rgba(60,45,30,.18)" : undefined, outline: `${8 * border}px solid #fff` }}>
    <Img src={staticFile("v2/ge_2003.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)` }}>
      <Img src={staticFile("v2/ge_2025.jpg")} style={{ width: "100%", height: "100%" }} />
    </div>
    {reveal > 0.01 && reveal < 0.99 ? <div style={{ position: "absolute", top: 0, bottom: 0, left: `${reveal * 100}%`, width: 4, marginLeft: -2, background: "#fff", boxShadow: "0 0 10px rgba(0,0,0,.4)" }} /> : null}
    <div style={{ position: "absolute", left: 16, top: 14, background: "rgba(255,255,255,.92)", padding: "5px 12px", fontFamily: SANS, fontSize: 22, fontWeight: 600, color: P.ink, opacity: border }}>{reveal > 0.5 ? "2025年" : "2003年"}</div>
    {children}
  </div>
);
/** 长风（文化岛 + 西侧商务区）在照片上的范围：文化岛轮廓取 public/city/island.json，商务区按万象城一带向西扩 */
const CHANGFENG: [number, number][] = [[349, -648], [300, -616], [-163, -311], [-700, -380], [-720, 420], [-149, 339], [295, 673]];
const Changfeng: React.FC<{ k: number; sight: number }> = ({ k, sight }) => {
  const q = CHANGFENG.map((p) => { const [x, y] = geXY(p[0], p[1]); return [x - GE.x, y - GE.y]; });
  const [rx, ry] = geXY(...RUIFU_XY); const r0 = [rx - GE.x, ry - GE.y];
  const c = [q.reduce((a, b) => a + b[0], 0) / q.length, q.reduce((a, b) => a + b[1], 0) / q.length];
  const targets = [q[6], [(q[5][0] + q[6][0]) / 2, (q[5][1] + q[6][1]) / 2], c, [(q[0][0] + c[0]) / 2, (q[0][1] + c[1]) / 2]];
  return (
    <div style={{ position: "absolute", inset: 0, opacity: k }}>
      <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <polygon points={q.map((p) => p.join(",")).join(" ")} fill={P.hero} fillOpacity={0.22} stroke="#fff" strokeWidth={3} strokeDasharray="10 7" />
        {targets.map((tt, i) => <line key={i} x1={r0[0]} y1={r0[1]} x2={r0[0] + (tt[0] - r0[0]) * sight} y2={r0[1] + (tt[1] - r0[1]) * sight} stroke="#fff" strokeWidth={2.5} strokeDasharray="3 7" strokeLinecap="round" />)}
      </svg>
      <div style={{ position: "absolute", left: c[0], top: c[1], transform: "translate(-50%,-50%)", background: "rgba(255,255,255,.94)", padding: "6px 16px", textAlign: "center", fontFamily: SANS, boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 30, color: P.ink }}>长风</div>
        <div style={{ fontSize: 17, color: P.ink2 }}>文化岛 · 商务区</div>
      </div>
    </div>
  );
};

/** 瑞府1、2号楼在照片上的位置：一个赤陶色定位点 + 标签；fan 为朝西南的视线扇 */
const RuifuPin: React.FC<{ k: number; label: string; fan?: number; dashed?: boolean }> = ({ k, label, fan = 0, dashed }) => {
  const [x, y] = geXY(...RUIFU_XY);
  const lx = x - GE.x, ly = y - GE.y;
  const a0 = ((217.7 - 35 - 90) * Math.PI) / 180, a1 = ((217.7 + 35 - 90) * Math.PI) / 180, R = 170 * fan;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: k }}>
      <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible" }}>
        {fan > 0.01 ? <path d={`M ${lx} ${ly} L ${lx + Math.cos(a0) * R} ${ly + Math.sin(a0) * R} A ${R} ${R} 0 0 1 ${lx + Math.cos(a1) * R} ${ly + Math.sin(a1) * R} Z`} fill={P.hero} opacity={0.35} /> : null}
        <circle cx={lx} cy={ly} r={22} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray={dashed ? "5 5" : undefined} />
        <circle cx={lx} cy={ly} r={9} fill={P.hero} stroke="#fff" strokeWidth={3} />
      </svg>
      <div style={{ position: "absolute", left: lx + 30, top: ly - 20, background: P.hero, color: "#fff", fontFamily: SANS, fontSize: 22, fontWeight: 600, padding: "4px 12px", whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
};

// ---------- P1 这里原来是什么样？二十多年前，这里还是一片田地 ----------
export const P1: React.FC = () => {
  const t = useT();
  // 接上一镜长风正上方的俯视（同一取景）：先是全屏的 2025，往回划到 2003，再缩成左边的大卡片
  const back = pr(t, 0.5, 1.2), kz = ease(clamp((t - 1.2) / 1.1));
  const r = { x: GE.x * kz, y: GE.y * kz, w: 1920 + (GE.w - 1920) * kz, h: 1080 + (GE.h - 1080) * kz };
  const kq = pr(t, 1.8, 0.5), kt = pr(t, kw("P1", "二十多年前") - 0.2, 0.6), kp = pr(t, kw("P1", "田地") + 0.2, 0.5);
  return (
    <Board at={0} credit={SAT_CREDIT}>
      <GeFrame r={r} reveal={1 - back} border={kz}>
        {kz > 0.99 ? <RuifuPin k={kp} label="今天瑞府的位置" dashed /> : null}
      </GeFrame>
      <div style={{ position: "absolute", left: 1340, top: 330, width: 500, fontFamily: SANS }}>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 38, color: P.ink2, opacity: kq }}>这里原来是什么样？</div>
        <div style={{ opacity: kt, transform: `translateY(${(1 - kt) * 14}px)` }}>
          <div style={{ fontSize: 26, color: P.hero, letterSpacing: 4, marginTop: 64 }}>二十多年前</div>
          <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 72, color: P.ink, marginTop: 12, letterSpacing: 2, lineHeight: 1.2 }}>还是<br />一片田地</div>
          <div style={{ fontSize: 23, color: P.ink2, marginTop: 22, lineHeight: 1.7 }}>2003年的卫星照片里<br />汾河西岸是成片的庄稼地</div>
        </div>
      </div>
    </Board>
  );
};

// ---------- P4 法国事务所；上海大剧院；山西大剧院 ----------
export const P4: React.FC = () => {
  const t = useT();
  const tf = kw("P4", "法国事务所"), tw = kw("P4", "他们最知名"), ts = kw("P4", "上海大剧院"), tx = kw("P4", "山西大剧院");
  const at = 1 + pr(t, tf - 0.4, 0.8) + pr(t, tx - 0.4, 0.8);
  const kf = pr(t, tf - 0.5, 0.6), kd = pr(t, tf - 0.5, 1.8);
  const ksg = pr(t, ts - 0.9, 0.5), ksx = pr(t, tx - 0.4, 0.6);
  return (
    <Board at={at} credit="素描依据公开照片绘制：上海大剧院 xiquinhosilva（CC BY 4.0）、山西大剧院 xiquinhosilva（CC BY 2.0），Wikimedia Commons；肖像为依据公开肖像绘制的线描">
      <div style={{ position: "absolute", left: 140, top: 300, fontFamily: SERIF, fontWeight: 900, fontSize: 40, color: P.ink2, opacity: pr(t, 0.2, 0.6) }}>最早提出要造这座岛的</div>
      <Card x={140} y={370} w={400} h={400} k={kf} caption="一家法国事务所" sub="Arte Charpentier · 夏邦杰创立">
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 0 ${(1 - kd) * 100}% 0)` }}>
          <Img src={staticFile("v2/portrait_ink.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </Card>
      <div style={{ position: "absolute", left: 700, top: 310, fontFamily: SANS, fontSize: 24, color: P.ink2, opacity: pr(t, tw - 0.3, 0.5) * (1 - ksx) }}>他们最知名的作品</div>
      <Card x={700} y={370} w={1080} h={500} k={ksg * (1 - ksx)} caption="上海大剧院" sub="1998年开幕">
        <div style={{ position: "absolute", inset: 0, background: "#F3F0EA" }} />
        <Sketch name="sketch_sgt" k={pr(t, ts - 0.8, 1.6)} pos="50% 2%" />
      </Card>
      <div style={{ position: "absolute", left: 700, top: 310, fontFamily: SANS, fontSize: 24, color: P.hero, opacity: ksx }}>岛上的，也出自他们之手</div>
      <Card x={700} y={370} w={1080} h={500} k={ksx} caption="山西大剧院" sub="2012年交付 · 长风文化岛">
        <div style={{ position: "absolute", inset: 0, background: "#F3F0EA" }} />
        <Sketch name="sketch_sxgt" k={pr(t, tx - 0.3, 1.6)} pos="50% 42%" />
      </Card>
    </Board>
  );
};

// ---------- P5 田地长成了城市名片；最后的两栋楼侧身望向的，正是这里 ----------
export const P5: React.FC = () => {
  const t = useT();
  const tg = kw("P5", "长成了"), ts = kw("P5", "瑞府最后");
  const at = 3 + pr(t, tg - 0.4, 1.0);
  const reveal = ease(pr(t, tg - 0.3, 1.8));
  const kc = pr(t, 0.2, 0.6) * (1 - pr(t, ts - 0.6, 0.4)), k2 = pr(t, ts - 0.2, 0.6);
  return (
    <Board at={at} credit={SAT_CREDIT}>
      <GeFrame r={GE} reveal={reveal} border={1}>
        <Changfeng k={pr(t, tg + 0.4, 0.6)} sight={pr(t, kw("P5", "望向") - 0.2, 1.2)} />
        <RuifuPin k={k2} label="瑞府 1、2号楼" />
      </GeFrame>
      <div style={{ position: "absolute", left: 1340, top: 380, width: 500, fontFamily: SANS, opacity: kc }}>
        <div style={{ fontSize: 26, color: P.hero, letterSpacing: 4 }}>二十多年过去</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 56, color: P.ink, marginTop: 12, lineHeight: 1.3 }}>田地，长成了<br />太原的城市名片</div>
      </div>
      <div style={{ position: "absolute", left: 1340, top: 380, width: 500, fontFamily: SANS, opacity: k2, transform: `translateY(${(1 - k2) * 12}px)` }}>
        <div style={{ fontSize: 26, color: P.hero, letterSpacing: 4 }}>瑞府最后的两栋楼</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 56, color: P.ink, marginTop: 12, lineHeight: 1.3 }}>望向的<br />正是这里</div>
      </div>
    </Board>
  );
};
