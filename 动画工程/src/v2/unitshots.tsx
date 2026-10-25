// v4 第二、三章：立体户型（剖切模型 + 软装 + 剪影小人）。讲到哪里推近哪里，其余褪色，交通核始终弱化。
// Q3–R10 的机位首尾相接：每一镜的起点就是上一镜的终点，镜头之间看起来是一条连续的运镜。
import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { clamp, ease } from "../lib";
import { useWorld } from "../world";
import { PEOPLE, makeFocus, makePerson } from "../unitdress";
import { PerspShot } from "./ch1";
import { useReady } from "./data";
import { B02, CamSpec, PAIR, axo, makeCamera, toScreen } from "./geo";
import { pr, useT } from "./open";
import { Callout, CenterTitle, Footnote, P, RightTitle, SANS, SERIF } from "./theme";
import { kw, shotById } from "./timeline";
import { KeyMap, PY, U_CUT, U_X, UnitScene, ZONE, buildUnit, floorBase, uz } from "./unit";
import ROOMS_JSON from "./unit_rooms.json";
const ROOMS = ROOMS_JSON as { id: string; c: string; p: [number, number][] }[];

type View = { c: [number, number]; span: number; sx?: number; sy?: number };
type Rect = readonly number[]; // 平面坐标 x0, y0, x1, y1（y 为距北边米数）
type Key = { t: number; view: View; focus?: Rect; dim?: number; dur?: number };

const V = {
  whole: { c: [11.4, 8.95], span: 21.5, sx: 960, sy: 560 } as View,
  entry: { c: [8.8, 8.2], span: 13, sx: 900, sy: 545 } as View,
  south: { c: [11.4, 12.6], span: 19, sx: 960, sy: 545 } as View,
  axis: { c: [15.2, 8.6], span: 19, sx: 900, sy: 545 } as View,
  living: { c: [15.0, 12.4], span: 14, sx: 880, sy: 545 } as View,
  livingClose: { c: [15.2, 13.4], span: 11, sx: 900, sy: 545 } as View,
  dining: { c: [15.8, 7.2], span: 13, sx: 880, sy: 545 } as View,
  tea: { c: [16.2, 3.6], span: 13, sx: 880, sy: 545 } as View,
  northeast: { c: [19.0, 5.2], span: 12.5, sx: 860, sy: 545 } as View,
  master: { c: [3.6, 10.6], span: 14, sx: 900, sy: 545 } as View,
  doubleMaster: { c: [5.6, 13.6], span: 11.5, sx: 900, sy: 545 } as View,
};
const R = {
  entry: [5.9, 4.9, 11.3, 11.6], south: [0.3, 9.9, 22.4, 16.3], master: [0.3, 4.9, 6.9, 16.3], northeast: [13.4, 1.6, 22.4, 8.8], doubleMaster: [0.3, 11.5, 11.2, 16.3], ...PY,
};
const lerpV = (a: View, b: View, k: number): View => ({
  c: [a.c[0] + (b.c[0] - a.c[0]) * k, a.c[1] + (b.c[1] - a.c[1]) * k],
  span: Math.exp(Math.log(a.span) + (Math.log(b.span) - Math.log(a.span)) * k),
  sx: (a.sx ?? 960) + ((b.sx ?? 960) - (a.sx ?? 960)) * k, sy: (a.sy ?? 540) + ((b.sy ?? 540) - (a.sy ?? 540)) * k,
});
const at = (keys: Key[], t: number) => {
  let i = 0; keys.forEach((k, j) => { if (t >= k.t) i = j; });
  const cur = keys[i], prev = keys[Math.max(0, i - 1)];
  const k = i === 0 ? 1 : ease(clamp((t - cur.t) / (cur.dur ?? 1.2)));
  const fa = prev.focus ?? [-99, -99, 99, 99], fb = cur.focus ?? fa;
  return {
    view: lerpV(prev.view, cur.view, k),
    focus: fa.map((v, j) => v + (fb[j] - v) * k),
    dim: (prev.dim ?? 0) + ((cur.dim ?? 0) - (prev.dim ?? 0)) * k,
  };
};
const camOf = (v: View) => axo([v.c[0], 0.4, uz(v.c[1])], 180, 60, 600, v.span, v.sx ?? 960, v.sy ?? 540); // 正南看向正北，上北下南，不做斜角

type Fill = { ids: string[]; color: string; at: number; out?: number };
type Ctx = { t: number; S: (x: number, y: number, h?: number) => [number, number]; view: View };

/** 一个户型镜头：机位关键帧 + 聚焦 + 地面铺色 + 出场人物 + 覆盖层 */
const UnitShot: React.FC<{ keys: Key[]; fills?: Fill[]; people?: { zone: string; at: number }[]; tint?: (t: number) => string | null; overlay?: (c: Ctx) => React.ReactNode; note?: string; extras?: (t: number, floorY: number, group: THREE.Object3D) => THREE.Object3D[] }> = ({ keys, fills = [], people = [], tint, overlay, note, extras }) => {
  const t = useT();
  const ready = useReady();
  const focus = useMemo(makeFocus, []);
  const unit = useMemo(() => (ready ? buildUnit(useWorld().unit, focus) : null), [ready, focus]);
  const ppl = useMemo(() => (unit ? PEOPLE.map((p) => makePerson(p, unit.floorY, 55)) : []), [unit]);
  if (!unit) return <AbsoluteFill style={{ background: P.paper }} />;
  const st = at(keys, t);
  const cam = camOf(st.view);
  focus.uFocus.value.set(st.focus[0], uz(st.focus[1]), st.focus[2], uz(st.focus[3]));
  focus.uDim.value = st.dim;
  // 地面铺色
  const want: Record<string, THREE.Color> = {};
  Object.keys(unit.floors).forEach((id) => (want[id] = new THREE.Color(ZONE[id] && false ? ZONE[id].fill : floorBase(id))));
  fills.forEach((f) => {
    const k = pr(t, f.at, 0.6) * (f.out !== undefined ? 1 - pr(t, f.out, 0.5) : 1);
    f.ids.forEach((id) => want[id] && want[id].lerp(new THREE.Color(f.color), k));
  });
  Object.entries(unit.floors).forEach(([id, m]) => m.color.copy(want[id]));
  // 人物
  ppl.forEach(({ sprite, shadow, spec }) => {
    const e = people.find((p) => p.zone === spec.zone);
    const k = e ? pr(t, e.at, 0.4) : 0;
    (sprite.material as THREE.SpriteMaterial).opacity = k; (shadow.material as THREE.MeshBasicMaterial).opacity = 0.16 * k;
    sprite.visible = shadow.visible = k > 0.01;
  });
  const S = (x: number, y: number, h = 0) => toScreen(cam, [x, h, uz(y)]);
  const tc = tint ? tint(t) : null;
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: P.paper }}>
        <UnitScene cam={cam} unit={unit.group} people={[...ppl.flatMap((p) => [p.sprite, p.shadow]), ...(extras ? extras(t, unit.floorY, unit.group) : [])]} />
      </ThreeCanvas>
      {tc ? <AbsoluteFill style={{ background: tc, mixBlendMode: "multiply" }} /> : null}
      {overlay ? overlay({ t, S, view: st.view }) : null}
      <Footnote right text={note ?? "以2号楼为例，1号楼户型左右镜像。按户型示意图建模，软装与人物为示意，尺寸以交付标准为准"} />
    </AbsoluteFill>
  );
};

// ---------- 通用覆盖层 ----------
const Arrow: React.FC<{ a: [number, number]; b: [number, number]; k: number; color?: string; w?: number; id: string; one?: boolean }> = ({ a, b, k, color = P.ink, w = 4.5, id, one }) => {
  if (k <= 0.01) return null;
  const e = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
      <defs><marker id={id} markerUnits="userSpaceOnUse" markerWidth="24" markerHeight="24" refX="12" refY="12" orient="auto-start-reverse"><path d="M0,1 L24,12 L0,23 z" fill={color} /></marker></defs>
      <line x1={a[0]} y1={a[1]} x2={e[0]} y2={e[1]} stroke={color} strokeWidth={w} markerEnd={`url(#${id})`} markerStart={k > 0.98 && !one ? `url(#${id})` : undefined} />
    </svg>
  );
};
const Tag: React.FC<{ p: [number, number]; text: string; k: number; color?: string; size?: number; solid?: boolean }> = ({ p, text, k, color = P.ink, size = 22, solid }) => (
  <div style={{ position: "absolute", left: p[0], top: p[1], transform: "translate(-50%, -50%)", opacity: k, fontFamily: SANS, fontSize: size, fontWeight: 600, color: solid ? "#fff" : color, background: solid ? color : "rgba(255,255,255,.92)", padding: "5px 12px", whiteSpace: "nowrap", borderRadius: 3, boxShadow: "0 3px 10px rgba(60,45,30,.12)" }}>{text}</div>
);
const SideNote: React.FC<{ k: number; n?: number; title: string; text?: string; color: string; y: number }> = ({ k, n, title, text, color, y }) => (
  <div style={{ position: "absolute", left: 1490, top: y, opacity: k, transform: `translateX(${(1 - k) * 20}px)`, fontFamily: SANS, display: "flex", gap: 14, alignItems: "flex-start", background: "rgba(243,240,234,.9)", padding: "12px 16px", borderRadius: 4, maxWidth: 400 }}>
    {n ? <div style={{ width: 40, height: 40, borderRadius: 20, background: color, color: "#fff", fontWeight: 700, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{n}</div> : null}
    <div>
      <div style={{ fontSize: 30, fontWeight: 600, color }}>{title}</div>
      {text ? <div style={{ fontSize: 20, color: P.ink2, marginTop: 6, maxWidth: 360 }}>{text}</div> : null}
    </div>
  </div>
);
const ChapterTag: React.FC<{ text: string; k?: number }> = ({ text, k = 1 }) => (
  <div style={{ position: "absolute", left: 96, top: 72, fontFamily: SANS, fontSize: 22, color: P.hero, letterSpacing: 3, opacity: k, background: "rgba(243,240,234,.92)", padding: "8px 14px" }}>{text}</div>
);
const BigTitle: React.FC<{ chapter: string; title: string; sub?: string; k: number }> = ({ chapter, title, sub, k }) => (
  <div style={{ position: "absolute", left: 96, top: 90, fontFamily: SANS, opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}>
    <div style={{ fontSize: 20, color: P.hero, letterSpacing: 3 }}>{chapter}</div>
    <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 76, color: P.ink, marginTop: 10, letterSpacing: 2 }}>{title}</div>
    {sub ? <div style={{ fontSize: 24, color: P.ink2, marginTop: 10 }}>{sub}</div> : null}
  </div>
);
const TOP = U_CUT + 0.3;

/** 动线：沿折线画出来的流动虚线 + 走在线上的光点 + 末端箭头。k 画出进度，t 驱动虚线流动 */
const FlowLine: React.FC<{ pts: [number, number][]; k: number; t: number; color: string; w?: number; both?: boolean }> = ({ pts, k, t, color, w = 7, both }) => {
  if (k <= 0.01 || pts.length < 2) return null;
  const seg = [0]; for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = seg[seg.length - 1], upto = L * k;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (seg[i] <= upto) out.push(pts[i]);
    else { const f = (upto - seg[i - 1]) / (seg[i] - seg[i - 1] || 1); out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]); break; }
  }
  const head = out[out.length - 1], prev = out[Math.max(0, out.length - 2)];
  const ang = (Math.atan2(head[1] - prev[1], head[0] - prev[0]) * 180) / Math.PI;
  const tail = pts[0], tail2 = pts[1], angT = (Math.atan2(tail[1] - tail2[1], tail[0] - tail2[0]) * 180) / Math.PI;
  const d = out.map((p) => p.join(",")).join(" ");
  // 光点沿已画出的部分循环流动
  const pp = ((t * 0.45) % 1) * upto; let dot = pts[0];
  for (let i = 1; i < seg.length; i++) if (seg[i] >= pp) { const f = (pp - seg[i - 1]) / (seg[i] - seg[i - 1] || 1); dot = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; break; }
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
      <polyline points={d} fill="none" stroke="#fff" strokeWidth={w + 6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
      <polyline points={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 14" strokeDashoffset={-t * 30} />
      <circle cx={dot[0]} cy={dot[1]} r={w + 3} fill={color} opacity={0.35} />
      <circle cx={dot[0]} cy={dot[1]} r={w - 1} fill={color} />
      <g transform={`translate(${head[0]} ${head[1]}) rotate(${ang})`}><path d="M -4 -12 L 16 0 L -4 12 Z" fill={color} stroke="#fff" strokeWidth={2} /></g>
      {both && k > 0.98 ? <g transform={`translate(${tail[0]} ${tail[1]}) rotate(${angT})`}><path d="M -4 -12 L 16 0 L -4 12 Z" fill={color} stroke="#fff" strokeWidth={2} /></g> : null}
    </svg>
  );
};


// 房间编号以户型模型里的地面名称为准：东侧卧室 bed_east、卫生间 bath_east、东北角封闭阳台 balcony_east
const CH2 = "楼栋 · 一层只属于一家", CH3 = "户型 · 一纵一横";
const MULTI = ["multi", "balcony_east"], MULTI_FILL = "#C7D9C9";

// ---------- Q2 东单元每层只有一套355：把东单元的一层“抽”出来，平面线稿浮在楼前 ----------
const B2R = { c: [204.87, 780.75] as [number, number], w: 53.94, d: 14.96, a: -2.4992 };
const b2At = (lx: number, lz: number): [number, number] => [B2R.c[0] + lx * Math.cos(B2R.a) - lz * Math.sin(B2R.a), B2R.c[1] + lx * Math.sin(B2R.a) + lz * Math.cos(B2R.a)];
const Q2K: CamSpec = { t: [B02[0] + 6, 50, B02[1] - 10], az: 232, el: 24, D: 340, span: 150, sx: 640, sy: 560 };
const FLOOR_Y = 58; // 抽出的那一层（示意）
/** 抽出来的一层：赤陶色楼板 + 顶面的户型平面线稿（平面北朝向楼的背面东北，按楼板大小缩放） */
const FloorOut: React.FC<{ k: number; out: number }> = ({ k, out }) => {
  const g = useMemo(() => {
    const grp = new THREE.Group();
    const slabW = B2R.w / 2 - 1.2, slabD = B2R.d + 0.8;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 2.4, slabD), new THREE.MeshLambertMaterial({ color: P.hero, transparent: true }));
    slab.castShadow = true; grp.add(slab);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(slabW - 0.6, slabD - 0.6), new THREE.MeshBasicMaterial({ color: "#F6EFE4", transparent: true }));
    top.rotation.x = -Math.PI / 2; top.position.y = 1.22; grp.add(top);
    const sc = Math.min((slabW - 1.6) / 22.8, (slabD - 1.6) / 17.9);
    const pts: number[] = [];
    for (const r of ROOMS) {
      const q = r.p.map(([px, py]) => [-(px - 11.4) * sc, -(py - 8.95) * sc]); // 平面东 → 局部 -x，平面北 → 局部 +z（楼背面）
      for (let n = 0; n < q.length; n++) { const a = q[n], b = q[(n + 1) % q.length]; pts.push(a[0], 1.26, a[1], b[0], 1.26, b[1]); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: "#7A4A36", transparent: true })); grp.add(lines);
    // 交通核：灰色弱化
    const core = ROOMS.find((r) => r.id === "core");
    if (core) { const sh = new THREE.Shape(core.p.map(([px, py], n) => new THREE.Vector2(-(px - 11.4) * sc, (py - 8.95) * sc))); const cm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: "#D8D2C8", transparent: true })); cm.rotation.x = -Math.PI / 2; cm.position.y = 1.24; grp.add(cm); }
    grp.rotation.y = -B2R.a;
    return grp;
  }, []);
  const [x, z] = b2At(-B2R.w / 4, -out * 55);
  g.position.set(x, FLOOR_Y + out * 8, z);
  g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material & { opacity: number }; if (m) m.opacity = k; });
  g.visible = k > 0.01;
  return <primitive object={g} />;
};
export const Q2: React.FC = () => {
  const t = useT(), len = shotById("Q2").len;
  const spec = { ...Q2K, az: 232 + 3 * pr(t, 0, len) };
  const cam = makeCamera(spec);
  const tE = kw("Q2", "东单元"), t1 = kw("Q2", "每层只有"), tg = kw("Q2", "当别处"), tn = kw("Q2", "不必再做");
  const kE = pr(t, tE - 0.2, 0.5), kOut = ease(pr(t, t1 - 0.2, 1.4)), k3 = pr(t, kw("Q2", "三百五十五") - 0.2, 0.6);
  const kg = pr(t, tg - 0.2, 0.6), kn = pr(t, tn - 0.2, 0.6);
  // 东单元立面加亮：一块贴在东单元正面的半透明赤陶色面
  const face = [[-B2R.w / 2, 0], [0, 0], [0, 96], [-B2R.w / 2, 96]].map(([lx, y]) => { const [x, z] = b2At(lx, -B2R.d / 2 - 0.6); return toScreen(cam, [x, y - 1.5, z]); });
  const slot = [[-B2R.w / 2, FLOOR_Y - 1.2], [0, FLOOR_Y - 1.2], [0, FLOOR_Y + 1.2], [-B2R.w / 2, FLOOR_Y + 1.2]].map(([lx, y]) => { const [x, z] = b2At(lx, -B2R.d / 2 - 0.7); return toScreen(cam, [x, y, z]); });
  const tag = (() => { const [x, z] = b2At(-B2R.w / 4, -B2R.d / 2); return toScreen(cam, [x, 100, z]); })();
  return (
    <PerspShot spec={spec} st={{ facade: 1, hero: 1, hi2: 0.4, ring: 0, fog: [900, 5000], box: 400, lt: [PAIR[0], 40, PAIR[1]] }} extra={<FloorOut k={kOut > 0 ? 1 : 0} out={kOut} />}>
      {() => (
        <>
          <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
            <polygon points={face.map((p) => p.join(",")).join(" ")} fill={P.hero} opacity={0.26 * kE} stroke={P.hero} strokeWidth={2} strokeOpacity={kE} />
            <polygon points={slot.map((p) => p.join(",")).join(" ")} fill="#3A3029" opacity={0.55 * Math.min(1, kOut * 3)} />
          </svg>
          <div style={{ position: "absolute", left: tag[0], top: tag[1] - 14, transform: "translate(-50%,-100%)", opacity: kE, fontFamily: SANS, fontSize: 26, fontWeight: 700, color: "#fff", background: P.hero, padding: "4px 14px", whiteSpace: "nowrap" }}>东单元</div>
          {/* 右侧文字：不放卡片；右边一层很淡的纸色渐隐，保证字压在楼群上也看得清 */}
          <AbsoluteFill style={{ background: "linear-gradient(270deg, rgba(243,240,234,.92) 0%, rgba(243,240,234,.75) 26%, rgba(243,240,234,0) 44%)" }} />
          <div style={{ position: "absolute", right: 110, top: 250, width: 560, textAlign: "right", fontFamily: SANS }}>
            <div style={{ fontSize: 24, color: P.hero, letterSpacing: 4, opacity: pr(t, 0.3, 0.5) }}>以2号楼为例 · 东单元</div>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 76, color: P.ink, marginTop: 14, letterSpacing: 4, opacity: pr(t, t1 - 0.2, 0.6), textShadow: "0 0 18px rgba(243,240,234,.9)" }}>每层只有一套</div>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 112, color: P.hero, marginTop: 4, opacity: k3, textShadow: "0 0 18px rgba(243,240,234,.9)" }}>355<span style={{ fontSize: 52 }}>㎡</span></div>
            <div style={{ width: 80 * kg, height: 3, background: P.hero, marginLeft: "auto", marginTop: 26 }} />
            <div style={{ fontSize: 28, color: P.ink2, marginTop: 22, opacity: kg, textShadow: "0 0 10px rgba(243,240,234,.95)" }}>别处，还在拿电梯前室的面积玩数字游戏</div>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 44, color: P.ink, marginTop: 12, opacity: kn, textShadow: "0 0 14px rgba(243,240,234,.95)" }}>瑞府，不必再做取舍</div>
          </div>
          <Footnote text="示意画面 · 抽出的楼层与平面为示意；355㎡ 在2号楼东单元、1号楼西单元，两楼户型左右镜像" />
        </>
      )}
    </PerspShot>
  );
};

// ---------- Q3 两梯一户：电梯门打开，人走出来，迎面是专属玄关厅（收纳墙、换鞋凳、挂衣格、玄关库）；电梯等人 ----------
// 动线只在玄关厅里：出电梯 → 走到收纳墙前停下。人物从门槛外才出现，不和电梯门叠在一起。
const LIFTS: [number, number][] = [[7.3, 6.58], [7.3, 8.86]];
const DOOR_X = 8.54, DOOR_W = 1.1; // 电梯门在交通核东侧墙上，正对玄关厅
const WALK: [number, number][] = [[8.8, 8.86], [9.45, 8.86], [10.0, 8.7]];
const along = (pts: [number, number][], u: number): [number, number] => {
  const n = pts.length - 1, f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), k = f - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
};
const V_DOOR: View = { c: [9.4, 7.9], span: 6.8, sx: 820, sy: 560 }, V_FOYER: View = { c: [9.7, 8.9], span: 7.8, sx: 820, sy: 560 };
const R_FOYER = [5.9, 4.9, 11.4, 13.0]; // 含两部电梯轿厢
export const Q3: React.FC = () => {
  const tl = kw("Q3", "两梯一户"), to = kw("Q3", "电梯门一开"), te = kw("Q3", "玄关厅"), tt = kw("Q3", "玄关厅") + 0.6;
  const tx = kw("Q3", "换鞋"), th = kw("Q3", "挂衣"), ts = kw("Q3", "收纳"), tf = kw("Q3", "第一步"), t2 = kw("Q3", "两部电梯"), tw = kw("Q3", "电梯等人");
  const objs = useMemo(() => {
    const mat = new THREE.MeshLambertMaterial({ color: "#D6BE8E" }), frameM = new THREE.MeshLambertMaterial({ color: "#2F2925" });
    const doors = LIFTS.map(() => [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(0.18, 1, DOOR_W / 2), mat)));
    const frames = LIFTS.map(() => new THREE.Mesh(new THREE.BoxGeometry(0.14, 1, DOOR_W), frameM));
    const walker = makePerson({ pose: "walk", x: WALK[0][0], y: WALK[0][1], outfit: 1, zone: "walker" }, 0, 55);
    return { doors, frames, walker };
  }, []);
  const extras = (t: number, floorY: number, grp: THREE.Object3D) => {
    const fixed = grp.getObjectByName("lift_doors"); if (fixed) fixed.visible = false; // 用这一镜自己会开合的门
    const H = U_CUT * 0.98;
    const open = [ease(pr(t, tw - 0.3, 1.0)), ease(pr(t, to - 0.1, 1.1))]; // 电梯2先开；说到“电梯等人”时电梯1也打开候着
    LIFTS.forEach(([, y], i) => {
      objs.frames[i].scale.y = H - 0.04; objs.frames[i].position.set(DOOR_X + 0.02, floorY + (H - 0.04) / 2, uz(y)); // 门后深色轿厢口：门关着时被门盖住，一拉开就露出一道深缝
      objs.doors[i].forEach((d, s) => { const sg = s ? 1 : -1; d.scale.y = H; d.position.set(DOOR_X + 0.02, floorY + H / 2, uz(y + sg * (DOOR_W / 4 + (DOOR_W / 2) * 0.92 * open[i]))); });
    });
    // 人：门开到一半后从门槛外走出来，走到换鞋凳前停下（不再离开玄关厅）
    const u = ease(clamp((t - (to + 0.6)) / (te + 0.2 - (to + 0.6))));
    const [wx, wy] = along(WALK, u);
    const vis = pr(t, to + 0.45, 0.25);
    const { sprite, shadow } = objs.walker;
    sprite.position.set(wx, floorY, uz(wy)); shadow.position.set(wx, floorY + 0.015, uz(wy));
    (sprite.material as THREE.SpriteMaterial).opacity = vis; (shadow.material as THREE.MeshBasicMaterial).opacity = 0.16 * vis;
    sprite.visible = shadow.visible = vis > 0.01;
    return [...objs.frames, ...objs.doors.flat(), sprite, shadow];
  };
  return (
    <UnitShot extras={extras}
      keys={[{ t: 0, view: V.whole, dim: 0 }, { t: 0.2, view: V_DOOR, focus: R.entry, dim: 1, dur: 1.5 }, { t: te - 0.4, view: V_FOYER, focus: R_FOYER, dim: 1, dur: 1.4 }, { t: t2 - 0.4, view: V_DOOR, focus: R.entry, dim: 1, dur: 1.3 }]}
      fills={[{ ids: ["entry"], color: "#F2D4B6", at: te - 0.4 }, { ids: ["entry_storage"], color: "#EBC9A6", at: ts - 0.3 }]}
      overlay={({ t, S }) => {
        const steps = Array.from({ length: 5 }, (_, i) => { const [x, y] = along(WALK, (i + 0.5) / 5); return { p: S(x + (i % 2 ? 0.12 : -0.12), y, 0.02), k: pr(t, tf - 0.2 + i * 0.14, 0.25) * (1 - pr(t, t2 - 0.4, 0.4)) }; });
        const wait = 0.6 + 0.4 * Math.sin(t * 5);
        const spill = (y: number, k: number) => {
          if (k <= 0.01) return null;
          const q = [S(DOOR_X, y - 0.5, 0.01), S(DOOR_X, y + 0.5, 0.01), S(DOOR_X + 1.7, y + 0.9, 0.01), S(DOOR_X + 1.7, y - 0.9, 0.01)];
          return <polygon points={q.map((p) => p.join(",")).join(" ")} fill="url(#q3spill)" opacity={k} />;
        };
        const open2 = ease(pr(t, to - 0.1, 1.1)), open1 = ease(pr(t, tw - 0.3, 1.0));
        const kTags = (a: number) => pr(t, a - 0.2, 0.4) * (1 - pr(t, t2 - 0.4, 0.4));
        return (
          <>
            <ChapterTag text={CH2} />
            {/* 电梯楼层灯：放在门的西侧（交通核里），不压住走出来的人 */}
            {LIFTS.map(([, y], i) => { const p = S(DOOR_X - 1.15, y, U_CUT + 0.2); const kk = pr(t, 0.6 + i * 0.2, 0.4); return (
              <div key={i} style={{ position: "absolute", left: p[0], top: p[1], transform: "translate(-50%,-50%)", opacity: kk, fontFamily: SANS, textAlign: "center", whiteSpace: "nowrap", display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ fontSize: 22, color: P.ink2, background: "rgba(255,255,255,.92)", padding: "3px 10px" }}>电梯 {i + 1}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", background: "#C9771F", padding: "3px 10px", opacity: i === 0 && t > tw - 0.3 ? 0.55 + 0.45 * wait : 1 }}>{i === 0 && t > tw - 0.3 ? "等候中" : "● 本层"}</div>
              </div>
            ); })}
            <Tag p={S(9.55, 5.6, U_CUT + 0.4)} text="专属玄关厅" k={pr(t, te - 0.3, 0.5)} color={P.hero} solid size={24} />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
              <defs><linearGradient id="q3spill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FFE2A6" stopOpacity={0.85} /><stop offset="1" stopColor="#FFE2A6" stopOpacity={0} /></linearGradient></defs>
              {spill(8.86, open2)}{spill(6.58, open1)}
              {steps.map((st_, i) => st_.k > 0.01 ? <ellipse key={i} cx={st_.p[0]} cy={st_.p[1]} rx={9} ry={15} fill={P.hero} opacity={0.8 * st_.k} /> : null)}
            </svg>
            {/* 收纳墙上的三个功能：标在柜子东侧（画面右边），不挡人 */}
            <Tag p={S(11.75, 8.9, U_CUT)} text="换鞋凳 · 鞋柜" k={kTags(tx)} color="#B4652F" solid size={22} />
            <Tag p={S(11.75, 7.6, U_CUT)} text="挂衣格" k={kTags(th)} color="#B4652F" solid size={22} />
            <Tag p={S(11.75, 6.1, U_CUT)} text="整墙收纳柜" k={kTags(ts)} color="#B4652F" solid size={22} />
            <Tag p={S(9.96, 12.25, U_CUT + 0.3)} text="玄关库" k={kTags(ts + 0.25)} color="#B4652F" solid size={22} />
            {/* 右侧：过渡空间 → 第一步 → 电梯等人 */}
            <div style={{ position: "absolute", left: 1400, top: 250, width: 440, fontFamily: SANS, opacity: pr(t, tt - 0.2, 0.6) * (1 - pr(t, t2 - 0.5, 0.4)), background: "rgba(243,240,234,.92)", padding: "18px 22px", borderRadius: 4 }}>
              <div style={{ fontSize: 20, color: P.ink2, letterSpacing: 2 }}>归家的过渡空间</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, fontSize: 22, color: P.ink2 }}>
                <span>电梯</span><span style={{ color: P.hero }}>→</span>
                <span style={{ background: P.hero, color: "#fff", fontWeight: 700, padding: "4px 12px" }}>玄关厅</span><span style={{ color: P.hero }}>→</span><span>家</span>
              </div>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 34, color: P.ink, marginTop: 18, opacity: pr(t, tf - 0.2, 0.5) }}>从迈出电梯的第一步</div>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 34, color: P.hero, marginTop: 6, opacity: pr(t, kw("Q3", "从容") - 0.2, 0.5) }}>就从容</div>
            </div>
            <div style={{ position: "absolute", left: 1400, top: 250, width: 440, fontFamily: SANS, opacity: pr(t, t2 + 0.1, 0.5), background: "rgba(243,240,234,.92)", padding: "18px 22px", borderRadius: 4 }}>
              <div style={{ fontSize: 20, color: P.ink2, letterSpacing: 2 }}>两梯一户 · 两部电梯只为这一户</div>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 34, color: P.ink2, marginTop: 18, position: "relative", display: "inline-block", opacity: pr(t, kw("Q3", "人等电梯") - 0.2, 0.5) }}>
                不是人等电梯
                <div style={{ position: "absolute", left: 0, top: "52%", height: 3, background: P.ink2, width: `${100 * pr(t, tw - 0.4, 0.5)}%` }} />
              </div>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 44, color: P.hero, marginTop: 8, opacity: pr(t, tw - 0.2, 0.5) }}>而是电梯等人</div>
            </div>
            {void tl}
          </>
        );
      }} />
  );
};

// ---------- R1 推门入室，景也随之入室；南向面宽22.8米 ----------
const SOUTH_ROOMS = [["master", "主卧"], ["bed_center", "主卧"], ["living", "客厅"], ["bed_east", "卧室"]] as const;
const SOUTH_C: Record<string, [number, number]> = { master: [2.6, 13.4], bed_center: [7.0, 13.8], living: [15.1, 12.6], bed_east: [20.8, 13.6] };
export const R1: React.FC = () => {
  const t0 = kw("R1", "二十二点八"), tr = kw("R1", "客厅与"), tg = kw("R1", "绿意");
  return (
    <UnitShot keys={[{ t: 0, view: V.entry, focus: R.entry, dim: 1 }, { t: 0.1, view: V.south, focus: R.south, dim: 1, dur: 1.4 }]}
      fills={[{ ids: ["entry"], color: "#F2D4B6", at: -1, out: 0.2 }, ...SOUTH_ROOMS.map(([id], i) => ({ ids: [id], color: id === "living" ? "#B9D29C" : "#E9CDB0", at: tr - 0.5 + i * 0.35 }))]}
      overlay={({ t, S }) => {
        const k = pr(t, t0 - 0.4, 1.0), kg = pr(t, tg - 0.3, 1.2);
        const a = S(0.2, 16.9, 0.2), b = S(22.6, 16.9, 0.2);
        return (
          <>
            <ChapterTag text={CH3} />
            <SideNote k={pr(t, 0.3, 0.6)} title="推门入室" text="景也随之入室" color={P.greenInk} y={150} />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
              <line x1={a[0]} y1={a[1]} x2={a[0] + (b[0] - a[0]) * k} y2={a[1] + (b[1] - a[1]) * k} stroke={P.hero} strokeWidth={4} />
              <line x1={a[0]} y1={a[1] - 14} x2={a[0]} y2={a[1] + 14} stroke={P.hero} strokeWidth={4} opacity={k} />
              <line x1={b[0]} y1={b[1] - 14} x2={b[0]} y2={b[1] + 14} stroke={P.hero} strokeWidth={4} opacity={k > 0.98 ? 1 : 0} />
            </svg>
            <Tag p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 34]} text="南向面宽约22.8米" k={k * (1 - kg)} color={P.hero} solid size={26} />
            {SOUTH_ROOMS.map(([id, n], i) => <Tag key={id} p={S(SOUTH_C[id][0], SOUTH_C[id][1], TOP)} text={n} k={pr(t, tr - 0.3 + i * 0.35, 0.4)} color={P.ink} size={22} />)}
            {/* 和园的绿意从南窗整面进来 */}
            {SOUTH_ROOMS.map(([id], i) => <Arrow key={id} id={`g${i}`} a={S(SOUTH_C[id][0], 18.6, 0)} b={S(SOUTH_C[id][0], 15.0, TOP)} k={pr(t, tg - 0.2 + i * 0.15, 0.7)} color={P.greenInk} w={5} one />)}
            <Tag p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 34]} text="窗外 · 和园的绿意，整面引进家里" k={kg} color={P.greenInk} solid size={24} />
          </>
        );
      }} note="南向面宽为户型示意图标注（含两侧构造），以交付标准为准；以2号楼为例，1号楼户型左右镜像" />
  );
};

// ---------- R2 豪宅的尽头是迷宫？瑞府355只有两条轴 ----------
const VX = 15.55, HY = 10.75; // 纵轴：客厅南窗（x 12.2–17.6）和茶区北窗（x 14.2–16.9）重叠段的中线，从窗到窗；横轴：主人过厅、玄关厅、客厅北侧这一条日常动线
const V_PTS = (S: Ctx["S"]) => [S(VX, 16.25, TOP), S(VX, 1.55, TOP)];
const H_PTS = (S: Ctx["S"]) => [S(1.2, 12.8, TOP), S(2.6, HY, TOP), S(19.0, HY, TOP)];
const Lines: React.FC<{ S: Ctx["S"]; kv: number; kh: number; t: number; labels?: boolean }> = ({ S, kv, kh, t, labels = true }) => (
  <>
    <FlowLine pts={V_PTS(S)} k={kv} t={t} color={P.ink} both />
    <FlowLine pts={H_PTS(S)} k={kh} t={t} color={P.hero} both />
    {labels ? (
      <>
        <Tag p={S(VX, -0.6, TOP)} text="纵轴 · 决定你看见什么" k={kv} color={P.ink} solid size={22} />
        <Tag p={S(21.4, HY, TOP)} text="横轴 · 决定你和谁在一起" k={kh} color={P.hero} solid size={22} />
      </>
    ) : null}
  </>
);
// 迷宫：只走真实的门洞和开敞处——玄关厅 → 过厅 → 客厅南窗 → 折回北侧 → 茶区 → 多功能区 → 厨房（门洞 x≈19.07、y 5.9–7.9）→ 东侧卧室，绕来绕去
const MAZE: [number, number][] = [[9.8, 6.0], [9.8, 10.8], [12.3, 10.8], [12.3, 15.45], [16.9, 15.45], [16.9, 9.4], [12.6, 9.4], [12.6, 5.35], [14.5, 5.35], [14.5, 2.6], [18.3, 2.6], [20.0, 2.9], [20.0, 4.7], [18.5, 4.7], [18.5, 6.4], [19.6, 6.4], [19.6, 7.6], [18.5, 7.6], [18.5, 9.6], [19.6, 9.6], [19.6, 13.0]];
export const R2: React.FC = () => {
  const tm = kw("R2", "迷宫"), ts = kw("R2", "却很简单"), tx = kw("R2", "两条轴"), kvT = kw("R2", "纵轴"), khT = kw("R2", "横轴");
  return (
    <UnitShot keys={[{ t: 0, view: V.south, focus: R.south, dim: 1 }, { t: 0.1, view: V.whole, dim: 0, dur: 1.4 }]}
      overlay={({ t, S }) => {
        const km = pr(t, tm - 0.4, 2.4) , fade = 1 - pr(t, ts - 0.3, 0.6);
        return (
          <>
            <ChapterTag text={CH3} k={1 - pr(t, ts - 0.5, 0.3)} />
            <div style={{ opacity: fade }}>
              <FlowLine pts={MAZE.map(([x, y]) => S(x, y, TOP))} k={km} t={t} color={P.ink2} w={5} />
              <SideNote k={pr(t, tm - 0.3, 0.5)} title="豪宅的尽头是迷宫？" text="房间多到要带导航" color={P.ink2} y={260} />
            </div>
            <BigTitle chapter="户型 · 一纵一横" title="只有两条轴" sub="瑞府355，却很简单" k={pr(t, ts - 0.2, 0.6)} />
            <Lines S={S} t={t} kv={pr(t, kvT - 0.2, 1.2)} kh={pr(t, khT - 0.2, 1.2)} />
          </>
        );
      }} />
  );
};

// ---------- R3 纵轴：客厅、餐厅、茶区、多功能区，约100㎡连成一片 ----------
const AXIS_ALL = [11.5, 1.9, 20.7, 15.83];
const SEE: [number, number][] = [[13.5, 14.75], [17.9, 6.4], [16.0, 2.6], [20.95, 2.55]]; // 客厅、餐厅、茶区、多功能区里的人
export const R3: React.FC = () => {
  const tl = kw("R3", "从客厅"), td = kw("R3", "餐厅"), tt = kw("R3", "茶区"), tm = kw("R3", "多功能区"), ta = kw("R3", "一百平方米"), tu = kw("R3", "抬头");
  return (
    <UnitShot keys={[{ t: 0, view: V.whole, dim: 0 }, { t: 0.3, view: V.axis, focus: AXIS_ALL, dim: 1, dur: 1.4 }]}
      fills={[{ ids: ["living"], color: ZONE.living.fill, at: tl }, { ids: ["dining"], color: ZONE.dining.fill, at: td - 0.2 }, { ids: ["tea"], color: ZONE.tea.fill, at: tt - 0.2 }, { ids: MULTI, color: MULTI_FILL, at: tm - 0.2 }]}
      people={[{ zone: "living", at: tu - 0.4 }, { zone: "dining", at: tu - 0.2 }, { zone: "tea", at: tu }, { zone: "multi", at: tu + 0.2 }]}
      overlay={({ t, S }) => {
        const ks = pr(t, tu + 0.2, 1.0);
        const eye = SEE.map(([x, y]) => S(x, y, 1.1));
        return (
          <>
            <ChapterTag text="户型 · 纵轴，决定你看见什么" />
            <FlowLine pts={V_PTS(S)} k={1 - pr(t, tu - 0.4, 0.5)} t={t} color={P.ink} both />
            {(["living", "dining", "tea"] as const).map((id, i) => <Tag key={id} p={S(17.2, [12.4, 7.2, 3.5][i], TOP)} text={["客厅", "餐厅", "茶区"][i]} k={pr(t, [tl, td, tt][i] - 0.2, 0.4) * (1 - ks)} color={ZONE[id].ink} solid size={24} />)}
            <Tag p={S(21.2, 3.5, TOP)} text="多功能区" k={pr(t, tm - 0.2, 0.4) * (1 - ks)} color={P.greenInk} solid size={24} />
            <SideNote k={pr(t, ta - 0.3, 0.5)} title="约100㎡，连成一片" text="客厅、餐厅、茶区、多功能区之间没有隔墙" color={P.ink} y={260} />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", opacity: ks }}>
              {eye.slice(1).map((p, i) => <line key={i} x1={eye[0][0]} y1={eye[0][1]} x2={eye[0][0] + (p[0] - eye[0][0]) * ks} y2={eye[0][1] + (p[1] - eye[0][1]) * ks} stroke={P.hero} strokeWidth={3} strokeDasharray="6 8" />)}
              <line x1={eye[1][0]} y1={eye[1][1]} x2={eye[3][0]} y2={eye[3][1]} stroke={P.hero} strokeWidth={3} strokeDasharray="6 8" />
            </svg>
            <SideNote k={pr(t, tu - 0.2, 0.5)} title="家人在哪个角落" text="抬头就能看见彼此" color={P.hero} y={420} />
          </>
        );
      }} note="约100㎡按户型示意图量算（客厅、餐厅、茶区、多功能区，不含阳台），多功能区按与封闭阳台打通示意；以交付标准为准" />
  );
};

// ---------- R4 午后看园，傍晚一桌人，入夜看城 ----------
export const R4: React.FC = () => {
  const ta = kw("R4", "午后"), td = kw("R4", "傍晚"), tn = kw("R4", "入夜");
  const all = [{ ids: ["living"], color: ZONE.living.fill, at: -1 }, { ids: ["dining"], color: ZONE.dining.fill, at: -1 }, { ids: ["tea"], color: ZONE.tea.fill, at: -1 }, { ids: MULTI, color: MULTI_FILL, at: -1 }];
  return (
    <UnitShot
      keys={[{ t: 0, view: V.axis, focus: AXIS_ALL, dim: 1 }, { t: ta - 0.3, view: V.living, focus: PY.living, dim: 1 }, { t: td - 0.3, view: V.dining, focus: PY.dining, dim: 1 }, { t: tn - 0.3, view: V.tea, focus: PY.tea, dim: 1 }]}
      fills={all} people={[{ zone: "living", at: ta }, { zone: "dining", at: td }, { zone: "tea", at: tn }]}
      tint={(t) => {
        const kd = pr(t, td - 0.3, 0.8) * (1 - pr(t, tn - 0.3, 0.8)), kn = pr(t, tn - 0.3, 0.8);
        if (kn > 0.01) return `rgba(${Math.round(255 - 95 * kn)},${Math.round(255 - 80 * kn)},${Math.round(255 - 40 * kn)},1)`;
        if (kd > 0.01) return `rgba(255,${Math.round(255 - 22 * kd)},${Math.round(255 - 48 * kd)},1)`;
        return null;
      }}
      overlay={({ t, S }) => {
        const kl = pr(t, ta + 0.3, 0.8) * (1 - pr(t, td - 0.4, 0.4)), kd = pr(t, td + 0.6, 0.8) * (1 - pr(t, tn - 0.4, 0.4)), kn = pr(t, tn - 0.2, 0.8);
        const fan = (o: [number, number], dirDeg: number, half: number, L: number, k: number, c: string) => {
          const p = S(o[0], o[1], 1.0);
          const a0 = ((dirDeg - half) * Math.PI) / 180, a1 = ((dirDeg + half) * Math.PI) / 180;
          return <path d={`M ${p[0]} ${p[1]} L ${p[0] + Math.cos(a0) * L * k} ${p[1] + Math.sin(a0) * L * k} L ${p[0] + Math.cos(a1) * L * k} ${p[1] + Math.sin(a1) * L * k} Z`} fill={c} opacity={0.24} />;
        };
        return (
          <>
            <ChapterTag text="户型 · 纵轴，决定你看见什么" />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
              {fan([13.5, 14.75], 90, 24, 420, kl, P.greenInk)}
              {fan([16.9, 6.4], 90, 18, 520, kd, P.greenInk)}
              {fan([16.9, 5.9], -90, 18, 460, kd, P.waterInk)}
              {fan([16.4, 3.4], -90, 30, 400, kn, "#E8B05C")}
            </svg>
            {kn > 0.01 ? (
              <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", opacity: kn }}>
                {Array.from({ length: 34 }).map((_, i) => { const p = S(12.5 + (i % 17) * 0.55, -1.5 - Math.floor(i / 17) * 1.4 - ((i * 7) % 3) * 0.3, 0); return <circle key={i} cx={p[0]} cy={p[1]} r={4 + (i % 3)} fill="#FFD48A" opacity={0.9} />; })}
              </svg>
            ) : null}
            <SideNote k={pr(t, ta - 0.2, 0.5)} n={1} title="午后 · 客厅" text="看和园的树影摇晃" color={ZONE.living.ink} y={220} />
            <SideNote k={pr(t, td - 0.2, 0.5)} n={2} title="傍晚 · 餐厅" text="一家人围坐圆桌，南边是园，北边是城" color={ZONE.dining.ink} y={360} />
            <SideNote k={pr(t, tn - 0.2, 0.5)} n={3} title="入夜 · 茶区" text="泡一壶茶，窗外是汾河和城市的灯火" color={ZONE.tea.ink} y={520} />
          </>
        );
      }} />
  );
};

// ---------- R5 东北角多功能区；厨房的窗外是汾河 ----------
export const R5: React.FC = () => {
  const tm = kw("R5", "多功能区"), tw = kw("R5", "两面开窗"), tc = kw("R5", "孩子的乐园"), tp = kw("R5", "琴房"), tk = kw("R5", "厨房"), tf = kw("R5", "汾河");
  return (
    <UnitShot keys={[{ t: 0, view: V.tea, focus: PY.tea, dim: 1 }, { t: 0.1, view: V.northeast, focus: R.northeast, dim: 1, dur: 1.4 }]}
      fills={[{ ids: MULTI, color: MULTI_FILL, at: tm - 0.4 }, { ids: ["tea"], color: ZONE.tea.fill, at: -1, out: 0.3 }, { ids: ["kitchen"], color: "#EBD3B4", at: tk - 0.3 }]}
      people={[{ zone: "multi", at: tc - 0.2 }, { zone: "kitchen", at: tk }]}
      overlay={({ t, S }) => {
        const fan = (o: [number, number], dirDeg: number, half: number, L: number, k: number, c: string) => {
          const p = S(o[0], o[1], TOP);
          const a0 = ((dirDeg - half) * Math.PI) / 180, a1 = ((dirDeg + half) * Math.PI) / 180;
          return <path d={`M ${p[0]} ${p[1]} L ${p[0] + Math.cos(a0) * L * k} ${p[1] + Math.sin(a0) * L * k} L ${p[0] + Math.cos(a1) * L * k} ${p[1] + Math.sin(a1) * L * k} Z`} fill={c} opacity={0.22} />;
        };
        const k1 = pr(t, tm - 0.2, 0.5) * (1 - pr(t, tk - 0.6, 0.4));
        return (
          <>
            <ChapterTag text="户型 · 纵轴，决定你看见什么" />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
              {fan([21.0, 1.9], -90, 26, 300, pr(t, tw - 0.2, 0.8), P.waterInk)}
              {fan([22.3, 3.4], 0, 26, 300, pr(t, tw + 0.3, 0.8), P.waterInk)}
              {fan([22.3, 7.1], 0, 30, 340, pr(t, tk + 0.2, 0.8), P.hero)}
            </svg>
            <Callout at={S(20.2, 3.4, TOP)} k={k1 * (1 - pr(t, tc - 0.4, 0.3))} title="东北角多功能区" sub="北、东两面开窗" color={P.waterInk} dx={-150} dy={-150} />
            <Callout at={S(20.2, 3.4, TOP)} k={pr(t, tc - 0.2, 0.4) * (1 - pr(t, tk - 0.6, 0.4))} title="可以是孩子的乐园" sub={t > tp - 0.2 ? "也可以是一间琴房" : " "} color={P.waterInk} dx={-150} dy={-150} />
            <Callout at={S(20.6, 7.2, TOP)} k={pr(t, tk - 0.2, 0.5)} title="厨房的窗外，汾河缓缓流过" sub={t > kw("R5", "做饭") - 0.2 ? "做饭，也成了一件有风景的事" : " "} color={P.hero} dx={-210} dy={140} />
            <Tag p={S(24.6, 7.1, 0)} text="汾河 →" k={pr(t, tf - 0.2, 0.5)} color={P.waterInk} solid size={22} />
          </>
        );
      }} note="多功能区按与封闭阳台打通后的使用方式示意（户型图中为部分赠送面积），以交付标准为准；以2号楼为例" />
  );
};

// ---------- R6 站在窗前，坐回厅里 ----------
export const R6: React.FC = () => {
  const ts = kw("R6", "站在窗前"), tc = kw("R6", "坐回厅里");
  return (
    <UnitShot keys={[{ t: 0, view: V.northeast, focus: R.northeast, dim: 1 }, { t: 0.1, view: V.livingClose, focus: PY.living, dim: 1, dur: 1.4 }]}
      fills={[{ ids: ["living"], color: ZONE.living.fill, at: -1 }, { ids: ["dining"], color: ZONE.dining.fill, at: -1 }, { ids: ["tea"], color: ZONE.tea.fill, at: -1 }]}
      people={[{ zone: "living", at: -1 }]}
      overlay={({ t, S }) => {
        const k1 = pr(t, ts - 0.2, 0.7), k2 = pr(t, tc - 0.2, 0.7);
        const p1 = S(16.9, 15.2, 1.2), p2 = S(13.5, 14.6, 0.9);
        const fan = (p: [number, number], half: number, L: number, k: number, op: number) => {
          const a0 = (90 - half) * Math.PI / 180, a1 = (90 + half) * Math.PI / 180;
          return <path d={`M ${p[0]} ${p[1]} L ${p[0] + Math.cos(a0) * L * k} ${p[1] + Math.sin(a0) * L * k} L ${p[0] + Math.cos(a1) * L * k} ${p[1] + Math.sin(a1) * L * k} Z`} fill={P.greenInk} opacity={op} />;
        };
        return (
          <>
            <ChapterTag text="户型 · 纵轴，决定你看见什么" />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
              {fan(p1, 16, 300, k1, 0.28)}
              {fan(p2, 40, 330, k2, 0.2)}
            </svg>
            <Callout at={p1} k={k1} title="站在窗前" sub="是你在看风景" color={P.greenInk} dx={120} dy={-160} />
            <Callout at={p2} k={k2} title="坐回厅里" sub="是风景在陪你" color={P.greenInk} dx={-150} dy={-60} />
          </>
        );
      }} />
  );
};

// ---------- R7 横轴：玄关厅居中，东聚西私 ----------
const JU = ["living", "dining", "tea", "kitchen", ...MULTI], SI = ["master", "wardrobe", "master_bath", "bed_center", "bath_guest"];
export const R7: React.FC = () => {
  const th = kw("R7", "横轴"), te = kw("R7", "玄关厅"), tj = kw("R7", "聚"), ts = kw("R7", "私"), tm = kw("R7", "两间南向");
  return (
    <UnitShot keys={[{ t: 0, view: V.livingClose, focus: PY.living, dim: 1 }, { t: 0.1, view: V.whole, dim: 0, dur: 1.4 }]}
      fills={[{ ids: ["living"], color: ZONE.living.fill, at: -1, out: 0.3 }, { ids: ["dining"], color: ZONE.dining.fill, at: -1, out: 0.3 }, { ids: ["tea"], color: ZONE.tea.fill, at: -1, out: 0.3 },
        { ids: ["entry"], color: "#F2D4B6", at: te - 0.2 }, { ids: JU, color: "#F0C9A6", at: tj - 0.2 }, { ids: SI, color: "#BCD2E0", at: ts - 0.2 }]}
      overlay={({ t, S }) => (
        <>
          <ChapterTag text="户型 · 横轴，决定你和谁在一起" />
          <FlowLine pts={H_PTS(S)} k={pr(t, th - 0.2, 1.2)} t={t} color={P.hero} both />
          <Tag p={S(9.8, 9.4, TOP + 0.4)} text="玄关厅" k={pr(t, te - 0.2, 0.5)} color={P.hero} solid size={24} />
          <div style={{ position: "absolute", left: S(16.5, 12.6, TOP)[0], top: S(16.5, 12.6, TOP)[1], transform: "translate(-50%,-50%)", opacity: pr(t, tj - 0.2, 0.5), fontFamily: SERIF, fontWeight: 900, fontSize: 120, color: "#B4652F", textShadow: "0 0 24px #fff" }}>聚</div>
          <div style={{ position: "absolute", left: S(4.6, 13.2, TOP)[0], top: S(4.6, 13.2, TOP)[1], transform: "translate(-50%,-50%)", opacity: pr(t, ts - 0.2, 0.5), fontFamily: SERIF, fontWeight: 900, fontSize: 120, color: "#4F7FA0", textShadow: "0 0 24px #fff" }}>私</div>
          <Tag p={S(2.6, 15.0, TOP + 0.4)} text="主卧套房" k={pr(t, tm - 0.1, 0.4)} color="#4F7FA0" solid size={20} />
          <Tag p={S(7.0, 15.0, TOP + 0.4)} text="主卧套房" k={pr(t, tm + 0.2, 0.4)} color="#4F7FA0" solid size={20} />
          <SideNote k={pr(t, tj, 0.5)} title="往东 · 聚" text="一家人的热闹都在这里" color="#B4652F" y={300} />
          <SideNote k={pr(t, ts, 0.5)} title="往西 · 私" text="两间南向主卧套房，各自安静" color="#4F7FA0" y={440} />
        </>
      )} />
  );
};

// ---------- R8 女主人的一天：起床、沐浴、选衣、着装；夜里窗前坐一会儿 ----------
// 走门洞：床边 → 主人过厅 → 衣帽间 → 主卫（沐浴）→ 回到衣帽间西侧（选衣）→ 出衣帽间 → 过厅落地镜前（着装）→ 往玄关厅
const ROUTE: [number, number][] = [[3.0, 12.2], [2.8, 10.7], [2.8, 6.3], [3.6, 6.6], [3.6, 8.8], [1.5, 8.8], [2.4, 9.6], [3.0, 10.4], [4.85, 10.5], [8.6, 10.8]];
const STOPS = [{ i: 0, w: "起床", dx: 90 }, { i: 2, w: "沐浴", dx: 90 }, { i: 5, w: "选衣", dx: -90 }, { i: 8, w: "着装", dx: 60 }];
const V_DAY: View = { c: [4.6, 10.0], span: 16.5, sx: 820, sy: 545 }, V_NIGHT: View = { c: [4.6, 13.6], span: 16.5, sx: 820, sy: 545 };
export const R8: React.FC = () => {
  const t0 = kw("R8", "起床"), tp = kw("R8", "公共区域"), tn = kw("R8", "夜里"), tw = kw("R8", "窗前"), td = kw("R8", "暗下");
  const t1 = tp + 0.8; // 路线从“起床”走到“玄关厅”，配音念完四个词后继续走完
  return (
    <UnitShot keys={[{ t: 0, view: V.whole, dim: 0 }, { t: 0.1, view: V_DAY, focus: R.master, dim: 1, dur: 1.4 }, { t: tn - 0.3, view: V_NIGHT, focus: R.master, dim: 1, dur: 1.4 }]}
      fills={[{ ids: ["entry"], color: "#F2D4B6", at: -1, out: 0.3 }, { ids: ["master", "wardrobe", "master_bath"], color: "#BCD2E0", at: 0.4 }]}
      people={[{ zone: "masterA", at: tw - 0.2 }]}
      tint={(t) => { const kn = pr(t, tn - 0.3, 0.9); return kn > 0.01 ? `rgba(${Math.round(255 - 100 * kn)},${Math.round(255 - 82 * kn)},${Math.round(255 - 40 * kn)},1)` : null; }}
      overlay={({ t, S }) => {
        const prog = (ROUTE.length - 1) * ease(clamp((t - (t0 - 0.2)) / (t1 - t0)));
        const pts = ROUTE.map(([x, y]) => S(x, y, TOP));
        const upto = (p: number) => { const out = [pts[0]]; for (let i = 1; i <= Math.floor(p) && i < pts.length; i++) out.push(pts[i]); const f = p - Math.floor(p); if (Math.floor(p) + 1 < pts.length && f > 0) { const a = pts[Math.floor(p)], b = pts[Math.floor(p) + 1]; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); } return out; };
        const drawn = upto(prog), dot = drawn[drawn.length - 1];
        const day = 1 - pr(t, tn - 0.4, 0.4);
        const kn = pr(t, tn, 0.8);
        return (
          <>
            <ChapterTag text="户型 · 横轴，决定你和谁在一起" />
            <SideNote k={pr(t, 0.3, 0.6) * day} title="女主人的一天" text="从这里开始" color="#4F7FA0" y={220} />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", opacity: day }}>
              <polyline points={drawn.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
              <polyline points={drawn.map((p) => p.join(",")).join(" ")} fill="none" stroke="#4F7FA0" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 12" strokeDashoffset={-t * 30} />
              {t > t0 - 0.3 ? <circle cx={dot[0]} cy={dot[1]} r={13} fill="#4F7FA0" stroke="#fff" strokeWidth={4} /> : null}
            </svg>
            {STOPS.map((s, i) => <Tag key={s.w} p={[pts[s.i][0] + s.dx, pts[s.i][1] - 10]} text={`${i + 1} ${s.w}`} k={pr(t, t0 - 0.2 + ((t1 - t0) * s.i) / (ROUTE.length - 1), 0.4) * day} color="#4F7FA0" solid size={22} />)}
            <SideNote k={pr(t, kw("R8", "一气呵成") - 0.2, 0.5) * day} title="一气呵成" text="不必穿过任何公共区域" color="#4F7FA0" y={360} />
            {/* 夜里：南窗外和园的灯一盏盏暗下 */}
            {kn > 0.01 ? (
              <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", opacity: kn }}>
                {Array.from({ length: 26 }).map((_, i) => { const p = S(-1.5 + (i % 13) * 1.05, 18.6 + Math.floor(i / 13) * 1.3 + ((i * 5) % 3) * 0.25, 0); const off = pr(t, td - 1.6 + ((i * 7) % 26) * 0.12, 0.3); return <circle key={i} cx={p[0]} cy={p[1]} r={5 + (i % 3)} fill="#FFD48A" opacity={0.9 * (1 - 0.8 * off)} />; })}
              </svg>
            ) : null}
            <Callout at={S(2.6, 15.2, 1.2)} k={pr(t, tw - 0.2, 0.5)} title="夜里，在窗前坐一会儿" sub="看和园的灯火渐次暗下，安静入睡" color="#4F7FA0" dx={260} dy={-150} />
          </>
        );
      }} />
  );
};

// ---------- R9 另一间南向主卧：应酬晚归，不必惊扰家人 ----------
const LATE: [number, number][] = [[9.8, 6.6], [9.8, 10.8], [8.4, 10.8], [8.4, 12.2], [7.9, 13.1]]; // 房门在第二间主卧东北角（x 8.0–8.8）
const V_DM: View = { c: [6.6, 11.6], span: 15, sx: 860, sy: 545 };
export const R9: React.FC = () => {
  const to = kw("R9", "另一间"), tb = kw("R9", "卫生间"), tl = kw("R9", "应酬晚归");
  return (
    <UnitShot keys={[{ t: 0, view: V_NIGHT, focus: R.master, dim: 1 }, { t: 0.1, view: V_DM, focus: R.doubleMaster, dim: 1, dur: 1.4 }]}
      fills={[{ ids: ["master", "wardrobe", "master_bath"], color: "#BCD2E0", at: -1, out: 0.3 }, { ids: ["bed_center"], color: "#BCD2E0", at: to }, { ids: ["bath_guest"], color: "#D3E2EA", at: tb - 0.2 }, { ids: ["entry"], color: "#F2D4B6", at: tl - 0.3 }]}
      people={[{ zone: "entry", at: tl - 0.2 }]}
      tint={(t) => { const kn = 1 - pr(t, 0, 0.8) + pr(t, tl - 0.4, 0.8); const k = clamp(kn); return k > 0.01 ? `rgba(${Math.round(255 - 100 * k)},${Math.round(255 - 82 * k)},${Math.round(255 - 40 * k)},1)` : null; }}
      overlay={({ t, S }) => (
        <>
          <ChapterTag text="户型 · 横轴，决定你和谁在一起" />
          <Tag p={S(6.6, 14.9, TOP + 0.4)} text="另一间南向主卧" k={pr(t, to - 0.2, 0.4)} color="#4F7FA0" solid size={24} />
          <Tag p={S(10.0, 14.6, TOP + 0.4)} text="卫生间也朝南" k={pr(t, tb - 0.2, 0.4)} color={P.ink} size={20} />
          <SideNote k={pr(t, kw("R9", "独立套房") - 0.2, 0.5)} title="同样是独立套房" text="卧室、卫生间自成一组" color="#4F7FA0" y={260} />
          <FlowLine pts={LATE.map(([x, y]) => S(x, y, TOP))} k={pr(t, tl, 1.8)} t={t} color="#4F7FA0" />
          <Tag p={S(2.6, 12.6, TOP + 0.4)} text="家人已入睡" k={pr(t, tl + 0.4, 0.5)} color={P.ink2} size={19} />
          <SideNote k={pr(t, tl - 0.1, 0.5)} title="应酬晚归" text="也不必惊扰家人" color="#4F7FA0" y={400} />
        </>
      )} />
  );
};

// ---------- R10 南面向光而居，北面从容而用；东边相聚，西边独处；多出来的是场景 ----------
const ZHU = ["master", "bed_center", "bath_guest", "living", "bed_east", "bath_east", "entry_storage"], YONG = ["tea", ...MULTI, "kitchen", "housekeeping", "bath_service", "dining"];
export const R10: React.FC = () => {
  const ts = kw("R10", "南面一排"), tn = kw("R10", "北面一排"), te = kw("R10", "东边相聚"), tw = kw("R10", "西边独处"), tc = kw("R10", "瑞府三五五"), tx = kw("R10", "是场景");
  return (
    <UnitShot keys={[{ t: 0, view: V_DM, focus: R.doubleMaster, dim: 1 }, { t: 0.1, view: V.whole, dim: 0, dur: 1.4 }]}
      fills={[{ ids: ["bed_center", "bath_guest"], color: "#BCD2E0", at: -1, out: 0.2 }, { ids: ZHU, color: "#E9CDB0", at: ts - 0.2 }, { ids: YONG, color: "#C9DCC0", at: tn - 0.2 }]}
      overlay={({ t, S }) => {
        const kc = pr(t, tc - 0.3, 0.8);
        const ke = pr(t, te - 0.2, 0.6), kw2 = pr(t, tw - 0.2, 0.6);
        const w0 = S(0.2, -0.6, TOP), e0 = S(22.6, -0.6, TOP), mid = S(11.3, -0.6, TOP);
        return (
          <>
            <ChapterTag text={CH3} k={1 - kc} />
            <Tag p={S(26.2, 13.6, TOP)} text="南面一排 · 向光而居" k={pr(t, ts - 0.2, 0.5)} color="#B4652F" solid size={26} />
            <Tag p={S(26.2, 3.6, TOP)} text="北面一排 · 从容而用" k={pr(t, tn - 0.2, 0.5)} color={P.greenInk} solid size={26} />
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
              <line x1={mid[0] + 8} y1={mid[1] - 50} x2={e0[0]} y2={e0[1] - 50} stroke="#B4652F" strokeWidth={5} opacity={ke} />
              <line x1={w0[0]} y1={w0[1] - 50} x2={mid[0] - 8} y2={mid[1] - 50} stroke="#4F7FA0" strokeWidth={5} opacity={kw2} />
            </svg>
            <Tag p={[(e0[0] + mid[0]) / 2, (e0[1] + mid[1]) / 2 - 84]} text="东边 · 相聚" k={ke} color="#B4652F" solid size={26} />
            <Tag p={[(w0[0] + mid[0]) / 2, (w0[1] + mid[1]) / 2 - 84]} text="西边 · 独处" k={kw2} color="#4F7FA0" solid size={26} />
            <AbsoluteFill style={{ background: `rgba(243,240,234,${0.9 * kc})` }} />
            <CenterTitle k={kc} kicker="瑞府355" title={t > tx - 0.3 ? "多出来的，是场景" : "多出来的"} />
          </>
        );
      }} />
  );
};

/** 四个维度卡片里“户型”那张小图：整户正北朝上、不倾斜，客厅、餐厅、茶区、多功能区铺色，不加标注 */
export const UnitThumb: React.FC = () => (
  <UnitShot keys={[{ t: 0, view: { c: [11.4, 8.95], span: 19.5, sx: 960, sy: 540 }, dim: 0 }]}
    fills={[{ ids: ["living"], color: ZONE.living.fill, at: -1 }, { ids: ["dining"], color: ZONE.dining.fill, at: -1 }, { ids: ["tea"], color: ZONE.tea.fill, at: -1 }, { ids: MULTI, color: MULTI_FILL, at: -1 }, { ids: ["master", "bed_center"], color: "#BCD2E0", at: -1 }]}
    note=" " />
);

export const UNIT_SHOTS = { Q2, Q3, R1, R2, R3, R4, R5, R6, R7, R8, R9, R10 };
void KeyMap; void RightTitle;

/** 调试用：户型正俯视 + 1 米网格（平面坐标），规划动线和软装用，不进成片 */
export const UnitGrid: React.FC = () => {
  const ready = useReady();
  const focus = useMemo(makeFocus, []);
  const unit = useMemo(() => (ready ? buildUnit(useWorld().unit, focus) : null), [ready, focus]);
  if (!unit) return <AbsoluteFill style={{ background: P.paper }} />;
  focus.uDim.value = 0;
  const cam = axo([11.4, 0.4, uz(8.95)], 180, 89.5, 600, 19.5, 960, 540);
  const S = (x: number, y: number) => toScreen(cam, [x, 0, uz(y)]);
  const xs = Array.from({ length: 24 }, (_, i) => i), ys = Array.from({ length: 19 }, (_, i) => i);
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <ThreeCanvas width={1920} height={1080} style={{ backgroundColor: P.paper }}>
        <UnitScene cam={cam} unit={unit.group} people={[]} />
      </ThreeCanvas>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
        {xs.map((x) => { const a = S(x, 0), b = S(x, 18); return <g key={x}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#E0302F" strokeWidth={x % 5 ? 0.6 : 1.4} opacity={0.6} /><text x={a[0] + 2} y={a[1] + 14} fontSize={14} fill="#E0302F">{x}</text></g>; })}
        {ys.map((y) => { const a = S(0, y), b = S(23, y); return <g key={y}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2F60E0" strokeWidth={y % 5 ? 0.6 : 1.4} opacity={0.6} /><text x={a[0] + 2} y={a[1] - 2} fontSize={14} fill="#2F60E0">{y}</text></g>; })}
      </svg>
    </AbsoluteFill>
  );
};
