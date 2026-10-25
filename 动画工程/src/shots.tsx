// 24个镜头（M2 模型粗片）：三维用建模交付的真实模型，品质画面用甲方效果图和样板间实景。
import React from "react";
import { AbsoluteFill } from "remotion";
import * as THREE from "three";
import { C, clamp, ease, lerp, mixColor, prog } from "./lib";
import { useT } from "./lib";
import { City, Line, Parks, Platform, Ruifu, SceneM, SitePlan, Terrain, Unit, Venues, Water, useWorld, PLATFORM_H } from "./world";
import { Inset, Note, Still } from "./stills";

export type ShotProps = { len: number; beats: Record<string, number[]> };
const SERIF = '"Songti SC", "STSong", serif';
const SANS = '"PingFang SC", "Hiragino Sans GB", sans-serif';
type V3 = [number, number, number];
type XZ = [number, number];
const L3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// 配色
const K = {
  darkBg: "#0d1013", darkGround: "#1b1f24", wheat: "#4a3d22", darkCity: "#4a525b", darkWater: "#1f6f96", darkPlatform: "#59616a",
  creamBg: "#efeae1", creamGround: "#e9e4da", creamCity: "#f4f1ea", creamWater: "#8cc6df", creamPark: "#c9d9bd", hero: "#f3dcb4",
};

// ---------- 通用小件 ----------
const StepTag: React.FC<{ n: number; title: string; t: number }> = ({ n, title, t }) => (
  <div style={{ position: "absolute", left: 96, bottom: 190, color: "#fff", opacity: prog(t, 0.2, 0.8), fontFamily: SANS }}>
    <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: 2 }}>STEP {n}</div>
    <div style={{ fontSize: 34, marginTop: 6, fontFamily: SERIF }}>{title}</div>
  </div>
);
const Tag: React.FC<{ text: string; k: number; color?: string; dark?: boolean }> = ({ text, k, color = C.gold, dark = true }) => (
  <div style={{ opacity: k, transform: `translateY(${(1 - k) * 12}px)`, display: "flex", alignItems: "center", gap: 12, fontFamily: SANS, whiteSpace: "nowrap", height: 44, marginBottom: 14 }}>
    <div style={{ width: 14, height: 14, borderRadius: 7, background: color, boxShadow: `0 0 16px ${color}` }} />
    <div style={{ fontSize: 34, fontWeight: 600, color: dark ? "#fff" : "#2a2622", textShadow: dark ? "0 2px 8px rgba(0,0,0,.6)" : "0 1px 6px rgba(255,255,255,.8)" }}>{text}</div>
  </div>
);
const Card: React.FC<{ title: string; sub?: string; k: number; light?: boolean }> = ({ title, sub, k, light }) => (
  <div style={{ position: "absolute", left: 96, top: 90, opacity: k, transform: `translateY(${(1 - k) * 16}px)`, fontFamily: SERIF, color: light ? "#fff" : "#2c2a26", textShadow: light ? "0 2px 12px rgba(0,0,0,.6)" : "none" }}>
    <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: 6, color: light ? "#e9dcc6" : "#8a7f70" }}>TAIYUAN RUIFU</div>
    <div style={{ fontSize: 64, fontWeight: 700, marginTop: 6 }}>{title}</div>
    {sub ? <div style={{ fontSize: 30, marginTop: 10, color: light ? "#f1e8da" : "#5e564c" }}>{sub}</div> : null}
  </div>
);
const Big: React.FC<{ text: string; k: number; color?: string; size?: number; top?: number }> = ({ text, k, color = "#fff", size = 96, top = 430 }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center", fontFamily: SERIF, fontWeight: 700, fontSize: size, color, opacity: k, letterSpacing: 8, textShadow: "0 4px 24px rgba(0,0,0,.45)" }}>{text}</div>
);
const Draw: React.FC<{ d: string; k: number; color?: string; w?: number }> = ({ d, k, color = C.gold, w = 3 }) => (
  <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - clamp(k)} />
);
const Fade: React.FC<{ k: number; children: React.ReactNode }> = ({ k, children }) => (k > 0.001 ? <AbsoluteFill style={{ opacity: clamp(k) }}>{children}</AbsoluteFill> : null);

/** 暗场城市底盘：地形、汾河、内河、城市、平台、五馆 */
const DarkWorld: React.FC<{ ground?: string; city?: number; lit?: number; inner?: number; rise?: number; venues?: number[]; venueGlow?: number; showPlatform?: boolean }> = ({
  ground = K.darkGround, city = 1, lit = 0.6, inner = 1, rise = 1, venues = [1, 1, 1, 1, 1], venueGlow = 0.15, showPlatform = true,
}) => (
  <group>
    <Terrain color={ground} />
    <Water color={K.darkWater} reveal={inner} emissive={0.25} />
    {city > 0.001 ? <City color={K.darkCity} grow={city} lit={lit} /> : null}
    {showPlatform ? <Platform rise={rise} color={K.darkPlatform} /> : null}
    <Venues grow={venues} color="#d9b46a" emissive={venueGlow} rise={rise} />
  </group>
);
/** 奶白城市底盘 */
const CreamWorld: React.FC<{ bright: number; ruifu?: React.ReactNode; parksGlow?: number }> = ({ bright, ruifu, parksGlow = 0 }) => (
  <group>
    <Terrain color={mixColor(K.darkGround, K.creamGround, bright)} />
    <Water color={mixColor(K.darkWater, K.creamWater, bright)} emissive={0.15 * (1 - bright)} />
    <Parks color={mixColor("#26342a", K.creamPark, bright)} emissive={parksGlow} />
    <City color={mixColor(K.darkCity, K.creamCity, bright)} lit={0.6 * (1 - bright)} />
    <Platform rise={1} color={mixColor(K.darkPlatform, "#fbfaf6", bright)} />
    <Venues color={mixColor("#d9b46a", "#ffffff", bright)} emissive={0.15 * (1 - bright)} />
    {ruifu}
  </group>
);

// ================= 开场 =================
export const S1: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const back = prog(t, 1.0, 4.6); // 倒带：楼群缩回地面，岛和内河一起退去
  const cam = L3([-2700, 1750, 3500], [-2300, 1450, 3000], t / len);
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={cam} look={[w.islandC[0] + 200, 0, w.islandC[1] + 300]} dark={1} ao={30}>
        <DarkWorld ground={mixColor(K.darkGround, K.wheat, back)} city={1 - back} lit={lerp(0.9, 0.2, back)} inner={1 - prog(t, 2.6, 4.4)} rise={1 - prog(t, 2.2, 4.0)} venues={Array(5).fill(1 - prog(t, 1.8, 3.4))} showPlatform={back < 0.98} />
      </SceneM>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.3 * Math.sin(Math.PI * clamp((t - 1) / 3.6))})` }} />
    </AbsoluteFill>
  );
};

// ================= 一张画 =================
const PORTRAIT = [
  "M960 250 C 870 250 820 330 822 420 C 824 520 870 590 960 600 C 1050 590 1096 520 1098 420 C 1100 330 1050 250 960 250",
  "M830 380 C 850 300 900 270 960 268 C 1030 268 1080 300 1092 372",
  "M900 430 L 940 430 M 980 430 L 1020 430",
  "M960 440 L 952 500 L 970 504",
  "M925 540 C 945 552 975 552 995 540",
  "M880 600 C 860 650 760 680 700 760 M1040 600 C 1060 650 1160 680 1220 760",
];
export const S2: React.FC<ShotProps> = () => {
  const t = useT();
  const z = 1 + 0.05 * (t / 6);
  return (
    <AbsoluteFill style={{ background: K.darkBg }}>
      <svg viewBox="0 0 1920 1080" style={{ transform: `scale(${z})` }}>
        {PORTRAIT.map((d, i) => <Draw key={i} d={d} k={prog(t, 0.2 + i * 0.45, 1.4 + i * 0.45)} />)}
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 800, textAlign: "center", fontFamily: SERIF, color: C.gold, opacity: prog(t, 3.2, 4.0) }}>
        <div style={{ fontSize: 44, letterSpacing: 6 }}>让-马里·夏邦杰</div>
        <div style={{ fontSize: 26, marginTop: 8, letterSpacing: 4, color: C.goldSoft }}>Jean-Marie Charpentier　1939–2010</div>
      </div>
    </AbsoluteFill>
  );
};
export const S3: React.FC<ShotProps> = () => {
  const t = useT();
  const out = 1 - prog(t, 0.0, 1.2);
  const theatre = [
    "M560 700 L 1360 700 L 1360 560 L 560 560 Z",
    "M500 560 C 700 470 1220 470 1420 560",
    "M470 520 C 700 400 1220 400 1450 520 L 1420 560 M 470 520 L 500 560",
    "M640 700 L 640 560 M 800 700 L 800 560 M 960 700 L 960 560 M 1120 700 L 1120 560 M 1280 700 L 1280 560",
    "M420 760 L 1500 760",
  ];
  return (
    <AbsoluteFill style={{ background: K.darkBg }}>
      <svg viewBox="0 0 1920 1080" style={{ opacity: out }}>{PORTRAIT.map((d, i) => <Draw key={i} d={d} k={1} />)}</svg>
      <svg viewBox="0 0 1920 1080">{theatre.map((d, i) => <Draw key={i} d={d} k={prog(t, 0.6 + i * 0.35, 2.0 + i * 0.35)} />)}</svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 800, textAlign: "center", fontFamily: SERIF, fontSize: 40, color: C.gold, letterSpacing: 6, opacity: prog(t, 2.4, 3.2) }}>上海大剧院</div>
    </AbsoluteFill>
  );
};
export const S4: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const cam = L3([cx - 1300, 1600, cz + 2000], [cx - 900, 1150, cz + 1450], t / len);
  const near = w.roads.filter((r) => r.pts.some(([x, z]) => Math.hypot(x - cx, z - cz) < 2600));
  const ring = [...w.island, w.island[0]] as XZ[];
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={cam} look={[cx, 0, cz]} dark={1} ao={0}>
        <Terrain color={K.wheat} />
        <Water color="#24485a" reveal={0} />
        {near.map((r, i) => <Line key={i} pts={r.pts} k={prog(t, 0.6 + (i % 12) * 0.28, 2.2 + (i % 12) * 0.28)} color={C.gold} width={r.cls === "trunk" ? 10 : 7} y={-0.9} opacity={0.7} />)}
        <Line pts={ring} k={prog(t, 4.8, 8.0)} color="#ffe2a6" width={16} y={-0.8} />
      </SceneM>
      <Big text="造一座岛" k={prog(t, 8.2, 9.0)} color={C.gold} size={84} top={150} />
    </AbsoluteFill>
  );
};

// ================= 一座岛 =================
export const S5: React.FC<ShotProps> = () => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(#6f6a62, #2b2a28)" }}>
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{ position: "absolute", left: `${(i * 137) % 100 - 20}%`, top: `${30 + ((i * 53) % 60)}%`, width: 900, height: 260, borderRadius: "50%",
          background: "radial-gradient(rgba(255,255,255,.55), rgba(255,255,255,0) 70%)", transform: `translateX(${-t * (20 + i * 3)}px)`, filter: "blur(8px)" }} />
      ))}
      <Big text="一座岛，要怎么造？" k={prog(t, 0.4, 1.2)} size={92} top={460} />
    </AbsoluteFill>
  );
};
export const S6: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const cam = L3([cx - 1000, 950, cz + 1350], [cx - 760, 720, cz + 1050], t / len);
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={cam} look={[cx, 0, cz]} dark={1} ao={0}>
        <Terrain color={K.darkGround} />
        <Water color={K.darkWater} reveal={prog(t, 0.8, 5.0)} emissive={0.6} />
        <Line pts={[...w.island, w.island[0]] as XZ[]} k={1} color="#ffe2a6" width={8} y={-0.8} opacity={1 - prog(t, 0.8, 5)} />
      </SceneM>
      <StepTag n={1} title="引水成岛" t={t} />
    </AbsoluteFill>
  );
};
export const S7: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const side = ease(prog(t, 3.0, 6.0));
  const cam = L3([cx - 760, 720, cz + 1050], [cx - 430, 42, cz + 160], side);
  const look: V3 = [cx - 120, lerp(0, 4, side), cz];
  const rise = prog(t, 0.8, 3.0);
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={cam} look={look} dark={1} ao={side > 0.5 ? 6 : 0} shadowBox={900}>
        <Terrain color={K.darkGround} />
        <Water color={K.darkWater} emissive={0.4} />
        <Platform rise={rise} color={K.darkPlatform} opacity={lerp(1, 0.55, prog(t, 4.0, 5.5))} />
        {/* 剖开后看到平台下的车流（示意） */}
        {side > 0.4 ? [0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[cx - 220 + i * 8, GROUND_CAR_Y, cz - 400 + ((t * 60 + i * 140) % 800)]}>
            <boxGeometry args={[2.2, 1.4, 5]} />
            <meshBasicMaterial color="#ffd38a" toneMapped={false} />
          </mesh>
        )) : null}
      </SceneM>
      <StepTag n={2} title="抬高平台 · 下层走车 · 上层走人" t={t} />
    </AbsoluteFill>
  );
};
const GROUND_CAR_Y = 0.2;
export const S8: React.FC<ShotProps> = ({ len, beats }) => {
  const t = useT();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const a = lerp(-0.9, 0.35, t / len);
  const cam: V3 = [cx + Math.sin(a) * 900, 430, cz + Math.cos(a) * 900];
  const times = beats.thud ?? [1, 2, 3, 4, 5];
  // 五馆顺序：大剧院、图书馆、美术馆、科技馆、博物馆（与 venue_meta 一致）
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={cam} look={[cx, 10, cz]} dark={1} ao={20} shadowBox={900}>
        <DarkWorld city={0} venues={times.map((b) => ease(prog(t, b - 0.8, b)))} venueGlow={0.25} />
        {w.venues.map((v, i) => {
          const h = 260 * prog(t, times[i], times[i] + 0.5) * (1 - prog(t, times[i] + 1.2, times[i] + 2));
          return h > 0.5 ? (
            <mesh key={i} position={[v.anchor[0], PLATFORM_H + h / 2, v.anchor[1]]}>
              <boxGeometry args={[3, h, 3]} />
              <meshBasicMaterial color="#ffe2a6" toneMapped={false} />
            </mesh>
          ) : null;
        })}
      </SceneM>
      <StepTag n={3} title="五馆拔地而起" t={t} />
      <div style={{ position: "absolute", right: 96, bottom: 200, textAlign: "right" }}>
        {w.venues.map((v, i) => <div key={i} style={{ fontFamily: SERIF, fontSize: 34, color: "#fff", opacity: prog(t, times[i], times[i] + 0.4), marginTop: 6 }}>{v.name}</div>)}
      </div>
    </AbsoluteFill>
  );
};
export const S9: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const a = lerp(0.35, 0.8, t / len);
  const cam: V3 = [cx + Math.sin(a) * 820, 380, cz + Math.cos(a) * 820];
  const x = prog(t, 2.8, 4.2);
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={cam} look={[cx, 10, cz]} dark={1} ao={20} shadowBox={900}>
        <DarkWorld city={0.35} lit={0.8} venueGlow={0.35} />
      </SceneM>
      <Fade k={x}>
        <Still src="c03.jpg" aspect={1.69} from={{ x: 0.62, y: 0.42, z: 1.35 }} to={{ x: 0.6, y: 0.45, z: 1.15 }} k={prog(t, 2.8, len)} />
        <Note kind="render" />
      </Fade>
    </AbsoluteFill>
  );
};
export const S10: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const k = ease(t / len);
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={L3([cx - 900, 700, cz + 1100], [cx - 2300, 2000, cz + 2900], k)} look={[cx, 0, cz]} dark={1} ao={25}>
        <DarkWorld city={prog(t, 0.4, len - 0.6)} lit={0.85} venueGlow={0.3} />
      </SceneM>
    </AbsoluteFill>
  );
};

// ================= 转身 =================
const RUIFU_LOOK: V3 = [210, 30, 1050];
export const S11: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const k = ease(prog(t, 0.3, 2.6));
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={L3([-900, 1500, 2300], [-700, 1250, 2000], t / len)} look={[60, 0, 1000]} dark={1} ao={25}>
        <DarkWorld lit={0.7} />
        <SitePlan lift={lerp(1400, 2, k)} spin={lerp(-1.4, 0, k)} opacity={0.92 * prog(t, 0.1, 0.5)} />
      </SceneM>
    </AbsoluteFill>
  );
};
export const S12: React.FC<ShotProps> = ({ len, beats }) => {
  const t = useT();
  const bright = prog(t, 0.2, 1.4);
  const times = beats.thud ?? [1.6, 2.2, 2.8, 3.4, 4];
  return (
    <AbsoluteFill>
      <SceneM bg={mixColor(K.darkBg, K.creamBg, bright)} cam={L3([-760, 560, 1800], [-640, 480, 1640], t / len)} look={RUIFU_LOOK} dark={1 - bright} ao={18} shadowBox={900}>
        <CreamWorld bright={bright} ruifu={<Ruifu turn={0} color="#ffffff" hero={K.hero} grow={(i) => { const b = times[Math.min(4, Math.floor(i / 6))]; return ease(prog(t, b - 0.5, b)); }} />} />
      </SceneM>
    </AbsoluteFill>
  );
};
export const S13: React.FC<ShotProps> = ({ len, beats }) => {
  const t = useT();
  const at = beats.click?.[0] ?? 1.3;
  const turn = ease(prog(t, at, at + 1.6));
  const x = prog(t, len - 1.4, len - 0.3);
  return (
    <AbsoluteFill>
      <SceneM bg={K.creamBg} cam={L3([150, 720, 1010], [168, 560, 930], t / len)} look={[176, 0, 770]} dark={0} ao={10} shadowBox={500} fov={32}>
        <CreamWorld bright={1} ruifu={<Ruifu turn={turn} color="#ffffff" hero={K.hero} />} />
      </SceneM>
      <Fade k={x}>
        <Still src="c04.jpg" aspect={1.6} from={{ x: 0.45, y: 0.35, z: 1.6 }} to={{ x: 0.45, y: 0.36, z: 1.5 }} k={prog(t, len - 1.4, len)} />
        <Note kind="render" />
      </Fade>
    </AbsoluteFill>
  );
};
/** 2号楼射出的扇形视线（world 坐标，扇心在楼顶附近） */
const Fan: React.FC<{ at: XZ; bearing: number; spread: number; R: number; k: number }> = ({ at, bearing, spread, R, k }) => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (let i = 0; i <= 32; i++) {
    const a = ((bearing - spread / 2 + (spread * i) / 32) * Math.PI) / 180;
    s.lineTo(Math.sin(a) * R, Math.cos(a) * R);
  }
  s.lineTo(0, 0);
  return k > 0.01 ? (
    <mesh position={[at[0], 70, at[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[s]} />
      <meshBasicMaterial color="#e6a640" transparent opacity={0.45 * k} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  ) : null;
};
export const S14: React.FC<ShotProps> = ({ len, beats }) => {
  const t = useT();
  const w = useWorld();
  const times = beats.chime ?? [2.6, 4.6, 6.2, 8, 9.4];
  const B = [209, 282, 218, 350, 89]; // 和园、谐园、晋阳湖方向、五大馆、汾河（实测方位角）
  // 扇形方向依次扫向每个景
  let bearing = B[0];
  for (let i = 0; i < B.length; i++) if (t > times[i] - 0.9) bearing = i === 0 ? B[0] : lerp(B[i - 1] + (B[i] - B[i - 1] > 180 ? 360 : B[i] - B[i - 1] < -180 ? -360 : 0), B[i], ease(prog(t, times[i] - 0.9, times[i])));
  const lit = (i: number) => prog(t, times[i] - 0.2, times[i] + 0.3);
  const [ax, az] = w.b02.anchor;
  // 先从楼背后越肩看前方（西南），视线转到“身后”时，镜头绕到楼前回看东北
  const back: XZ = [0.611, -0.791], front: XZ = [-0.611, 0.791];
  const swing = ease(prog(t, times[2] + 0.6, times[3] - 0.1));
  const camA: V3 = [ax + back[0] * 650, 470, az + back[1] * 650], lookA: V3 = [ax + front[0] * 650, 0, az + front[1] * 650];
  const camB: V3 = [ax + front[0] * 720, 520, az + front[1] * 720], lookB: V3 = [ax + back[0] * 520, 0, az + back[1] * 520];
  return (
    <AbsoluteFill>
      <SceneM bg={K.creamBg} cam={L3(camA, camB, swing)} look={L3(lookA, lookB, swing)} dark={0} ao={15} shadowBox={1400}>
        <CreamWorld bright={1} ruifu={<Ruifu turn={1} color="#ffffff" hero={K.hero} />} />
        <Parks color={C.green} only={["way/996055599"]} opacity={0.9 * lit(0)} emissive={0.5} />
        <Parks color={C.green} only={["way/996055600"]} opacity={0.9 * lit(1)} emissive={0.5} />
        <Venues color="#f4d48e" emissive={0.6 * lit(3)} />
        <Water color={C.water} emissive={0.4 * lit(4)} />
        <Fan at={[ax, az]} bearing={bearing} spread={30} R={1000} k={prog(t, 0.4, 1.2)} />
      </SceneM>
      <div style={{ position: "absolute", left: 96, top: 110 }}>
        {["和园", "谐园", "晋阳湖方向", "五大馆", "汾河"].map((n, i) => <Tag key={i} text={n} k={lit(i)} color={[C.green, C.green, C.blue, C.gold, C.blue][i]} dark={false} />)}
      </div>
      <Inset src="c09.jpg" title="前面 · 园" k={lit(0) * (1 - prog(t, times[2] + 0.6, times[2] + 1.2))} x={1290} y={110} />
      <Inset src="c08.jpg" title="身后 · 五大馆" k={lit(3) * (1 - prog(t, times[4] - 0.3, times[4] + 0.3))} x={1290} y={110} />
      <Inset src="c10.jpg" title="身后 · 汾河" k={lit(4)} x={1290} y={110} />
    </AbsoluteFill>
  );
};
export const S15: React.FC<ShotProps> = () => {
  const t = useT();
  const k = prog(t, 0.2, 2.2);
  const join = prog(t, 3.5, 5.2);
  return (
    <AbsoluteFill style={{ background: K.darkBg }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 960, height: 1080, background: "#14171b" }}>
        <svg viewBox="0 0 960 1080">
          <Draw d="M480 300 m -200 0 a 200 200 0 1 0 400 0 a 200 200 0 1 0 -400 0" k={k} w={4} />
          {[0, 1, 2, 3].map((i) => <Draw key={i} d={`M${180 + i * 200} 120 L ${180 + i * 200} 900`} k={k} w={1.5} color={C.goldSoft} />)}
        </svg>
        <div style={{ position: "absolute", top: 860, width: "100%", textAlign: "center", color: C.gold, fontFamily: SERIF, fontSize: 34 }}>二十多年前</div>
      </div>
      <div style={{ position: "absolute", left: 960, top: 0, width: 960, height: 1080, background: C.cream }}>
        <svg viewBox="0 0 960 1080">
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(${380 + i * 200} ${420}) rotate(${-37 * k})`}>
              <rect x="-60" y="-26" width="120" height="52" fill="#fff" stroke="#9a8f80" strokeWidth="3" />
            </g>
          ))}
          {[0, 1, 2].map((i) => <rect key={i} x={300 + i * 140} y={560} width="120" height="52" fill="#fff" stroke="#c9c0b2" strokeWidth="2" />)}
        </svg>
        <div style={{ position: "absolute", top: 860, width: "100%", textAlign: "center", color: "#5e564c", fontFamily: SERIF, fontSize: 34 }}>二十多年后</div>
      </div>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}><Draw d="M680 300 C 900 300 1100 420 1340 420" k={join} w={3} /></svg>
    </AbsoluteFill>
  );
};

// ================= 最后两栋 =================
export const S16: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const [ax, az] = w.b02.anchor;
  const a = lerp(0.2, 1.1, t / len);
  const cam: V3 = [ax - 30 + Math.sin(a) * 520, 190, az - 20 + Math.cos(a) * 520];
  const d = prog(t, 0.0, 1.0);
  const x = prog(t, len - 2.4, len - 1.2);
  return (
    <AbsoluteFill>
      <SceneM bg={mixColor(K.creamBg, "#0b0c0e", d)} cam={cam} look={[ax - 30, 45, az - 20]} dark={d} ao={8} warm={1} shadowBox={500}>
        <Terrain color={mixColor(K.creamGround, "#121417", d)} />
        <Water color={mixColor(K.creamWater, "#173a4c", d)} />
        <City color={mixColor(K.creamCity, "#23272c", d)} lit={0.25 * d} />
        <Ruifu turn={1} color="#ffffff" hero="#f6d9a6" heroGlow={0.9 * d} othersOpacity={1 - d} />
      </SceneM>
      <div style={{ position: "absolute", right: 120, top: 330, textAlign: "right", fontFamily: SERIF, color: "#f3d7a6", opacity: 1 - x }}>
        {["约355㎡", "独占一个单元", "两梯一户"].map((s, i) => <div key={i} style={{ fontSize: 46, marginBottom: 22, opacity: prog(t, 1.5 + i * 0.6, 2.1 + i * 0.6) }}>{s}</div>)}
      </div>
      <Fade k={x}>
        <Still src="c01.jpg" aspect={1.6} from={{ x: 0.4, y: 0.25, z: 1.7 }} to={{ x: 0.4, y: 0.26, z: 1.45 }} k={prog(t, len - 2.4, len)} />
        <Note kind="render" />
      </Fade>
    </AbsoluteFill>
  );
};
export const S17: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const sweep = prog(t, 0.4, 4.2); // 暖光从下往上扫过立面，示意窗一扇扇亮起
  return (
    <AbsoluteFill style={{ background: "#0b0c0e" }}>
      <Still src="c10.jpg" aspect={1.78} from={{ x: 0.5, y: 0.45, z: 1.05 }} to={{ x: 0.52, y: 0.42, z: 1.18 }} k={t / len} />
      <AbsoluteFill style={{ background: `linear-gradient(to top, rgba(255,190,110,0) ${lerp(100, -30, sweep) - 30}%, rgba(255,190,110,.28) ${lerp(100, -30, sweep)}%, rgba(255,190,110,0) ${lerp(100, -30, sweep) + 30}%)`, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: `rgba(10,12,16,${0.45 * prog(t, 4.2, 5.0)})` }} />
      <Note kind="render" />
      <Big text="豪宅比的，是窗外" k={prog(t, 4.6, 5.4)} color="#f3d7a6" size={84} top={470} />
    </AbsoluteFill>
  );
};
export const S18: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const push = Math.pow(prog(t, 0.3, len - 0.6), 1.6);
  const x = prog(t, len - 1.2, len - 0.2);
  return (
    <AbsoluteFill style={{ background: "#0b0c0e" }}>
      <Still src="c10.jpg" aspect={1.78} from={{ x: 0.52, y: 0.42, z: 1.18 }} to={{ x: 0.6, y: 0.56, z: 5 }} k={push} blur={10 * prog(t, len - 1.6, len - 0.6)} />
      <Note kind="render" k={1 - x} />
      <Fade k={x}>
        <Still src="c15.jpg" aspect={1.5} from={{ x: 0.55, y: 0.5, z: 1.4 }} to={{ x: 0.55, y: 0.5, z: 1.3 }} k={x} blur={6 * (1 - x)} />
        <Note kind="sample" />
      </Fade>
    </AbsoluteFill>
  );
};

// ================= 一户两条线 =================
const UC: V3 = [11.4, 0, -8.95]; // 户型中心（局部坐标）
const UnitScene: React.FC<{ cam: V3; look: V3; fov?: number; dusk?: number; children?: React.ReactNode }> = ({ cam, look, fov = 36, dusk = 0, children }) => (
  <SceneM bg={mixColor(K.creamBg, "#d9d4cf", dusk)} cam={cam} look={look} fov={fov} dark={0} ao={0.9} shadowBox={22} warm={dusk * 0.4} sun={1 - 0.25 * dusk} fog={[400, 900]}>
    <Unit />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[UC[0], -2.4, UC[2]]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <shadowMaterial opacity={0.12} />
    </mesh>
    {children}
  </SceneM>
);
export const S19: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const a = lerp(-0.7, -0.25, t / len);
  const cam: V3 = [UC[0] + Math.sin(a) * 30, 27, UC[2] + Math.cos(a) * 30];
  const lift = lerp(-6, 0, ease(prog(t, 0, 1.6)));
  const v = w.routes.vertical, h = w.routes.horizontal;
  return (
    <AbsoluteFill>
      <UnitScene cam={cam} look={UC}>
        <group position={[0, lift, 0]}>
          <Line pts={v} k={prog(t, 2.0, 3.6)} color={C.gold} width={0.28} y={0.08} />
          <Line pts={h.slice(2)} k={prog(t, 3.4, 5.0)} color="#c9875a" width={0.28} y={0.08} />
        </group>
      </UnitScene>
      <Fade k={1 - prog(t, 0, 0.9)}>
        <Still src="c15.jpg" aspect={1.5} from={{ x: 0.55, y: 0.5, z: 1.3 }} to={{ x: 0.55, y: 0.5, z: 1.28 }} k={0} />
      </Fade>
    </AbsoluteFill>
  );
};
export const S20: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const v = w.routes.vertical; // 客厅南窗 → 餐厅 → 茶区北窗
  const k = prog(t, 0.6, len - 0.6);
  const zc = lerp(v[0][1], v[v.length - 1][1], k);
  const cam: V3 = [v[0][0] - 2.5, lerp(10, 8, k), zc + 8.5];
  const dusk = prog(t, 4.5, len - 1);
  const node = (z: number) => { const at = 0.6 + (len - 1.2) * ((v[0][1] - z) / (v[0][1] - v[v.length - 1][1])); return prog(t, at - 0.4, at + 0.4); };
  const nLiving = node(-4.0), nDining = node(v[1][1]), nTea = node(v[v.length - 1][1] + 0.6);
  const photo = prog(t, 1.4, 2.0) * (1 - prog(t, 3.6, 4.2)); // 客厅节点叠化成样板间实景
  return (
    <AbsoluteFill>
      <UnitScene cam={cam} look={[v[0][0], 0, zc - 4]} fov={44} dusk={dusk}>
        <Line pts={v} k={1} color={C.gold} width={0.28} y={0.08} />
      </UnitScene>
      <Card title="下午 · 客厅" sub="南窗外是园子" k={nLiving * (1 - clamp(nDining * 3)) * (1 - photo)} />
      <Card title="傍晚 · 餐厅" sub="一张圆桌，两面风景" k={clamp((nDining - 0.34) * 1.5) * (1 - clamp(nTea * 3))} />
      <Card title="入夜 · 茶区" sub="北窗外是城和河" k={clamp((nTea - 0.34) * 1.5)} />
      <Fade k={photo}>
        <Still src="c15.jpg" aspect={1.5} from={{ x: 0.5, y: 0.5, z: 1.25 }} to={{ x: 0.56, y: 0.5, z: 1.12 }} k={prog(t, 1.4, 4.2)} />
        <Note kind="sample" />
        <Card title="下午 · 客厅" sub="南窗外是园子" k={1} light />
      </Fade>
    </AbsoluteFill>
  );
};
export const S21: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const h = w.routes.horizontal; // 入户 → 玄关 → 走廊 → 主卧 → 衣帽间 → 主卫
  const entry = h[2];
  const eastPts: XZ[] = [entry, [13.5, entry[1]], [16.3, -5.0]];
  const westPts = h.slice(2);
  const east = prog(t, 0.8, 2.6), west = prog(t, 2.2, 4.6);
  const follow = ease(prog(t, 5.0, len - 0.6));
  const p13 = prog(t, 0.2, 0.8) * (1 - prog(t, 1.6, 2.2)); // 玄关实景
  const p12 = prog(t, len - 3.4, len - 2.8) * (1 - prog(t, len - 1.0, len - 0.4)); // 主卧实景
  return (
    <AbsoluteFill>
      <UnitScene cam={L3([entry[0] + 2, 22, entry[1] + 14], [5.5, 11, -2.5], follow)} look={L3([entry[0], 0, entry[1]], [3.2, 0, -8.5], follow)} fov={44}>
        <Line pts={eastPts} k={east} color="#e0955a" width={0.3} y={0.08} />
        <Line pts={westPts} k={west} color="#8f7ac4" width={0.3} y={0.08} />
      </UnitScene>
      <Card title="东 · 聚" sub="一家人的热闹" k={east * (1 - clamp(west * 3)) * (1 - p13)} />
      <Card title="西 · 私" sub="主卧 · 衣帽间 · 主卫" k={clamp((west - 0.34) * 1.5) * (1 - p12)} />
      <Fade k={p13}>
        <Still src="c13.jpg" aspect={1.5} from={{ x: 0.5, y: 0.5, z: 1.2 }} to={{ x: 0.5, y: 0.5, z: 1.1 }} k={prog(t, 0.2, 2.2)} />
        <Note kind="sample" />
      </Fade>
      <Fade k={p12}>
        <Still src="c12.jpg" aspect={1.5} from={{ x: 0.45, y: 0.5, z: 1.2 }} to={{ x: 0.5, y: 0.5, z: 1.08 }} k={prog(t, len - 3.4, len - 0.4)} />
        <Note kind="sample" />
        <Card title="西 · 私" sub="主卧 · 衣帽间 · 主卫" k={1} light />
      </Fade>
    </AbsoluteFill>
  );
};
export const S22: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const up = ease(prog(t, 0, len));
  const k = prog(t, 0.4, 2.0), k2 = prog(t, 1.2, 2.8);
  const zone = (z0: number, z1: number, color: string, kk: number) => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[UC[0], 1.62, (z0 + z1) / 2]}>
      <planeGeometry args={[22.8, Math.abs(z1 - z0)]} />
      <meshBasicMaterial color={color} transparent opacity={0.22 * kk} depthWrite={false} />
    </mesh>
  );
  return (
    <AbsoluteFill>
      <UnitScene cam={[UC[0], lerp(26, 36, up), lerp(UC[2] + 14, UC[2] + 4, up)]} look={UC} fov={40}>
        <Line pts={w.routes.vertical} k={1} color={C.gold} width={0.28} y={0.08} />
        <Line pts={w.routes.horizontal.slice(2)} k={1} color="#8f7ac4" width={0.28} y={0.08} />
        {zone(0, -9.2, C.green, k)}
        {zone(-9.2, -17.9, C.blue, k2)}
      </UnitScene>
    </AbsoluteFill>
  );
};

// ================= 尾声 =================
export const S23: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const night = prog(t, 0.2, 2.6);
  const x = prog(t, 3.6, 4.8);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Still src="c15.jpg" aspect={1.5} from={{ x: 0.7, y: 0.45, z: 1.2 }} to={{ x: 0.8, y: 0.42, z: 1.6 }} k={prog(t, 0, 4.8)} />
      <AbsoluteFill style={{ background: `rgba(8,12,26,${0.55 * night})` }} />
      <Note kind="sample" k={1 - x} />
      <Fade k={x}>
        <Still src="c02.jpg" aspect={1.6} from={{ x: 0.72, y: 0.3, z: 1.5 }} to={{ x: 0.74, y: 0.3, z: 1.3 }} k={prog(t, 3.6, len)} />
        <Note kind="render" />
      </Fade>
    </AbsoluteFill>
  );
};
export const S24: React.FC<ShotProps> = ({ len }) => {
  const t = useT();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const pull = ease(prog(t, 0, len * 0.6));
  const draw = prog(t, len * 0.45, len - 0.6);
  return (
    <AbsoluteFill>
      <SceneM bg={K.darkBg} cam={L3([-700, 650, 1700], [-2600, 2600, 3900], pull)} look={[cx, 0, cz + 300]} dark={1} ao={25}>
        <DarkWorld lit={0.9} venueGlow={0.35} />
        <Ruifu turn={1} color={K.darkCity} hero="#f6d9a6" heroGlow={1.2} />
      </SceneM>
      <AbsoluteFill style={{ background: "rgba(13,16,19,.8)", opacity: draw }} />
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <Draw d="M960 440 m -220 0 a 220 220 0 1 0 440 0 a 220 220 0 1 0 -440 0" k={draw} w={4} />
      </svg>
      <div style={{ position: "absolute", left: 0, right: 0, top: 780, textAlign: "center", fontFamily: SERIF, color: "#f3d7a6", opacity: prog(t, len - 2.2, len - 1.2) }}>
        <div style={{ fontSize: 40, letterSpacing: 6 }}>华润 · 太原瑞府</div>
        <div style={{ fontSize: 28, marginTop: 10, letterSpacing: 4 }}>2号楼　建筑面积约355㎡</div>
      </div>
    </AbsoluteFill>
  );
};

export const SHOTS: Record<string, React.FC<ShotProps>> = {
  "1": S1, "2": S2, "3": S3, "4": S4, "5": S5, "6": S6, "7": S7, "8": S8, "9": S9, "10": S10, "11": S11, "12": S12,
  "13": S13, "14": S14, "15": S15, "16": S16, "17": S17, "18": S18, "19": S19, "20": S20, "21": S21, "22": S22, "23": S23, "24": S24,
};
// 由镜头组件自己画花字的镜号，其余镜号用通用花字
export const CUSTOM_FLOWER = new Set(["2", "3", "4", "5", "6", "7", "8", "14", "16", "17", "20", "21", "24"]);
export const DARK_SHOTS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "15", "16", "17", "18", "23", "24"]);
export { ease };
