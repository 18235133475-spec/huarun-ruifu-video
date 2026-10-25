// O5S 阳光账：接在 O5“夏日清晨，迎着阳光”之后，用太原的日照几何讲侧身后北面的变化。
// 左边是太阳轨迹图（上北下南，楼栋在圆心，侧身时转 37.7°），右边是一天里的直射时段（条的深浅 = 入射角余弦，越淡光越斜）。
// 数据见 tools/v2/sun_hours.py：只算太阳几何，不计遮挡，北京时间。
import React from "react";
import { AbsoluteFill } from "remotion";
import { clamp, ease } from "../lib";
import sun from "./sun_taiyuan.json";
import { pr, useT } from "./open";
import { Footnote, P, SANS, SERIF } from "./theme";
import { kw } from "./timeline";

type Day = { path: [number, number, number][]; runs: Record<"NE" | "N" | "SW", [number, number][]>; prof: Record<"NE" | "N" | "SW", number[]> };
const S = sun as unknown as Record<"夏至" | "立夏" | "春分" | "冬至", Day>;
const SUNC = "#E39A3B", NC = "#8E8A82", SWC = "#D9B26A";

// ---------- 左：太阳轨迹图 ----------
const CX = 470, CY = 560, R = 280;
const pol = (az: number, el: number): [number, number] => { const r = (R * (90 - Math.max(0, el))) / 90, a = (az * Math.PI) / 180; return [CX + r * Math.sin(a), CY - r * Math.cos(a)]; };
const arc = (d: Day, m0 = 0, m1 = 1440) => d.path.filter(([m, , el]) => m >= m0 && m <= m1 && el >= 0).map(([, az, el]) => pol(az, el).join(",")).join(" ");
const at = (d: Day, minute: number) => {
  const p = d.path; let i = 0; while (i < p.length - 1 && p[i + 1][0] <= minute) i++;
  const a = p[i], b = p[Math.min(p.length - 1, i + 1)], f = b[0] === a[0] ? 0 : (minute - a[0]) / (b[0] - a[0]);
  return { az: a[1] + (b[1] - a[1]) * f, el: a[2] + (b[2] - a[2]) * f };
};
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---------- 右：一天里的直射时段 ----------
const X0 = 1130, X1 = 1800, T0 = 240, T1 = 1200; // 4:00–20:00
const tx = (m: number) => X0 + ((m - T0) / (T1 - T0)) * (X1 - X0);
const ROWS = [{ k: "夏至", name: "夏至" }, { k: "立夏", name: "立夏 / 立秋" }, { k: "春分", name: "春分 / 秋分" }, { k: "冬至", name: "冬至" }] as const;
const Bar: React.FC<{ id: string; prof: number[]; color: string; y: number; h: number; k: number }> = ({ id, prof, color, y, h, k }) => (
  <g>
    <defs>
      <linearGradient id={id} x1={X0} x2={X1} gradientUnits="userSpaceOnUse">
        {prof.map((v, i) => <stop key={i} offset={i / (prof.length - 1)} stopColor={color} stopOpacity={v > 0 ? 0.25 + 0.75 * v : 0} />)}
      </linearGradient>
      <clipPath id={`${id}c`}><rect x={X0} y={y - 2} width={(X1 - X0) * k} height={h + 4} /></clipPath>
    </defs>
    <rect x={X0} y={y} width={X1 - X0} height={h} fill={`url(#${id})`} clipPath={`url(#${id}c)`} rx={3} />
  </g>
);

export const O5S: React.FC = () => {
  const t = useT();
  const tA = kw("O5S", "正南正北"), tN = kw("O5S", "北面只在"), tSl = kw("O5S", "斜斜"), tT = kw("O5S", "侧身之后"), tNE = kw("O5S", "东北这一面");
  const tEq = kw("O5S", "春分到秋分"), tAm = kw("O5S", "每天上午"), tSs = kw("O5S", "夏至前后"), tSr = kw("O5S", "日出"), tDay = kw("O5S", "一天里"), tBoth = kw("O5S", "前后两面");
  const k0 = pr(t, 0.1, 0.8), kAxis = pr(t, 0.3, 0.8); // 太阳轨迹和时间轴开场就画出来，不留空白
  const kA = pr(t, tA - 0.2, 0.5), kN = pr(t, tN - 0.2, 1.0);
  const turn = ease(clamp((t - (tT - 0.1)) / 1.1)), kNE = pr(t, tNE - 0.2, 0.5);
  const kEq = pr(t, tEq - 0.1, 1.0), kAm = pr(t, tAm - 0.2, 0.6), kSs = pr(t, tSs - 0.1, 1.0), kSW = pr(t, tDay - 0.2, 1.0);
  const ss = S["夏至"], eq = S["春分"];
  // 太阳点：前半段在夏至的清晨、傍晚掠过北面；“日出一直晒到十一点”时沿轨迹走一遍
  const [sr, s11] = ss.runs.NE[0];
  const runK = clamp((t - (tSr - 0.3)) / (tDay - tSr));
  let sunMin: number | null = null;
  if (t > tN - 0.2 && t < tT) sunMin = t < tSl ? 330 + 60 * pr(t, tN - 0.2, tSl - tN) : 1110 + 60 * pr(t, tSl, tT - tSl - 0.2);
  if (t >= tSr - 0.3 && t < tDay) sunMin = sr + (s11 - sr) * ease(runK);
  if (t >= tDay) sunMin = 900;
  const sp = sunMin !== null ? at(ss, sunMin) : null;
  const sxy = sp ? pol(sp.az, sp.el) : null;
  // 楼：圆心处的平面矩形，北面（侧身后为东北面）在上
  const ang = 37.7 * turn;
  const bw = 150, bh = 46;
  const litN = sunMin !== null && t < tT; // 正南楼北面被掠到
  const litNE = t >= tNE - 0.2 && (t < tSr - 0.3 || (sunMin !== null && sunMin <= s11 && t < tDay)), litSW = t >= tDay - 0.2;
  const RY = 380, RH = 118; // 右侧每行高度
  return (
    <AbsoluteFill style={{ background: P.paper, fontFamily: SANS }}>
      {/* 标题 */}
      <div style={{ position: "absolute", left: 120, top: 84, opacity: k0, transform: `translateY(${(1 - k0) * 12}px)` }}>
        <div style={{ fontSize: 24, color: P.hero, letterSpacing: 5 }}>这个侧身，带来的是</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 50, color: P.ink, marginTop: 10, letterSpacing: 2 }}>更长的日照，更好的采光面</div>
        <div style={{ fontSize: 22, color: P.ink2, marginTop: 8, opacity: kAxis }}>太原 · 北纬37.8° · 太阳几何推算</div>
      </div>

      {/* 左：太阳轨迹图 */}
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
        <g opacity={k0}>
          <circle cx={CX} cy={CY} r={R} fill="#FBF8F2" stroke={P.line} strokeWidth={2} />
          {[30, 60].map((e) => <circle key={e} cx={CX} cy={CY} r={(R * (90 - e)) / 90} fill="none" stroke={P.line} strokeWidth={1.2} strokeDasharray="3 7" />)}
          <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke={P.line} strokeWidth={1} />
          <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke={P.line} strokeWidth={1} />
          {(["北", "东", "南", "西"] as const).map((n, i) => { const [x, y] = pol(i * 90, -12); return <text key={n} x={x} y={y + 9} textAnchor="middle" fontFamily={SANS} fontSize={24} fill={i === 0 ? P.ink : P.ink2} fontWeight={i === 0 ? 700 : 400}>{n}</text>; })}
        </g>
        {/* 三条太阳轨迹 */}
        <g opacity={kAxis}>
          <polyline points={arc(S["冬至"])} fill="none" stroke={SUNC} strokeOpacity={0.35} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" />
          <polyline points={arc(eq)} fill="none" stroke={SUNC} strokeOpacity={0.45} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" />
          <polyline points={arc(ss)} fill="none" stroke={SUNC} strokeOpacity={0.6} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" />
          {([["夏至", ss, 960], ["春分", eq, 930], ["冬至", S["冬至"], 870]] as const).map(([n, d, m]) => { const p = at(d, m); const [x, y] = pol(p.az, p.el); return <text key={n} x={x - 10} y={y + 6} textAnchor="end" fontFamily={SANS} fontSize={18} fill={SUNC}>{n}</text>; })}
        </g>
        {/* 正南楼北面：夏至清晨、傍晚掠过的两段 */}
        <g opacity={kN * (1 - turn)}>
          {ss.runs.N.map(([a, b], i) => <polyline key={i} points={arc(ss, a, b)} fill="none" stroke={NC} strokeWidth={8} strokeLinecap="round" opacity={0.8} />)}
        </g>
        {/* 侧身后东北面：春分、夏至上午这一段 */}
        <g opacity={kAm}>
          <polyline points={arc(eq, eq.runs.NE[0][0], eq.runs.NE[0][1])} fill="none" stroke={SUNC} strokeWidth={7} strokeLinecap="round" opacity={0.7} />
        </g>
        <g opacity={kSs}>
          <polyline points={arc(ss, sr, sr + (s11 - sr) * ease(runK))} fill="none" stroke={SUNC} strokeWidth={9} strokeLinecap="round" />
        </g>
        {/* 光线 */}
        {sxy && (litN || litNE || litSW) ? (
          <g opacity={0.55}>
            {[-40, 0, 40].map((o) => {
              const a = (ang * Math.PI) / 180, fx = litSW ? 0 : 0, fy = litSW ? bh / 2 : -bh / 2;
              const px = CX + (o * Math.cos(a) - fy * Math.sin(a)) + fx, py = CY + (o * Math.sin(a) + fy * Math.cos(a));
              return <line key={o} x1={sxy[0]} y1={sxy[1]} x2={px} y2={py} stroke={litN ? NC : SUNC} strokeWidth={2.5} strokeDasharray="6 6" />;
            })}
          </g>
        ) : null}
        {/* 楼 */}
        <g transform={`translate(${CX} ${CY}) rotate(${ang})`} opacity={kA}>
          <rect x={-bw / 2} y={-bh / 2} width={bw} height={bh} rx={3} fill={turn > 0.02 ? P.hero : "#CFC8BC"} opacity={turn > 0.02 ? 0.55 + 0.4 * turn : 1} />
          {/* 北面 / 东北面 */}
          <line x1={-bw / 2} y1={-bh / 2} x2={bw / 2} y2={-bh / 2} stroke={litNE ? SUNC : litN ? "#B9B2A6" : "#9A9286"} strokeWidth={litNE ? 9 : 6} strokeLinecap="round" />
          {/* 南面 / 西南面 */}
          <line x1={-bw / 2} y1={bh / 2} x2={bw / 2} y2={bh / 2} stroke={litSW ? SWC : "#9A9286"} strokeWidth={litSW ? 9 : 4} strokeLinecap="round" />
        </g>
        {/* 正南方向的虚线，侧身时作对照 */}
        <line x1={CX} y1={CY + 40} x2={CX} y2={CY + 150} stroke={P.ink2} strokeWidth={2} strokeDasharray="5 6" opacity={turn * 0.8} />
        <text x={CX + 10} y={CY + 168} fontFamily={SANS} fontSize={18} fill={P.ink2} opacity={turn}>正南</text>
        {sxy ? (
          <g>
            <circle cx={sxy[0]} cy={sxy[1]} r={26} fill={SUNC} opacity={0.22} />
            <circle cx={sxy[0]} cy={sxy[1]} r={14} fill={SUNC} stroke="#fff" strokeWidth={3} />
            <text x={sxy[0]} y={sxy[1] - 34} textAnchor="middle" fontFamily={SANS} fontSize={20} fontWeight={700} fill={P.ink}>{hm(Math.round((sunMin ?? 0) / 5) * 5)}</text>
          </g>
        ) : null}
      </svg>
      {/* 图注 */}
      <div style={{ position: "absolute", left: CX - 300, top: CY + R + 44, width: 600, textAlign: "center", fontSize: 24, fontWeight: 600, color: turn > 0.5 ? P.hero : P.ink2, opacity: kA }}>
        {litSW ? "正面朝西南：午后到傍晚，阳光也在" : turn > 0.5 ? "侧身之后：东北面迎着上午的太阳" : "正南正北的楼：北面只有早晚的斜光"}
      </div>

      {/* 右：一天里的直射时段 */}
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
        <g opacity={kAxis}>
          {[240, 480, 720, 960, 1200].map((m) => (
            <g key={m}>
              <line x1={tx(m)} y1={RY - 20} x2={tx(m)} y2={RY + RH * 4 - 10} stroke={P.line} strokeWidth={m === 720 ? 1.6 : 1} strokeDasharray={m === 720 ? undefined : "3 6"} />
              <text x={tx(m)} y={RY - 30} textAnchor="middle" fontFamily={SANS} fontSize={18} fill={P.ink2}>{`${m / 60}:00`}</text>
            </g>
          ))}
          {ROWS.map((r, i) => <text key={r.k} x={X0 - 22} y={RY + i * RH + 40} textAnchor="end" fontFamily={SANS} fontSize={22} fontWeight={600} fill={P.ink}>{r.name}</text>)}
        </g>
        {ROWS.map((r, i) => {
          const d = S[r.k], y = RY + i * RH;
          const kNE = r.k === "夏至" ? kSs : r.k === "冬至" ? kSs : kEq;
          return (
            <g key={r.k}>
              <Bar id={`n${i}`} prof={d.prof.N} color={NC} y={y + 6} h={18} k={kN} />
              <Bar id={`e${i}`} prof={d.prof.NE} color={SUNC} y={y + 32} h={24} k={kNE * (turn > 0.5 ? 1 : 0)} />
              <Bar id={`s${i}`} prof={d.prof.SW} color={SWC} y={y + 62} h={18} k={kSW} />
            </g>
          );
        })}
        {/* 图例 */}
        <g fontFamily={SANS} fontSize={18}>
          <g opacity={kN}><rect x={X0} y={RY + RH * 4} width={26} height={12} fill={NC} opacity={0.7} /><text x={X0 + 34} y={RY + RH * 4 + 12} fill={P.ink2}>正南楼 · 北面</text></g>
          <g opacity={pr(t, tNE - 0.2, 0.5)}><rect x={X0 + 190} y={RY + RH * 4} width={26} height={12} fill={SUNC} /><text x={X0 + 224} y={RY + RH * 4 + 12} fill={P.ink2}>2号楼 · 东北面</text></g>
          <g opacity={kSW}><rect x={X0 + 390} y={RY + RH * 4} width={26} height={12} fill={SWC} /><text x={X0 + 424} y={RY + RH * 4 + 12} fill={P.ink2}>2号楼 · 西南面</text></g>
          <text x={X0} y={RY + RH * 4 + 42} fill={P.ink2} opacity={kN}>颜色越淡，光线越斜</text>
        </g>
      </svg>
      {/* 读数 */}
      <div style={{ position: "absolute", left: X0, top: 210, fontSize: 22, color: P.ink2, opacity: pr(t, tSl - 0.2, 0.5) * (1 - pr(t, tT - 0.2, 0.4)) }}>正南楼北面：春分、秋分前后基本照不到</div>
      <div style={{ position: "absolute", left: X0, top: 168, opacity: pr(t, tSs + 0.4, 0.6) * (1 - pr(t, tDay - 0.3, 0.4)) }}>
        <div style={{ fontSize: 22, color: P.ink2 }}>夏至 · 2号楼东北面</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 52, color: SUNC, marginTop: 4 }}>日出 → 约11:20</div>
      </div>
      <div style={{ position: "absolute", left: X0, top: 200, fontFamily: SERIF, fontWeight: 900, fontSize: 52, color: P.ink, opacity: pr(t, tBoth - 0.3, 0.6) }}>前后两面，都有阳光</div>

      <Footnote text="按太原纬度与2号楼朝向（据总平面，正面较正南偏西约37.7°）推算的太阳直射时段，北京时间；未计周边楼栋与树木遮挡，日出后不久光线很斜" />
    </AbsoluteFill>
  );
};
