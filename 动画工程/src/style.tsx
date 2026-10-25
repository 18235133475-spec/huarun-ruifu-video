// 风格样帧（2026-10-22）：统一视觉系统的样帧，第三版定稿。公共部分已搬到 src/v2/，这里只留样帧本身。
// 不调用任何 AI 生成；区域数据复用 world.tsx，户型数据由 tools/style/export_plan.py 导出。
import React, { useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { clamp, ease } from "./lib";
import { useWorld } from "./world";
import { PEOPLE, makeFocus, makePerson } from "./unitdress";
import { useReady } from "./v2/data";
import { B01, B02, LOOK, PAIR, XZ, at, axo, dirOf, makeCam, toScreen } from "./v2/geo";
import { RegionScene } from "./v2/map";
import { Chip, Footnote, N, P, Pin, SANS, SERIF, VTitle } from "./v2/theme";
import { KeyMap, PY, FocusKey, ROOM_LABEL, U_CUT, U_X, UnitScene, ZONE, buildUnit, cen, usePlan, uz } from "./v2/unit";

// ---------- 视觉系统 ----------




// ---------- 样帧1：区域扁平彩色底图 ----------







export const StyleRegion: React.FC<{ bare?: boolean; night?: boolean; diagram?: boolean }> = ({ bare = false, night = false, diagram = true }) => {
  const ready = useReady();
  const cam = useMemo(makeCam, []);
  if (!ready) return <AbsoluteFill style={{ background: night ? N.bg : P.paper }} />;
  const s = (p: XZ, y = 0) => toScreen(cam, [p[0], y, p[1]]);
  // 比例尺：500米在屏幕上的像素（沿屏幕横向近似）
  const a = s([LOOK[0], LOOK[2]]), b = toScreen(cam, [LOOK[0] + 500 * Math.cos((20 * Math.PI) / 180), 0, LOOK[2] + 500 * Math.sin((20 * Math.PI) / 180)]);
  const scalePx = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const north = [s([LOOK[0], LOOK[2]]), s([LOOK[0], LOOK[2] - 100])];
  const nAng = (Math.atan2(north[1][0] - north[0][0], -(north[1][1] - north[0][1])) * 180) / Math.PI;
  const lake = s(at(218, 980));
  const bg = night ? N.bg : P.paper;
  const fc = (a: number) => (night ? `rgba(22,27,36,${a})` : `rgba(242,237,228,${a})`);
  return (
    <AbsoluteFill style={{ background: bg }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: bg }}>
        <RegionScene cam={cam} night={night} diagram={diagram} />
      </ThreeCanvas>
      {/* 地图四周晕到底色 */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 62% 66% at 58% 56%, ${fc(0)} 62%, ${bg} 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(90deg, ${bg} 0%, ${fc(0.88)} 20%, ${fc(0)} 36%, ${fc(0)} 82%, ${fc(0.7)} 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(0deg, ${bg} 0%, ${fc(0)} 13%)` }} />
      {bare ? null : (
        <>
          <Pin at={s(PAIR, 100)} label="1号、2号楼" sub="一起转向西南" dx={80} dy={-50} color={P.hero} solid />
          <Pin at={s([5, 1075])} label="和园" sub="正前方" dx={-40} dy={-30} color={P.greenInk} />
          <Pin at={s([-300, 720])} label="谐园" sub="右前方" dx={-40} dy={-60} color={P.greenInk} />
          <Pin at={s([680, 770])} label="汾河" sub="身后偏东" dx={60} dy={-50} color={P.waterInk} />
          <Pin at={s([60, 0], 20)} label="文化岛 · 五大馆" sub="身后" dx={-30} dy={-90} color={P.waterInk} />
          <div style={{ position: "absolute", left: lake[0], top: lake[1] + 14, transform: "translate(-50%, 0)", fontFamily: SANS, color: P.hero, fontSize: 22, fontWeight: 600, letterSpacing: 1, whiteSpace: "nowrap" }}>
            ↙ 晋阳湖方向 · 约2.8公里
          </div>
          <VTitle x={110} y={92} chapter="第一章　它转过身，看见了什么" lines={["面朝和园", "背靠汾河"]} sub={["山、河、湖、园、馆、城，", "围着这两栋楼排了一圈"]} />
          <div style={{ position: "absolute", left: 96, bottom: 84, display: "flex", gap: 26 }}>
            <Chip color={P.hero} label="1、2号楼 · 视线前方" />
            <Chip color={P.waterInk} label="视线身后" />
            <Chip color={P.green} label="园" />
            <Chip color={P.water} label="水" />
            <Chip color={P.city} label="城" />
          </div>
          {/* 指北针与比例尺 */}
          <div style={{ position: "absolute", right: 110, bottom: 92, display: "flex", alignItems: "flex-end", gap: 34, fontFamily: SANS, color: P.ink2, fontSize: 16 }}>
            <div style={{ textAlign: "center" }}>
              <svg width={40} height={52} style={{ transform: `rotate(${nAng}deg)` }}><path d="M20 2 L32 44 L20 36 L8 44 Z" fill={P.ink2} /></svg>
              <div>北</div>
            </div>
            <div>
              <div style={{ width: scalePx, height: 8, borderLeft: `2px solid ${P.ink2}`, borderRight: `2px solid ${P.ink2}`, borderBottom: `2px solid ${P.ink2}` }} />
              <div style={{ marginTop: 6 }}>约500米</div>
            </div>
          </div>
          <Footnote text="示意图 · 建筑轮廓：3D-GloBFP（CC BY 4.0）、© OpenStreetMap；瑞府楼栋按甲方总平面配准，朝向以甲方确认为准" />
        </>
      )}
    </AbsoluteFill>
  );
};

// ---------- 1、2号楼立面近景：同一套底图，机位下到和园上空，楼体按效果图的立面特征画 ----------
const FACADE_CAM = () => {
  const [dx, dz] = dirOf(222);
  const D = 560, el = 9, tgt = new THREE.Vector3(PAIR[0] + 10, 46, PAIR[1]);
  const c = new THREE.PerspectiveCamera(30, 16 / 9, 5, 20000);
  c.position.set(tgt.x + dx * D * Math.cos((el * Math.PI) / 180), tgt.y + D * Math.sin((el * Math.PI) / 180), tgt.z + dz * D * Math.cos((el * Math.PI) / 180));
  c.lookAt(tgt); c.updateProjectionMatrix(); c.updateMatrixWorld();
  return c;
};
export const StyleFacade: React.FC = () => {
  const ready = useReady();
  const cam = useMemo(FACADE_CAM, []);
  if (!ready) return <AbsoluteFill style={{ background: P.paper }} />;
  const t1 = toScreen(cam, [B01[0], 100, B01[1]]), t2 = toScreen(cam, [B02[0], 100, B02[1]]);
  const tag = (p: [number, number], label: string) => (
    <div style={{ position: "absolute", left: p[0], top: p[1] - 14, transform: "translate(-50%, -100%)", textAlign: "center", fontFamily: SANS }}>
      <div style={{ background: P.hero, color: "#fff", fontSize: 22, fontWeight: 600, padding: "5px 14px", letterSpacing: 1 }}>{label}</div>
      <div style={{ width: 2, height: 22, background: P.hero, margin: "0 auto" }} />
    </div>
  );
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: P.paper }}>
        <RegionScene cam={cam} diagram={false} facade />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${P.paper} 0%, rgba(242,237,228,0) 30%)` }} />
      {tag(t1, "1号楼")}
      {tag(t2, "2号楼")}
      <div style={{ position: "absolute", right: 104, top: 92, textAlign: "right", fontFamily: SANS }}>
        <div style={{ fontSize: 20, color: P.hero, letterSpacing: 3 }}>开篇　它转了个身</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 84, color: P.ink, marginTop: 12, letterSpacing: 4, lineHeight: 1.2 }}>最北边的两栋<br />一起转向西南</div>
        <div style={{ fontSize: 24, color: P.ink2, marginTop: 16 }}>不是画错了，是故意的</div>
      </div>
      <Footnote text="示意画面 · 立面按甲方效果图特征简化绘制，楼栋位置按甲方总平面配准" />
    </AbsoluteFill>
  );
};

// ---------- 白天转夜景：同一张底图，剪纸斑块从1、2号楼翻到夜色 ----------
export const StyleNight: React.FC = () => {
  const f = useCurrentFrame();
  const k = ease(clamp((f - 100) / 24));
  return (
    <AbsoluteFill style={{ background: N.bg }}>
      <AbsoluteFill><OffthreadVideo src={staticFile("style/day_to_night.mp4")} /></AbsoluteFill>
      <div style={{ position: "absolute", right: 110, bottom: 120, textAlign: "right", opacity: k, transform: `translateY(${(1 - k) * 14}px)`, fontFamily: SANS, color: "#F3E9D8" }}>
        <div style={{ fontSize: 20, color: "#E8B596", letterSpacing: 3 }}>第一章　它转过身，看见了什么</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 80, marginTop: 10, letterSpacing: 4 }}>入夜，是整片亮起来的灯</div>
        <div style={{ fontSize: 24, marginTop: 12, color: "rgba(243,233,216,.8)" }}>白天，是一条河和一座城的轮廓</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 样帧2：立体户型分析图 ----------
// 户型沙盘（world.tsx 已切到1.5米、去吊顶）整体压到0.75倍高：墙约1.1米，墙顶剖切面涂深色，像建筑剖切模型。
// 讲法同平面版：纵线三段分区铺色 + 序号 + 引线说明；不进入户内。




const BEATS: { at: number; key: FocusKey }[] = [{ at: 45, key: "all" }, { at: 92, key: "living" }, { at: 152, key: "dining" }, { at: 212, key: "tea" }, { at: 272, key: "all" }];
export const UNIT_FRAMES = 330;
const POP: Record<string, number> = { entry: 20, living: 100, dining: 160, tea: 220 };
// 镜头：讲到某一区时推近到这一区（平面坐标中心、画面纵向米数），回到“纵线三段”时拉回整户
const VIEW: Record<FocusKey | "home", { c: [number, number]; span: number }> = {
  home: { c: [11.4, 8.95], span: 26.5 }, all: { c: [11.4, 8.95], span: 26.5 },
  living: { c: [15.0, 12.4], span: 15 }, dining: { c: [15.2, 7.2], span: 14 }, tea: { c: [15.8, 3.6], span: 14 },
};
const viewAt = (f: number) => {
  let i = -1; BEATS.forEach((b, j) => { if (f >= b.at) i = j; });
  const cur = i < 0 ? VIEW.home : VIEW[BEATS[i].key], prev = i <= 0 ? VIEW.home : VIEW[BEATS[i - 1].key];
  const k = i < 0 ? 1 : ease(clamp((f - BEATS[i].at) / 26));
  return { c: [prev.c[0] + (cur.c[0] - prev.c[0]) * k, prev.c[1] + (cur.c[1] - prev.c[1]) * k], span: prev.span + (cur.span - prev.span) * k };
};
const focusAt = (f: number) => {
  let i = -1; BEATS.forEach((b, j) => { if (f >= b.at) i = j; });
  if (i < 0) return { rect: PY.all as readonly number[], dim: 0, key: null as FocusKey | null };
  const cur = PY[BEATS[i].key], prev = i > 0 ? PY[BEATS[i - 1].key] : PY.all;
  const k = ease(clamp((f - BEATS[i].at) / 18));
  return { rect: cur.map((v, j) => prev[j] + (v - prev[j]) * k), dim: i === 0 ? k : 1, key: BEATS[i].key };
};

export const StylePlan: React.FC = () => {
  const f = useCurrentFrame();
  const ready = useReady();
  const plan = usePlan();
  const v = viewAt(f);
  const cam = axo([v.c[0], 0.4, uz(v.c[1])], 171, 55, 600, v.span, 930, 440);
  const focus = useMemo(makeFocus, []);
  const unit = useMemo(() => (ready ? buildUnit(useWorld().unit, focus) : null), [ready, focus]);
  const people = useMemo(() => (unit ? PEOPLE.map((p) => makePerson(p, unit.floorY, 55)) : []), [unit]);
  if (!ready || !plan || !unit) return <AbsoluteFill style={{ background: P.paper }} />;
  const fs = focusAt(f);
  focus.uFocus.value.set(fs.rect[0], uz(fs.rect[1]), fs.rect[2], uz(fs.rect[3]));
  focus.uDim.value = fs.dim;
  const inFocus = (zone: string) => fs.key === null || (fs.key === "all" ? ["living", "dining", "tea"].includes(zone) : fs.key === zone);
  people.forEach(({ sprite, shadow, spec }) => {
    const k = ease(clamp((f - POP[spec.zone]) / 10));
    const o = k * (inFocus(spec.zone) || fs.dim < 0.5 ? 1 : 0.32);
    (sprite.material as THREE.SpriteMaterial).opacity = o;
    (shadow.material as THREE.MeshBasicMaterial).opacity = 0.16 * o;
    sprite.visible = shadow.visible = k > 0.01;
    const base = sprite.userData.base ?? (sprite.userData.base = sprite.scale.clone());
    sprite.scale.copy(base).multiplyScalar(0.85 + 0.15 * k);
  });
  const S = (x: number, y: number, z: number) => toScreen(cam, [x, y, z]);
  const top = U_CUT + 0.25;
  const ka = ease(clamp((f - 45) / 40));
  const a0 = S(U_X, top, uz(17.2)), a1full = S(U_X, top, uz(0.7));
  const a1 = [a0[0] + (a1full[0] - a0[0]) * ka, a0[1] + (a1full[1] - a0[1]) * ka];
  const zones = Object.entries(ZONE).map(([id, z]) => {
    const r = plan.rooms.find((q) => q.id === id)!; const [, cy] = cen(r.polygon);
    const shown = ease(clamp((f - 60) / 15));
    return { id, z, p: S(U_X, top, uz(cy)), o: shown * (fs.key === null || fs.key === "all" || fs.key === id ? 1 : 0.28) };
  });
  const roomIn = (x: number, y: number) => fs.dim < 0.5 || (x >= Math.min(fs.rect[0], fs.rect[2]) && x <= Math.max(fs.rect[0], fs.rect[2]) && y >= Math.min(fs.rect[1], fs.rect[3]) && y <= Math.max(fs.rect[1], fs.rect[3]));
  const labels = plan.rooms.filter((r) => ROOM_LABEL[r.id]).map((r) => { const [cx, cy] = cen(r.polygon); return { t: ROOM_LABEL[r.id], p: S(cx, 0.1, uz(cy)), o: r.id === "core" ? 0.45 : roomIn(cx, cy) ? 1 : 0.35 }; });
  const north = S(U_X, 0, uz(-2.2)), south = S(U_X, 0, uz(18.5));
  const CX = 1520; // 说明文字列
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: P.paper }}>
        <UnitScene cam={cam} unit={unit.group} people={people.flatMap((p) => [p.sprite, p.shadow])} />
      </ThreeCanvas>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
        <defs><marker id="arr" markerUnits="userSpaceOnUse" markerWidth="24" markerHeight="24" refX="12" refY="12" orient="auto-start-reverse"><path d="M0,1 L24,12 L0,23 z" fill={P.ink} /></marker></defs>
        {labels.map((l, i) => <text key={i} x={l.p[0]} y={l.p[1]} opacity={l.o} textAnchor="middle" fontFamily={SANS} fontSize={17} fill={P.ink2} stroke="#F5F0E7" strokeWidth={4} paintOrder="stroke">{l.t}</text>)}
        {ka > 0.01 ? <line x1={a0[0]} y1={a0[1]} x2={a1[0]} y2={a1[1]} stroke={P.ink} strokeWidth={4.5} markerEnd="url(#arr)" markerStart={ka > 0.98 ? "url(#arr)" : undefined} /> : null}
        {zones.map(({ id, z, p, o }) => (
          <g key={id} opacity={o}>
            <polyline points={`${p[0] + 24},${p[1]} ${CX - 20},${p[1]}`} fill="none" stroke={z.ink} strokeWidth={1.6} strokeDasharray="2 5" />
            <circle cx={p[0]} cy={p[1]} r={22} fill={z.ink} stroke="#fff" strokeWidth={3} />
            <text x={p[0]} y={p[1] + 9} textAnchor="middle" fontFamily={SANS} fontWeight={700} fontSize={25} fill="#fff">{z.n}</text>
          </g>
        ))}
      </svg>
      {zones.map(({ id, z, p, o }) => (
        <div key={id} style={{ position: "absolute", left: CX, top: p[1] - 22, fontFamily: SANS, opacity: o }}>
          <div style={{ fontSize: 27, fontWeight: 600, color: z.ink }}>{z.time}</div>
          <div style={{ fontSize: 19, color: P.ink2, marginTop: 4 }}>{z.text}</div>
        </div>
      ))}
      <div style={{ position: "absolute", left: north[0], top: north[1], transform: "translate(-50%, -100%)", fontFamily: SANS, fontSize: 20, color: P.waterInk, fontWeight: 600, whiteSpace: "nowrap", letterSpacing: 1 }}>北 · 长风商务区与汾河</div>
      <div style={{ position: "absolute", left: south[0], top: south[1], transform: "translate(-50%, 0)", fontFamily: SANS, fontSize: 20, color: P.greenInk, fontWeight: 600, whiteSpace: "nowrap", letterSpacing: 1 }}>南 · 和园，远眺晋阳湖</div>
      {/* 标题放在左下，大字、不加竖条；推近讲某一区时淡出，只在左上留一个小章节标签，避免和讲解抢注意力 */}
      <div style={{ position: "absolute", left: 96, top: 72, fontFamily: SANS, fontSize: 22, color: P.hero, letterSpacing: 3, opacity: 1 - clamp((v.span - 18) / 6), background: "rgba(242,237,228,.92)", padding: "8px 14px" }}>第三章 · 纵线，管看什么</div>
      <div style={{ position: "absolute", left: 96, bottom: 92, fontFamily: SANS, opacity: clamp((v.span - 18) / 6) }}>
        <div style={{ fontSize: 20, color: P.hero, letterSpacing: 3 }}>第三章　一纵一横，看懂这张平面</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 76, color: P.ink, marginTop: 10, letterSpacing: 2 }}>纵线，管看什么</div>
        <div style={{ fontSize: 24, color: P.ink2, marginTop: 10 }}>客厅、餐厅、茶区前后相连，中间没有一道隔墙</div>
      </div>
      <div style={{ opacity: clamp((v.span - 18) / 6) }}><KeyMap x={96} y={84} size={170} /></div>
      <Footnote right text="以2号楼为例，1号楼户型左右镜像。软装与人物为示意，尺寸以交付标准为准" />
    </AbsoluteFill>
  );
};

// ---------- 样帧3：效果图线稿进场（标题放在天空，横排大字） ----------
export const StyleReveal: React.FC = () => {
  const f = useCurrentFrame();
  const k = ease(clamp((f - 100) / 24));
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <AbsoluteFill><OffthreadVideo src={staticFile("style/reveal_c09.mp4")} /></AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(30,26,40,.32) 0%, rgba(30,26,40,0) 38%)", opacity: k }} />
      <div style={{ position: "absolute", left: 104, top: 96, opacity: k, transform: `translateY(${(1 - k) * 14}px)`, fontFamily: SANS, color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,.35)" }}>
        <div style={{ fontSize: 20, letterSpacing: 3, opacity: 0.9 }}>第一章　它转过身，看见了什么</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 92, letterSpacing: 6, marginTop: 8 }}>面朝和园</div>
        <div style={{ fontSize: 25, marginTop: 6, letterSpacing: 1 }}>近处的和园，草坪、树林、水系，一年四季都在变</div>
      </div>
      <AbsoluteFill style={{ opacity: k }}><Footnote dark right text="效果示意，最终以规划审批为准" /></AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- 样帧3变体：区域底图按剪纸斑块翻成甲方鸟瞰，作片名卡（居中、对称） ----------
export const StyleMapReveal: React.FC = () => {
  const f = useCurrentFrame();
  const k = ease(clamp((f - 104) / 26));
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <AbsoluteFill><OffthreadVideo src={staticFile("style/map_to_c04.mp4")} /></AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 58% 40% at 50% 47%, rgba(24,18,12,.62) 0%, rgba(24,18,12,0) 100%)", opacity: k }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: k, fontFamily: SANS, color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,.45)" }}>
        <div style={{ fontSize: 28, letterSpacing: 12, marginBottom: 18 }}>太原瑞府</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 96, letterSpacing: 8, transform: `scale(${1.04 - 0.04 * k})` }}>一栋楼，为太原转了个身</div>
        <div style={{ width: 64 * k + 16, height: 3, background: P.heroL, marginTop: 26 }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: k }}><Footnote dark right text="效果示意，最终以规划审批为准" /></AbsoluteFill>
    </AbsoluteFill>
  );
};
