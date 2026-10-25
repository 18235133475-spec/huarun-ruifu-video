// v2 第一章“它转过身，看见了什么”：B1 面朝和园、远眺晋阳湖；B2 背靠汾河和五大馆。
// 每个看点 = 一个合适的尺度 + 一句体验文案（HR-VIDEO-003a，用户 2026-10-23 确认）。
import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { CamSpec, V3, XZ, lerpCam, makeCamera, toScreen } from "./geo";
import { MapScene, MapState } from "./map";
import { pr, useT } from "./open";
import { BuildingTag, Callout, Footnote, N, P, SANS, SkyTitle } from "./theme";
import { clamp, ease } from "../lib";
import { kw, shotById } from "./timeline";
import { makePerson, Pose } from "../unitdress";

/** 透视镜头：不做地图式四周晕白，改用空气透视（雾）和顶部天空渐变 */
export const PerspShot: React.FC<{ spec: CamSpec; st: MapState; extra?: React.ReactNode; dark?: boolean; children?: (s: (p: XZ, y?: number) => [number, number]) => React.ReactNode }> = ({ spec, st, extra, dark, children }) => {
  const cam = makeCamera(spec);
  cam.near = Math.max(5, spec.D * 0.05); cam.far = Math.max(30000, spec.D + 9000); cam.updateProjectionMatrix(); // 拉到高空俯视时远裁面跟着放远，否则画面上半截被裁掉
  const s = (p: XZ, y = 0) => toScreen(cam, [p[0], y, p[1]] as V3);
  return (
    <AbsoluteFill style={{ background: dark ? N.bg : P.paper }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: dark ? N.bg : P.paper }}>
        <MapScene cam={cam} st={st} />
        {extra}
      </ThreeCanvas>
      <AbsoluteFill style={{ background: dark ? "linear-gradient(180deg, rgba(40,52,96,.9) 0%, rgba(34,43,72,0) 26%)" : "linear-gradient(180deg, rgba(243,240,234,.85) 0%, rgba(243,240,234,0) 22%)" }} />
      {children ? children(s) : null}
    </AbsoluteFill>
  );
};

// ---------- B1 ----------
const HEYUAN: XZ = [10, 1060];
const LAKE: XZ = [-1700, 3300];
// 机位放在2号楼楼顶略前方（约110米高），朝西南看；其他瑞府楼栋在视野左侧之外
const B1K0: CamSpec = { t: [-55, 0, 1050], az: 44, el: 17, D: 378, span: 300, sy: 600 };
const B1K1: CamSpec = { t: [-75, 0, 1090], az: 43, el: 16, D: 420, span: 270, sy: 600 };
const B1K2: CamSpec = { t: [LAKE[0], 0, LAKE[1]], az: 37, el: 6.5, D: 3350, span: 2200, sy: 560 };

export const O4: React.FC = () => {
  const t = useT(), len = shotById("O4").len;
  const th = kw("O4", "和园"), tg = kw("O4", "南中环"), tl = kw("O4", "晴好");
  const spec = t < tl - 0.4 ? lerpCam(B1K0, B1K1, pr(t, 0, tl - 0.4)) : lerpCam(B1K1, B1K2, pr(t, tl - 0.4, len - (tl - 0.4) - 0.3));
  const far = pr(t, tl - 0.4, 2);
  const fog: [number, number] = [900 + 3200 * far, 4200 + 9000 * far];
  return (
    <PerspShot spec={spec} st={{ facade: 1, hero: 1, ring: 0, fog, box: 600 + 2400 * far, lt: [HEYUAN[0] + (LAKE[0] - HEYUAN[0]) * far * 0.6, 0, HEYUAN[1] + (LAKE[1] - HEYUAN[1]) * far * 0.6] }}>
      {(s) => (
        <>
          <SkyTitle k={pr(t, 0.3, 0.6) * (1 - pr(t, th + 0.4, 0.5))} chapter="答案，在它看见的风景里" title="一个侧身，园、湖入怀" />
          <Callout band at={s([20, 1040], 12)} k={pr(t, th + 0.6, 0.5) * (1 - pr(t, tg - 0.2, 0.3))} title="和园，映入眼帘" sub="楼下就是园子" color={P.greenInk} />
          <Callout band at={s([40, 1320], 3)} k={pr(t, tg + 0.1, 0.5) * (1 - pr(t, tl - 0.5, 0.4))} title="绿意一直铺到南中环" sub="视野开阔，少有遮挡" color={P.greenInk} />
          <Callout band at={s([-1900, 3480], 2)} k={pr(t, tl + 1.4, 0.6)} title="晋阳湖的粼粼波光" sub="天气晴好时，尽收眼底 · 约2.8公里" color={P.waterInk} />
          <Footnote text="示意画面 · 视线条件随楼层、天气变化；晋阳湖水面 © OpenStreetMap，远景建筑 3D-GloBFP（CC BY 4.0）" />
        </>
      )}
    </PerspShot>
  );
};

// ---------- B2 ----------
export const B2K1: CamSpec = { t: [70, 6, 60], az: 172, el: 21, D: 760, span: 560, sy: 560 };

/** 馆前广场的人流：剪影小人成组摆放。身高约 2 米（只比真人略放大），和滨河路上的车比例协调；靠人多来表现“人来人往” */
const CROWD: [number, number][] = [[-70, 95], [-40, 120], [10, 110], [55, 95], [-95, 60], [30, 160], [70, 205], [-20, -105], [20, -135], [70, -150], [110, 330], [150, 360], [-10, 205], [95, 130]];
export const Crowd: React.FC<{ k: number }> = ({ k }) => {
  const people = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const poses: Pose[] = ["walk", "stand", "walk", "child", "stand", "walk"];
    let n = 0;
    CROWD.forEach(([cx, cz], gi) => {
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2 * 1.7 + gi, r = 2 + ((gi * 7 + j * 5) % 11);
        const p = makePerson({ pose: poses[(gi + j) % poses.length], x: cx + Math.cos(a) * r, y: cz + 17.9 + Math.sin(a) * r, outfit: n++ % 5, zone: "plaza" }, 4.5, 21);
        p.sprite.scale.multiplyScalar(0.78); p.shadow.scale.multiplyScalar(0.9);
        out.push(p.sprite, p.shadow);
      }
    });
    return out;
  }, []);
  people.forEach((o) => { const m = (o as THREE.Mesh).material as THREE.Material & { opacity: number }; if (o instanceof THREE.Sprite) m.opacity = k; else m.opacity = 0.16 * k; o.visible = k > 0.01; });
  return <>{people.map((o, i) => <primitive key={i} object={o} />)}</>;
};

// 先从楼说起：机位放在正北、朝正南看，其余楼栋的北面正对镜头、偏暗；1、2号楼斜着，背面朝东北。说到“东北向”时清晨的太阳从东北照来，
// 配音停 2.6 秒，看着2号楼背面慢慢亮起来（其余楼的北面只被斜光擦到）。
// 然后从楼顶往外看：先是汾河，再推到五大馆前的人流。
const B02C: XZ = [204.87, 780.75];
const O5K0: CamSpec = { t: [B02C[0] + 30, 30, B02C[1] + 60], az: 0, el: 34, D: 620, span: 330, sy: 620 }; // 抬高看得到屋顶：正南正北楼的屋顶和画面横平竖直，1、2号楼的屋顶是斜的
const O5K1: CamSpec = { t: [B02C[0] + 15, 34, B02C[1] + 40], az: 0, el: 30, D: 540, span: 290, sy: 620 };
const O5K2: CamSpec = { t: [420, 0, 440], az: 212, el: 14, D: 480, span: 400, sy: 560 }; // 站在2号楼楼顶往东北看汾河
const dirAt = (p: XZ, bearing: number, d: number): XZ => { const r = (bearing * Math.PI) / 180; return [p[0] + Math.sin(r) * d, p[1] - Math.cos(r) * d]; };
export const O5: React.FC = () => {
  const t = useT(), len = shotById("O5").len;
  const ta = kw("O5", "这个角度"), tn = kw("O5", "东北向"), tm = kw("O5", "清晨"), tf = kw("O5", "汾河"), tv = kw("O5", "五大馆");
  const t1 = tm - 0.2, t2 = tv - 0.7;
  const spec = t < t1 ? lerpCam(O5K0, O5K1, pr(t, 0, t1)) : t < t2 ? lerpCam(O5K1, O5K2, pr(t, t1, t2 - t1)) : lerpCam(O5K2, B2K1, pr(t, t2, len - t2 - 0.2));
  const kv = pr(t, tv - 0.6, 0.8);
  const morning = pr(t, tn - 0.4, 3.6);
  const kArr = pr(t, ta - 0.2, 0.7) * (1 - pr(t, t1 - 0.2, 0.4));
  return (
    <PerspShot spec={spec} st={{ facade: 1, hero: 1, ring: 0, fog: [1600, 7000], box: 900, lt: t < t1 ? [B02C[0], 40, B02C[1]] : [500, 0, 400], morning, hi2: 1 - pr(t, t1 - 0.3, 0.5) }} extra={<Crowd k={kv} />}>
      {(s) => {
        const rot = 37.7 * ease(clamp((t - (tn - 0.4)) / 1.0));
        return (
          <>
            {/* 清晨暖光 */}
            <AbsoluteFill style={{ background: "linear-gradient(200deg, rgba(255,206,140,.32) 0%, rgba(255,206,140,0) 55%)", opacity: morning }} />
            <BuildingTag at={s(B02C, 100)} label="2号楼" k={pr(t, 0.3, 0.5) * (1 - pr(t, t1 - 0.3, 0.4))} />
            {/* 右上角小平面：常规楼背面朝正北 → 2号楼背面朝东北 */}
            <div style={{ position: "absolute", right: 96, top: 120, width: 330, height: 300, background: "rgba(243,240,234,.94)", boxShadow: "0 8px 24px rgba(60,45,30,.14)", opacity: kArr, fontFamily: SANS }}>
              <svg width={330} height={300}>
                <defs><marker id="o5a" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto"><path d="M0,1 L16,8 L0,15 z" fill={rot > 2 ? P.hero : "#8F867A"} /></marker></defs>
                <text x={165} y={30} textAnchor="middle" fontSize={18} fill={P.ink2}>北</text>
                <line x1={165} y1={38} x2={165} y2={56} stroke={P.ink2} strokeWidth={2} />
                <g transform={`translate(165 175) rotate(${rot})`}>
                  <rect x={-62} y={-17} width={124} height={34} rx={3} fill={rot > 2 ? P.hero : "#CFC8BC"} opacity={0.9} />
                  <line x1={0} y1={-20} x2={0} y2={-88} stroke={rot > 2 ? P.hero : "#8F867A"} strokeWidth={4} markerEnd="url(#o5a)" />
                </g>
                {rot > 2 ? <line x1={165} y1={155} x2={165} y2={90} stroke="#8F867A" strokeWidth={2} strokeDasharray="5 5" opacity={0.8} /> : null}
                <text x={165} y={240} textAnchor="middle" fontSize={20} fontWeight={600} fill={rot > 2 ? P.hero : P.ink2}>{rot > 2 ? "2号楼的背面：东北" : "常规楼栋的背面：正北"}</text>
                <text x={165} y={268} textAnchor="middle" fontSize={17} fill={P.ink2}>{rot > 2 ? "清晨的太阳能照进来" : "全年少有直射"}</text>
              </svg>
            </div>
            <Callout band at={s(dirAt(B02C, 37.7, 9), 70)} k={pr(t, tn + 1.4, 0.6) * (1 - pr(t, t1 - 0.2, 0.4))} title="阴面，变成了东北向" sub="清晨的太阳，正照着这一面" color={P.hero} />
            <Callout band at={s([520, 560], 1)} k={pr(t, tm - 0.1, 0.5) * (1 - pr(t, tv - 0.4, 0.4))} title="夏日清晨，迎着阳光" sub="看汾河流淌" color={P.waterInk} />
            <Callout band at={s([-4, 1], 40)} k={kv} title="五大馆前，人来人往" color={P.waterInk} />
            <Footnote text="示意画面 · 日照按太原纬度与楼栋朝向推算：夏季上午东北面有直射，未计周边遮挡；人物为示意" />
            {void tf}
          </>
        );
      }}
    </PerspShot>
  );
};
