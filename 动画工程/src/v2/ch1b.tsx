// v2 第一章后半：B3 入夜；B4 山河湖园馆城；B5 金句；B6 二十多年前的田地；B7 造岛引水；
// B8 法国事务所与上海大剧院；B9 夏邦杰与山西大剧院；B10 田地成了门面；B11 楼层不同，看到的不同。
import React from "react";
import { AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { clamp, ease } from "../lib";
import { PORTRAIT_THEATRE } from "../film2";
import { B2K1, Crowd, PerspShot } from "./ch1";
import { B01, B02, CamSpec, MAP_CAM, PAIR, XZ, at, lerpCam, makeCamera, toScreen } from "./geo";
import { MAP_O6END, MapShot, credit, pr, useT } from "./open";
import { MapScene } from "./map";
import { useWorld } from "../world";
import { P1 as StoryP1, P4 as StoryP4, P5 as StoryP5 } from "./story";
import { BuildingTag, Callout, CenterTitle, Footnote, N, P, RightTitle, SANS, SERIF, SkyTitle } from "./theme";
import { kw, shotById } from "./timeline";

// ---------- B3 入夜，是整片亮起来的灯 ----------
export const B3: React.FC = () => {
  const t = useT(), len = shotById("B3").len;
  const spec = lerpCam(B2K1, { ...B2K1, span: 500, el: 23 }, pr(t, 0, len));
  return (
    <PerspShot dark spec={spec} st={{ night: true, facade: 0, hero: 1, ring: 0, fog: [1800, 7500], box: 1400, lt: [600, 0, 300] }} extra={<Crowd k={0.85} />}>
      {(s) => (
        <>
          <RightTitle dark k={pr(t, 0.6, 0.6)} lines={["入夜"]} sub="馆和城一起亮起来" top={120} />
          <Footnote dark text="示意画面 · 灯光为示意" />
        </>
      )}
    </PerspShot>
  );
};

// ---------- B4 西有西山，东有天际线；山、河、湖、园、馆、城 ----------
// 2026-10-24：西山只露在画面左缘，不给太大篇幅；收尾机位与 O7 的起点一致
const B4K0: CamSpec = { t: [-1500, 0, 1300], az: 168, el: 42, D: 30000, span: 5200, sy: 540 };
const B4K1: CamSpec = MAP_O6END;
const SIX: { c: string; label: string; at: XZ; y?: number; color: string; o?: [number, number] }[] = [
  { c: "山", label: "西山", at: [-5200, 1500], y: 200, color: "#8C7B62" },
  { c: "河", label: "汾河", at: [640, 380], color: P.waterInk, o: [70, 20] },
  { c: "湖", label: "晋阳湖", at: [-2300, 4200], color: P.waterInk },
  { c: "园", label: "和园 · 谐园", at: [-120, 980], color: P.greenInk, o: [-60, 70] },
  { c: "馆", label: "五大馆", at: [80, 0], y: 30, color: "#9A6A4A", o: [40, -80] },
  { c: "城", label: "万象城 · 长风商务区", at: [-404, 1], y: 20, color: "#9A6A6A", o: [-110, -40] },
];
export const O6: React.FC = () => {
  const t = useT(), len = shotById("O6").len;
  const spec = lerpCam(B4K0, B4K1, pr(t, 0, len));
  const tw = kw("O6", "西山"), te = kw("O6", "天际线");
  const ks = SIX.map(({ c }) => pr(t, kw("O6", c, c === "山" ? 1 : 0) - 0.15, 0.45));
  const kr = pr(t, kw("O6", "四周") - 0.1, 0.8);
  return (
    <MapShot spec={spec} st={{ terrain: true, ring: kr, hero: 1 }}>
      {(s) => {
        const c = s(PAIR, 100);
        // 小标跟着画面走，但不出画：推近时山、湖移出画面，小标停在画面边缘（左右 110、上 130、下 230 像素以内），并加一个指向画外的小箭头
        const zoom = Math.pow(B4K0.span / spec.span, 0.35);
        const place = (x: (typeof SIX)[number]) => {
          const q0 = s(x.at, x.y ?? 0), q: [number, number] = [q0[0] + (x.o?.[0] ?? 0), q0[1] + (x.o?.[1] ?? 0)];
          const cq: [number, number] = [Math.min(1810, Math.max(110, q[0])), Math.min(850, Math.max(130, q[1]))];
          return { q: cq, out: Math.hypot(cq[0] - q[0], cq[1] - q[1]) > 4, ang: Math.atan2(q[1] - cq[1], q[0] - cq[0]) };
        };
        const P6 = SIX.map(place);
        return (
          <>
            <Callout band at={s([-5200, 1500], 200)} k={pr(t, tw - 0.2, 0.5) * (1 - pr(t, kw("O6", "山", 1) - 0.2, 0.3))} title="西望西山" color="#8C7B62" />
            <Callout band at={s([1900, -300], 80)} k={pr(t, te - 0.4, 0.5) * (1 - pr(t, kw("O6", "山", 1) - 0.2, 0.3))} title="东眺天际线" color={P.waterInk} />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
              {SIX.map((x, i) => { const q = P6[i].q; return ks[i] > 0.01 ? <line key={i} x1={c[0]} y1={c[1]} x2={c[0] + (q[0] - c[0]) * ks[i]} y2={c[1] + (q[1] - c[1]) * ks[i]} stroke={x.color} strokeWidth={2.5} strokeDasharray="4 6" opacity={0.85} /> : null; })}
              <circle cx={c[0]} cy={c[1]} r={60 + 40 * kr} fill="none" stroke={P.hero} strokeWidth={3} opacity={kr} />
            </svg>
            {SIX.map((x, i) => {
              const { q, out, ang } = P6[i];
              return (
                <div key={i} style={{ position: "absolute", left: q[0], top: q[1], transform: `translate(-50%, -50%) scale(${(0.6 + 0.4 * ks[i]) * zoom})`, opacity: ks[i], textAlign: "center", fontFamily: SANS }}>
                  {out ? <svg width={120} height={120} style={{ position: "absolute", left: "50%", top: 39, marginLeft: -60, marginTop: -60, overflow: "visible", transform: `rotate(${(ang * 180) / Math.PI}deg)` }}><path d="M 50 60 L 62 60 M 56 52 L 64 60 L 56 68" stroke={x.color} strokeWidth={3} fill="none" strokeLinecap="round" /></svg> : null}
                  <div style={{ width: 78, height: 78, borderRadius: 39, background: "#fff", border: `4px solid ${x.color}`, fontFamily: SERIF, fontWeight: 900, fontSize: 44, color: x.color, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", boxShadow: "0 6px 18px rgba(60,45,30,.18)" }}>{x.c}</div>
                  <div style={{ fontSize: 19, color: P.ink2, marginTop: 6, whiteSpace: "nowrap", textShadow: "0 0 8px #fff, 0 0 4px #fff" }}>{x.label}</div>
                </div>
              );
            })}
            <BuildingTag at={s(PAIR, 110)} label="1号、2号楼" k={kr} />
            <Footnote text={credit + "；地形：AWS Terrain Tiles"} />
          </>
        );
      }}
    </MapShot>
  );
};

// ---------- O9 金句：这一个侧身，把最好的那一面留给了太原的风景 ----------
// O9：黄昏，从1、2号楼身后（东北侧）越过楼顶望向西南——和园、南中环一直到晋阳湖；楼前铺开一片暖色视线扇。
// 文案放在天空留白处：“这一个侧身” → “是把最好的那一面” → “留给了太原的风景”
export const O9: React.FC = () => {
  const t = useT(), len = shotById("O9").len;
  const tg = at(217.7, 300);
  const k0: CamSpec = { t: [tg[0], 0, tg[1]], az: 40, el: 19, D: 760, span: 600, sy: 650 };
  const k1: CamSpec = { t: [tg[0], 0, tg[1]], az: 36, el: 16, D: 700, span: 520, sy: 650 };
  // 配音念完后镜头升到长风正上方、正北朝上，取景和下一镜 2025 年卫星照片一致（照片约 7.1×4.0 公里，中心约 (1489, 424)，见 story.tsx geXY）
  const tr = len - 2.9, up = ease(clamp((t - tr) / 2.5));
  const TOPL: CamSpec = { t: [1489, 0, 424], az: 180, el: 89, D: 30000, span: 4015, sy: 540 };
  const spec = t < tr ? lerpCam(k0, k1, pr(t, 0, tr)) : lerpCam(k1, TOPL, up);
  const kout = 1 - pr(t, tr - 0.3, 0.5);
  const k1t = pr(t, kw("O9", "侧身") - 0.1, 0.7), k2 = pr(t, kw("O9", "最好的") - 0.4, 0.7), k3 = pr(t, kw("O9", "太原") - 0.3, 0.8);
  return (
    <PerspShot spec={spec} st={{ dusk: 0.3 * (1 - up), facade: 1, hero: 1, hi2: 0.35 * pr(t, kw("O9", "最好的") - 0.2, 1.2), ring: 0, fog: up > 0.05 ? undefined : [2200, 12000], box: 1100 + 2200 * up, lt: [tg[0] + (1489 - tg[0]) * up, 0, tg[1] + (424 - tg[1]) * up] }}>
      {(s) => (
        <>
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(243,232,214,.97) 0%, rgba(243,232,214,.9) 26%, rgba(243,232,214,0) 46%)", opacity: kout }} />
          <Callout band at={s([-200, 120], 30)} k={pr(t, len - 1.0, 0.5)} title="长风" sub="文化岛 · 商务区" color={P.hero} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 92, textAlign: "center", fontFamily: SANS, opacity: kout }}>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 52, color: P.ink2, letterSpacing: 10, opacity: k1t * (1 - 0.35 * k2), transform: `translateY(${(1 - k1t) * 12}px)` }}>这一个侧身</div>
            <div style={{ fontSize: 28, color: P.ink2, letterSpacing: 8, marginTop: 30, opacity: k2 }}>是把最好的那一面</div>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 84, color: P.hero, letterSpacing: 12, marginTop: 10, opacity: k3, transform: `translateY(${(1 - k3) * 14}px)` }}>留给了太原的风景</div>
          </div>
          <Footnote text="示意画面 · 视线条件随楼层、天气变化" />
        </>
      )}
    </PerspShot>
  );
};

// ---------- B6 二十多年前，这里是一片田地 ----------
const OLD0: CamSpec = { ...MAP_CAM, span: 1900 };
const OLD1: CamSpec = { ...MAP_CAM, span: 1750 };
export const B6: React.FC = () => {
  const t = useT(), len = shotById("B6").len;
  const spec = lerpCam(OLD0, OLD1, pr(t, 0, len));
  return (
    <MapShot spec={spec} st={{ old: true, grow: () => 0, ring: 0 }}>
      {(s) => (
        <>
          <Callout at={s([-150, 300])} k={pr(t, kw("B6", "二十多年前") - 0.2, 0.6)} title="二十多年前，这里是一片田地" sub="河西是成片的庄稼地，汾河只是一条细河" color="#9C8A5E" dx={-60} dy={-140} />
          <Footnote text="示意画面 · 依据2002年6月 Landsat 7 卫星影像判读（公有领域），田块形状为示意" />
        </>
      )}
    </MapShot>
  );
};

// ---------- B7 平台抬起，车在下面跑，人在上面走；内河从汾河引进来 ----------
const ISL: CamSpec = { t: [70, 0, 20], az: 160, el: 46, D: 24000, span: 1050, sy: 560 };
const Section: React.FC<{ k: number; t: number }> = ({ k, t }) => (
  <div style={{ position: "absolute", right: 96, top: 120, width: 560, opacity: k, transform: `translateY(${(1 - k) * 16}px)`, background: "rgba(255,255,255,.95)", boxShadow: "0 10px 30px rgba(60,45,30,.14)", padding: "18px 22px", fontFamily: SANS }}>
    <div style={{ fontSize: 20, color: P.ink2, letterSpacing: 2 }}>文化岛平台 · 剖面示意</div>
    <svg width={516} height={210} style={{ display: "block", marginTop: 8 }}>
      <rect x={0} y={84} width={516} height={14} fill="#D9D3C8" />
      <rect x={0} y={196} width={516} height={6} fill="#CFC8BB" />
      {[40, 150, 260, 370, 480].map((x) => <rect key={x} x={x} y={98} width={10} height={98} fill="#E4DED4" />)}
      {[0, 1, 2, 3].map((i) => { const x = ((t * 90 + i * 140) % 600) - 60; return <rect key={i} x={x} y={170} width={46} height={20} rx={5} fill={i % 2 ? P.waterInk : "#8C8378"} />; })}
      {[0, 1, 2, 3, 4, 5].map((i) => { const x = ((t * 22 + i * 92) % 560) - 20; return <g key={i} transform={`translate(${x} 48)`}><circle cx={0} cy={0} r={6} fill={P.hero} /><rect x={-5} y={7} width={10} height={26} rx={4} fill={P.hero} /></g>; })}
      <text x={6} y={30} fontSize={20} fill={P.hero} fontFamily={SANS} fontWeight={600}>上层：人在上面走</text>
      <text x={6} y={130} fontSize={20} fill={P.ink2} fontFamily={SANS} fontWeight={600}>下层：车在下面跑</text>
    </svg>
  </div>
);
const OBL: CamSpec = { t: [40, 3, 100], az: 205, el: 24, D: 760, span: 330, sy: 560 };
export const P2: React.FC = () => {
  const t = useT(), len = shotById("P2").len;
  const tw = kw("P2", "引进来"), ti = kw("P2", "文化岛");
  const spec = lerpCam(OLD1, ISL, pr(t, 0, 2.8));
  const inner = pr(t, tw - 0.3, 2.6), ki = pr(t, ti - 0.3, 0.6);
  const isl = useWorld().island;
  return (
    <MapShot spec={spec} st={{ islandRise: 0.02, venueGrow: 0.02, innerReveal: inner, ring: 0 }}>
      {(s) => (
        <>
          <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", opacity: ki }}>
            <polygon points={isl.map((p) => s(p as XZ, 2).join(",")).join(" ")} fill="rgba(194,90,44,.10)" stroke={P.hero} strokeWidth={4} strokeDasharray="10 8" />
          </svg>
          <Callout at={s([-170, -420])} k={pr(t, tw - 0.2, 0.5)} title="把汾河水引进来" sub="绕成一圈" color={P.waterInk} dx={-60} dy={-110} />
          <div style={{ position: "absolute", left: s([90, 0])[0], top: s([90, 0])[1], transform: "translate(-50%,-50%)", opacity: ki, fontFamily: SERIF, fontWeight: 900, fontSize: 84, color: P.hero, letterSpacing: 10, textShadow: "0 0 24px rgba(243,240,234,.95)" }}>一座岛</div>
          <SkyTitle k={pr(t, 0.3, 0.6)} chapter="位置 · 长风的来历" title="长风的故事，从一座岛开始" />
          <Footnote text={credit + "；内河走向按 OSM 水面绘制"} />
        </>
      )}
    </MapShot>
  );
};

// ---------- P3 岛上的平台：剖透视插画 ----------
// 斜轴测剖面：近处是平台的剖切面和下面的车道，往里能看到柱廊和平台顶面；平台上图书馆（棕红竖向格栅）和大剧院（白色“门”形）按实景特征简化。
// 一点透视的进深用斜 30° 的轴测偏移表示；线条统一 1.6px 墨线，色块只用纸面色系 + 少量赤陶、水蓝。
const OB = (x: number, y: number, d: number): [number, number] => [x + d * 0.62, y - d * 0.36]; // 进深 d（像素）→ 屏幕偏移
const pts = (a: [number, number][]) => a.map((q) => q.join(",")).join(" ");
const INKL = "#5B5148";
const Car: React.FC<{ x: number; y: number; s?: number; c: string; dir?: 1 | -1; o?: number }> = ({ x, y, s = 1, c, dir = 1, o = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s * dir} ${s})`} opacity={o}>
    <ellipse cx={0} cy={2} rx={46} ry={4} fill="#000" opacity={0.12} />
    <path d="M -44 -6 L -44 -18 Q -40 -24 -30 -25 L -18 -36 Q -14 -39 -6 -39 L 18 -39 Q 26 -39 31 -32 L 38 -24 Q 46 -22 46 -14 L 46 -6 Z" fill={c} stroke={INKL} strokeWidth={1.4} />
    <path d="M -15 -33 L -6 -36 L 8 -36 L 8 -26 L -22 -26 Z M 11 -36 L 18 -36 Q 23 -36 27 -31 L 31 -26 L 11 -26 Z" fill="#DCE7EC" stroke={INKL} strokeWidth={1} />
    <circle cx={-26} cy={-6} r={8} fill="#3E3833" /><circle cx={-26} cy={-6} r={3.2} fill="#BDB5AA" />
    <circle cx={28} cy={-6} r={8} fill="#3E3833" /><circle cx={28} cy={-6} r={3.2} fill="#BDB5AA" />
    <rect x={42} y={-20} width={4} height={4} fill="#FFE6A8" />
  </g>
);
const Person: React.FC<{ x: number; y: number; s?: number; c: string; ph: number; o?: number }> = ({ x, y, s = 1, c, ph, o = 1 }) => {
  const sw = Math.sin(ph) * 7;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <ellipse cx={0} cy={0} rx={8} ry={2.5} fill="#000" opacity={0.12} />
      <line x1={0} y1={-20} x2={-sw * 0.6} y2={0} stroke={INKL} strokeWidth={3.2} strokeLinecap="round" />
      <line x1={0} y1={-20} x2={sw * 0.6} y2={0} stroke={INKL} strokeWidth={3.2} strokeLinecap="round" />
      <path d="M -6 -21 Q -7 -36 0 -38 Q 7 -36 6 -21 Z" fill={c} />
      <circle cx={0} cy={-44} r={5.5} fill={INKL} />
    </g>
  );
};
const Tree: React.FC<{ x: number; y: number; r: number; c: string; o?: number }> = ({ x, y, r, c, o = 1 }) => (
  <g opacity={o}>
    <ellipse cx={x + r * 0.3} cy={y} rx={r * 0.9} ry={r * 0.22} fill="#000" opacity={0.1} />
    <line x1={x} y1={y} x2={x} y2={y - r * 1.1} stroke="#7A6652" strokeWidth={3} />
    <circle cx={x - r * 0.35} cy={y - r * 1.35} r={r * 0.62} fill={c} />
    <circle cx={x + r * 0.35} cy={y - r * 1.45} r={r * 0.6} fill={c} />
    <circle cx={x} cy={y - r * 1.85} r={r * 0.62} fill={c} />
    <circle cx={x - r * 0.15} cy={y - r * 1.95} r={r * 0.28} fill="#fff" opacity={0.18} />
  </g>
);
export const P3: React.FC = () => {
  const t = useT();
  const tr = kw("P3", "整体抬起"), tc = kw("P3", "车在下面"), tp = kw("P3", "人在上面"), tw = kw("P3", "图书馆");
  const rise = ease(pr(t, tr - 0.5, 1.6));
  const cars = pr(t, tc - 0.3, 0.6), ppl = pr(t, tp - 0.3, 0.6), walk = pr(t, tw - 0.3, 1.6);
  const X0 = 150, X1 = 1530, G = 840, D = 300; // 剖面左右、地面线、进深
  const H = 150 * rise, TH = 26; // 平台抬起高度、板厚
  const top = G - H - TH; // 平台顶面（剖切边）
  const cols = Array.from({ length: 8 }, (_, i) => X0 + 90 + i * 175);
  const lib = { x: 330, w: 260, h: 150 }, thr = { x: 900, w: 430 };
  const path0 = OB(lib.x + lib.w + 20, top, 150), path1 = OB(thr.x - 10, top, 150);
  return (
    <AbsoluteFill style={{ background: P.paper, fontFamily: SANS }}>
      <SkyTitle k={pr(t, 0.3, 0.6)} chapter="位置 · 长风的来历" title="岛上的大平台，整体抬起" />
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
        <defs>
          <linearGradient id="p3under" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CFC6B6" /><stop offset="1" stopColor="#E6DFD2" /></linearGradient>
          <linearGradient id="p3col" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E9E3D8" /><stop offset="0.5" stopColor="#F6F2EA" /><stop offset="1" stopColor="#CFC6B6" /></linearGradient>
          <linearGradient id="p3water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#A9D0E6" /><stop offset="1" stopColor="#7FB3D3" /></linearGradient>
        </defs>
        {/* 远景：淡淡的城市天际线 */}
        <g opacity={0.5}>{[[1560, 120], [1610, 180], [1660, 140], [1720, 220], [1780, 160], [1840, 200], [80, 150], [30, 110]].map(([x, h], i) => <rect key={i} x={x} y={G - 330 - h} width={46} height={h} fill="#E2DBCE" />)}</g>
        {/* 地面（进深面）与车道 */}
        <polygon points={pts([[X0, G], [X1, G], OB(X1, G, D), OB(X0, G, D)])} fill="#DDD5C7" />
        {[0.33, 0.66].map((f) => { const a = OB(X0, G, D * f), b = OB(X1, G, D * f); return <line key={f} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#F6F2EA" strokeWidth={3} strokeDasharray="26 22" />; })}
        {/* 两侧的内河 */}
        <polygon points={pts([[X0 - 140, G + 6], [X0, G + 6], OB(X0, G + 6, D), OB(X0 - 140, G + 6, D)])} fill="url(#p3water)" />
        <polygon points={pts([[X1, G + 6], [X1 + 140, G + 6], OB(X1 + 140, G + 6, D), OB(X1, G + 6, D)])} fill="url(#p3water)" />
        {Array.from({ length: 6 }).map((_, i) => { const a = OB(X1 + 20 + (i % 3) * 36, G + 2, 40 + i * 42); return <path key={i} d={`M ${a[0]} ${a[1]} q 8 -4 16 0 t 16 0`} stroke="#fff" strokeWidth={1.5} fill="none" opacity={0.7} />; })}
        {/* 后排车流（往左开，小、淡） */}
        {Array.from({ length: 5 }).map((_, i) => { const u = (((-t * 120 + i * 300) % 1500) + 1500) % 1500; const p0 = OB(X0 + 60 + u * 0.9, G, D * 0.62); return <Car key={i} x={p0[0]} y={p0[1]} s={0.72} dir={-1} c={["#E8E4DC", "#8D96A0", "#4F6F8A", "#C9BFAF", "#6F665C"][i]} o={cars * 0.8} />; })}
        {/* 平台底面（天花）和后排柱子 */}
        {H > 4 ? (
          <>
            <polygon points={pts([[X0, G - H], [X1, G - H], OB(X1, G - H, D), OB(X0, G - H, D)])} fill="url(#p3under)" />
            {cols.map((x, i) => { const a = OB(x, G, D * 0.85), b = OB(x, G - H, D * 0.85); return <rect key={i} x={a[0] - 8} y={b[1]} width={16} height={a[1] - b[1]} fill="#D3CBBC" />; })}
            {cols.map((x, i) => { const a = OB(x + 60, G - H, D * 0.45); return <rect key={i} x={a[0] - 22} y={a[1] - 2} width={44} height={4} fill="#FFF3D2" opacity={0.9} />; })}
          </>
        ) : null}
        {/* 前排车流（往右开） */}
        {Array.from({ length: 6 }).map((_, i) => { const u = ((t * 170 + i * 250) % 1500); const p0 = OB(X0 + u * 0.92, G, D * 0.22); return <Car key={i} x={p0[0]} y={p0[1]} c={["#C25A2C", "#F2F0EA", "#2B2622", "#4F6F8A", "#8D96A0", "#E8E4DC"][i]} o={cars} />; })}
        {/* 前排柱子 */}
        {H > 4 ? cols.map((x, i) => <rect key={i} x={x - 11} y={G - H} width={22} height={H} fill="url(#p3col)" stroke={INKL} strokeWidth={1.2} />) : null}
        {/* 平台顶面 */}
        <polygon points={pts([[X0, top], [X1, top], OB(X1, top, D), OB(X0, top, D)])} fill="#F1ECE2" stroke={INKL} strokeWidth={1.6} />
        {Array.from({ length: 9 }).map((_, i) => { const a = OB(X0 + 150 * (i + 1), top, 0), b = OB(X0 + 150 * (i + 1), top, D); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#E2DACB" strokeWidth={1} />; })}
        {[0.5].map((f) => { const a = OB(X0, top, D * f), b = OB(X1, top, D * f); return <line key={f} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#E2DACB" strokeWidth={1} />; })}
        {/* 平台剖切面（板厚）+ 玻璃栏板 */}
        <rect x={X0} y={top} width={X1 - X0} height={TH} fill="#E3DACB" stroke={INKL} strokeWidth={1.6} />
        <line x1={X0} y1={top + TH * 0.5} x2={X1} y2={top + TH * 0.5} stroke="#CFC5B4" strokeWidth={1} />
        <polygon points={pts([[X1, top], OB(X1, top, D), OB(X1, top + TH, D), [X1, top + TH]])} fill="#D4CAB9" stroke={INKL} strokeWidth={1.6} />
        <rect x={X0} y={top - 16} width={X1 - X0} height={16} fill="#CFE2EA" opacity={0.45} />
        <line x1={X0} y1={top - 16} x2={X1} y2={top - 16} stroke={INKL} strokeWidth={1.2} />
        {/* 图书馆：棕红色竖向格栅的方盒子 */}
        <g opacity={rise}>
          {(() => { const a: [number, number] = [lib.x, top], b: [number, number] = [lib.x + lib.w, top], dd = 150, hh = lib.h;
            return (
              <>
                <polygon points={pts([OB(a[0], a[1] - hh, 40), OB(b[0], b[1] - hh, 40), OB(b[0], b[1] - hh, 40 + dd), OB(a[0], a[1] - hh, 40 + dd)])} fill="#C9A08A" stroke={INKL} strokeWidth={1.4} />
                <polygon points={pts([OB(b[0], b[1], 40), OB(b[0], b[1], 40 + dd), OB(b[0], b[1] - hh, 40 + dd), OB(b[0], b[1] - hh, 40)])} fill="#8E5A44" stroke={INKL} strokeWidth={1.4} />
                <polygon points={pts([OB(a[0], a[1], 40), OB(b[0], b[1], 40), OB(b[0], b[1] - hh, 40), OB(a[0], a[1] - hh, 40)])} fill="#A86A4E" stroke={INKL} strokeWidth={1.4} />
                {Array.from({ length: 21 }).map((_, i) => { const x = a[0] + 10 + i * 12; const p0 = OB(x, a[1] - 8, 40), p1 = OB(x, a[1] - hh + 10, 40); return <line key={i} x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke="#7A4A36" strokeWidth={2} />; })}
              </>
            ); })()}
        </g>
        {/* 大剧院：白色、两片向上翘起的屋面形成“门”的形状 */}
        <g opacity={rise}>
          {(() => { const L = thr.x, R = thr.x + thr.w, d0 = 30, d1 = 230;
            const q = (x: number, h: number, d: number) => OB(x, top - h, d);
            return (
              <>
                <polygon points={pts([q(L, 0, d0), q(L + 150, 0, d0), q(L + 150, 120, d0), q(L, 60, d0)])} fill="#F7F4EE" stroke={INKL} strokeWidth={1.4} />
                <polygon points={pts([q(R - 150, 0, d0), q(R, 0, d0), q(R, 60, d0), q(R - 150, 120, d0)])} fill="#F7F4EE" stroke={INKL} strokeWidth={1.4} />
                <polygon points={pts([q(L, 60, d0), q(L + 150, 120, d0), q(L + 150, 120, d1), q(L, 60, d1)])} fill="#ECE7DE" stroke={INKL} strokeWidth={1.4} />
                <polygon points={pts([q(R - 150, 120, d0), q(R, 60, d0), q(R, 60, d1), q(R - 150, 120, d1)])} fill="#E2DCD1" stroke={INKL} strokeWidth={1.4} />
                <polygon points={pts([q(L + 150, 0, d0 + 40), q(R - 150, 0, d0 + 40), q(R - 150, 92, d0 + 40), q(L + 150, 92, d0 + 40)])} fill="#BFD6E2" stroke={INKL} strokeWidth={1.2} />
                {Array.from({ length: 8 }).map((_, i) => { const x = L + 150 + (i + 1) * ((thr.w - 300) / 9); const a = q(x, 0, d0 + 40), b = q(x, 92, d0 + 40); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#9DB7C6" strokeWidth={1.2} />; })}
                <polygon points={pts([q(L + 150, 120, d0), q(R - 150, 120, d0), q(R - 150, 120, d1), q(L + 150, 120, d1)])} fill="#F2EEE6" stroke={INKL} strokeWidth={1.4} />
              </>
            ); })()}
        </g>
        {/* 平台上的树 */}
        {[[200, 60], [250, 200], [700, 70], [760, 220], [1420, 70], [1470, 210]].map(([x, d], i) => { const p0 = OB(x, top, d); return <Tree key={i} x={p0[0]} y={p0[1]} r={i % 2 ? 24 : 30} c={P.trees[i % 4]} o={rise} />; })}
        {/* 从图书馆一路走到大剧院 */}
        <line x1={path0[0]} y1={path0[1]} x2={path0[0] + (path1[0] - path0[0]) * walk} y2={path0[1] + (path1[1] - path0[1]) * walk} stroke={P.hero} strokeWidth={4} strokeDasharray="2 12" strokeLinecap="round" />
        {/* 人：平台上漫步 */}
        {Array.from({ length: 12 }).map((_, i) => { const u = (((t * 34 * (i % 2 ? 1 : -1)) + i * 113) % 1300 + 1300) % 1300; const p0 = OB(X0 + 40 + u, top, 30 + (i * 47) % 230); return <Person key={i} x={p0[0]} y={p0[1]} s={0.9 + ((i * 7) % 3) * 0.1} c={[P.hero, "#4F6F8A", "#6F665C", "#B98A5A"][i % 4]} ph={t * 7 + i} o={ppl} />; })}
      </svg>
      {(() => { const a = OB(lib.x + lib.w / 2, top - lib.h - 30, 100), b = OB(thr.x + thr.w / 2, top - 160, 120); return (
        <>
          <div style={{ position: "absolute", left: a[0], top: a[1], transform: "translate(-50%,-100%)", fontSize: 26, fontWeight: 700, color: P.ink, opacity: pr(t, tw - 0.3, 0.5), background: "rgba(243,240,234,.9)", padding: "2px 10px" }}>图书馆</div>
          <div style={{ position: "absolute", left: b[0], top: b[1], transform: "translate(-50%,-100%)", fontSize: 26, fontWeight: 700, color: P.ink, opacity: pr(t, tw + 0.5, 0.5), background: "rgba(243,240,234,.9)", padding: "2px 10px" }}>大剧院</div>
        </>
      ); })()}
      <div style={{ position: "absolute", left: 1640, top: top - 120, fontSize: 30, fontWeight: 700, color: P.hero, opacity: ppl, whiteSpace: "nowrap" }}>人在上面漫步</div>
      <div style={{ position: "absolute", left: 1640, top: G - 70, fontSize: 30, fontWeight: 700, color: P.ink2, opacity: cars, whiteSpace: "nowrap" }}>车在下面穿行</div>
      <Footnote text="剖透视示意 · 图书馆、大剧院按实景特征简化；平台高度、车道与人流为示意" />
    </AbsoluteFill>
  );
};

// ---------- B8 法国事务所，上海大剧院 ----------
export const B8: React.FC = () => {
  const t = useT(), len = shotById("B8").len;
  const kf = pr(t, kw("B8", "法国事务所") - 0.2, 0.6), ks = kw("B8", "上海大剧院");
  return (
    <AbsoluteFill style={{ background: P.paper, fontFamily: SANS }}>
      <div style={{ position: "absolute", left: 140, top: 150 }}>
        <div style={{ fontSize: 24, color: P.hero, letterSpacing: 4, opacity: pr(t, 0.3, 0.5) }}>长风文化商务区 · 整体规划</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 52, color: P.ink2, marginTop: 14, letterSpacing: 4, opacity: pr(t, 0.4, 0.6) }}>给这片田地做整体规划的</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 76, color: P.ink, marginTop: 10, letterSpacing: 4, opacity: kf, transform: `translateY(${(1 - kf) * 14}px)` }}>一家法国事务所</div>
        <div style={{ fontSize: 28, color: P.ink2, marginTop: 14, opacity: kf }}>Arte Charpentier · 创始人 让-马里·夏邦杰</div>
      </div>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <g transform="translate(260 120) scale(0.82)">
          {PORTRAIT_THEATRE.map((d, i) => (
            <path key={i} d={d} pathLength={1} fill="none" stroke={P.ink} strokeWidth={3.2} strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - pr(t, ks - 2.4 + i * 0.25, 1.4)} />
          ))}
        </g>
      </svg>
      <div style={{ position: "absolute", right: 150, bottom: 170, textAlign: "right", opacity: pr(t, ks - 0.2, 0.6) }}>
        <div style={{ fontSize: 24, color: P.ink2, letterSpacing: 4 }}>它的作品，你多半知道</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 76, color: P.hero, marginTop: 10, letterSpacing: 8 }}>上海大剧院</div>
      </div>
      <Footnote text="线稿依据上海大剧院公开照片简化绘制" />
    </AbsoluteFill>
  );
};

// ---------- B9 夏邦杰没能等到长风建成；两年后山西大剧院交付 ----------
const GT: XZ = [-4, 1];
const B9K0: CamSpec = { t: [GT[0], 10, GT[1]], az: 200, el: 30, D: 1500, span: 700, sy: 560 };
const B9K1: CamSpec = { t: [GT[0], 10, GT[1]], az: 188, el: 26, D: 1200, span: 520, sy: 580 };
export const B9: React.FC = () => {
  const t = useT(), len = shotById("B9").len;
  const spec = lerpCam(B9K0, B9K1, pr(t, 0, len));
  const k1 = pr(t, kw("B9", "2010") - 0.3, 0.6), k2 = pr(t, kw("B9", "两年后") - 0.2, 0.6);
  return (
    <AbsoluteFill>
      <PerspShot spec={spec} st={{ dusk: 0.55, facade: 1, hero: 1, ring: 0, fog: [1500, 7000], box: 900, lt: [GT[0], 0, GT[1]], glow: { id: "venue_grand_theatre", k: k2 } }}>
        {(s) => (
          <>
            <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(240,170,110,.14) 0%, rgba(240,170,110,0) 40%)" }} />
            <BuildingTag at={s(GT, 48)} label="山西大剧院" k={k2} strong={false} />
            <div style={{ position: "absolute", left: 96, top: 96, display: "flex", alignItems: "flex-start", gap: 0, fontFamily: SANS, background: "rgba(255,255,255,.93)", padding: "22px 26px 20px", boxShadow: "0 10px 30px rgba(60,45,30,.14)", opacity: Math.max(k1, k2) }}>
              {[{ y: "2010 · 冬", tx: "夏邦杰去世", k: k1 }, { y: "2012", tx: "山西大剧院交付", k: k2 }].map((x, i) => (
                <div key={i} style={{ width: 360, opacity: x.k, transform: `translateY(${(1 - x.k) * 12}px)` }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 9, background: i ? P.hero : P.ink2 }} />
                    <div style={{ flex: 1, height: 2, background: P.line, marginLeft: 8 }} />
                  </div>
                  <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 44, color: P.ink, marginTop: 12 }}>{x.y}</div>
                  <div style={{ fontSize: 24, color: P.ink2, marginTop: 6 }}>{x.tx}</div>
                </div>
              ))}
            </div>
            <Footnote text="示意画面 · 黄昏光为示意" />
          </>
        )}
      </PerspShot>
    </AbsoluteFill>
  );
};

// ---------- B10 二十多年过去，田地成了门面；2号楼转身面对的就是这里 ----------
const B10K1: CamSpec = { ...MAP_CAM, span: 2100, t: [-60, 0, 560] };
export const B10: React.FC = () => {
  const t = useT(), len = shotById("B10").len;
  // 从 B9 的黄昏近景一路拉回到区域全景
  const spec = t < 2.4 ? lerpCam(B9K1, { ...B10K1, span: 3200 }, pr(t, 0, 2.4)) : lerpCam({ ...B10K1, span: 3200 }, B10K1, pr(t, 2.4, len - 2.4));
  const k2 = pr(t, kw("B10", "2号楼") - 0.2, 0.6);
  return (
    <MapShot spec={spec} st={{ ring: k2, hi2: k2, front: k2, rays: { heyuan: k2, xieyuan: k2 } }} vignette={pr(t, 1.6, 1.0)}>
      {(s) => (
        <>
          <Callout at={s([60, 0], 20)} k={pr(t, kw("B10", "田地成了") - 0.2, 0.6) * (1 - pr(t, kw("B10", "2号楼") - 0.4, 0.3))} title="田地，成了太原的门面" sub="二十多年" color={P.hero} dx={-80} dy={-130} />
          <BuildingTag at={s(B02, 110)} label="2号楼" k={k2} />
          <Footnote text={credit} />
        </>
      )}
    </MapShot>
  );
};

// ---------- B11 楼层不同，看到的不同：低区、中区、高区三档视野（对前文远近关系的阐释，不重复报幕） ----------
// 配音只有9秒，镜头加长约6秒，三档各约5秒：机位贴着2号楼从低处升到高处，朝向随看点转。
type Eye = { pos: [number, number, number]; look: [number, number, number]; fov: number };
const TIERS: { eye: Eye; tag: string; floor: string; title: string; lines: string[]; color: string; dusk: number }[] = [
  { eye: { pos: [152, 20, 842], look: [-70, 6, 1085], fov: 58 }, tag: "低层", floor: "", title: "与和园的四季为邻", color: P.greenInk, dusk: 0,
    lines: ["长风商务区，近在咫尺"] },
  { eye: { pos: [188, 104, 806], look: [-2600, 60, 3200], fov: 58 }, tag: "高层", floor: "", title: "天际线一览无余", color: P.hero, dusk: 0.15,
    lines: ["晴天里，晋阳湖与西山都在眼前"] },
];
const eyeCam = (e: Eye) => {
  const c = new THREE.PerspectiveCamera(e.fov, 16 / 9, 2, 40000);
  c.position.set(...e.pos); c.lookAt(...e.look); c.updateProjectionMatrix(); c.updateMatrixWorld();
  return c;
};
const lerpEye = (a: Eye, b: Eye, k: number): Eye => {
  const L = (x: number[], y: number[]) => x.map((v, i) => v + (y[i] - v) * k) as [number, number, number];
  // 朝向按方位角插值，避免从西南转到东北时镜头扫过地面中心
  return { pos: L(a.pos, b.pos), look: L(a.look, b.look), fov: a.fov + (b.fov - a.fov) * k };
};
const BRIDGE: [number, number][] = [[200, -1140], [420, -1138], [640, -1136], [960, -1134]];
export const Q1: React.FC = () => {
  const t = useT(), len = shotById("Q1").len;
  const th = kw("Q1", "高层") - 0.6;
  const idx = t < th ? 0 : 1;
  const into = idx === 0 ? t : t - th;
  const seg = idx === 0 ? th : len - th;
  const k = idx === 0 ? 0 : ease(clamp(into / 1.6));
  const eye = idx === 0 ? TIERS[0].eye : lerpEye(TIERS[idx - 1].eye, TIERS[idx].eye, k);
  const cam = eyeCam(eye);
  const s = (p: XZ, y = 0) => toScreen(cam, [p[0], y, p[1]]);
  const dusk = idx === 0 ? 0 : TIERS[idx - 1].dusk + (TIERS[idx].dusk - TIERS[idx - 1].dusk) * k;
  const T = TIERS[idx];
  const kt = pr(into, idx === 0 ? 0.3 : 1.2, 0.6) * (idx < 1 ? 1 - pr(into, seg - 0.5, 0.4) : 1);
  const hNow = eye.pos[1];
  const blink = 0.55 + 0.45 * Math.sin(t * 6.0);
  const lake = s([-2200, 3700]), hill = s([-6800, 2400], 250), heyuan = s([-40, 1040], 6), cbd = s([-160, 640], 90), fen = s([600, 300]);
  const bridge = BRIDGE.map(([x, z]) => s([x, z], 14));
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: P.paper }}>
        <MapScene cam={cam} st={{ facade: 1, hero: 1, ring: 0, terrain: idx === 1, dusk, fog: idx === 1 ? [2500, 16000] : [1200, 7000], box: idx === 1 ? 2500 : 700, lt: [PAIR[0] - 150, 0, PAIR[1] + 250] }} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(243,240,234,.7) 0%, rgba(243,240,234,0) 20%)" }} />
      {dusk > 0.05 ? <AbsoluteFill style={{ background: `rgba(255,190,140,${0.12 * dusk})`, mixBlendMode: "multiply" }} /> : null}
      {/* （两档版本不再单独讲中区和长风大桥） */}
      {false ? (
        <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", opacity: k }}>
          <polyline points={bridge.map((p) => p.join(",")).join(" ")} fill="none" stroke="#FFC46B" strokeWidth={7} strokeLinecap="round" opacity={0.35 + 0.4 * blink} style={{ filter: "blur(3px)" }} />
          <polyline points={bridge.map((p) => p.join(",")).join(" ")} fill="none" stroke="#FFF1C9" strokeWidth={2.5} strokeLinecap="round" />
          {Array.from({ length: 12 }).map((_, i) => { const f = i / 11, a = bridge[0], b = bridge[bridge.length - 1]; return <circle key={i} cx={a[0] + (b[0] - a[0]) * f} cy={a[1] + (b[1] - a[1]) * f - 4} r={3.5} fill={i % 2 ? "#FF9F6B" : "#8FD3FF"} opacity={0.5 + 0.5 * Math.sin(t * 5 + i)} />; })}
        </svg>
      ) : null}
      {/* 左侧：楼层标尺 */}
      <div style={{ position: "absolute", left: 96, top: 170, fontFamily: SANS }}>
        <div style={{ position: "relative", width: 34, height: 520, background: "rgba(255,255,255,.85)", border: `2px solid ${P.line}` }}>
          {TIERS.map((x, i) => <div key={i} style={{ position: "absolute", left: 0, right: 0, bottom: [12, 74][i] + "%", height: 3, background: i === idx ? x.color : P.line }} />)}
          <div style={{ position: "absolute", left: -6, width: 46, height: 14, background: T.color, bottom: `calc(${Math.min(96, (hNow / 108) * 100)}% - 7px)`, borderRadius: 3 }} />
        </div>
        {TIERS.map((x, i) => (
          <div key={i} style={{ position: "absolute", left: 54, bottom: `calc(${[12, 74][i]}% - 14px)`, whiteSpace: "nowrap", opacity: i === idx ? 1 : 0.4 }}>
            <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 30, color: x.color }}>{x.tag}</span>
            <span style={{ fontSize: 16, color: P.ink2, marginLeft: 8 }}>{x.floor}</span>
          </div>
        ))}
      </div>
      {/* 当前这一档的感受 */}
      <div style={{ position: "absolute", right: 104, top: 96, textAlign: "right", fontFamily: SANS, opacity: kt, transform: `translateY(${(1 - kt) * 14}px)` }}>
        <div style={{ fontSize: 22, color: T.color, letterSpacing: 3 }}>{T.tag}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 84, color: P.ink, marginTop: 6, letterSpacing: 6, textShadow: "0 0 20px rgba(243,240,234,.9)" }}>{T.title}</div>
        {T.lines.map((l) => <div key={l} style={{ fontSize: 26, color: P.ink2, marginTop: 10, textShadow: "0 0 10px rgba(243,240,234,.95)" }}>{l}</div>)}
      </div>
      {idx === 0 ? (
        <>
          <Callout band={330} at={heyuan} k={pr(into, 1.4, 0.5) * kt} title="和园" sub="草坪、树林、水系" color={P.greenInk} />
          {void cbd}
        </>
      ) : null}
      {idx === 1 ? (
        <>
          <Callout band={330} at={lake} k={pr(into, 1.8, 0.5)} title="晋阳湖" sub="约2.8公里" color={P.waterInk} />
          <Callout band={330} at={hill} k={pr(into, 2.6, 0.5)} title="西山" color="#8C7B62" />
        </>
      ) : null}
      <Footnote text="示意画面 · 各楼层视野为示意，以实际楼层、朝向、天气和遮挡为准" />
    </AbsoluteFill>
  );
};

export const CHAPTER1B = { O6, O9, P1: StoryP1, P2, P3, P4: StoryP4, P5: StoryP5, Q1 };
void B01; void at; void clamp; void ease; void N; void CenterTitle;
