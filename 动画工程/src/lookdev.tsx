// 渲染精度样片（look-dev）：四个镜头示范成片的画面质感。
// ①路网线条 ②汾河引水 ③夜景文化岛 ④户型客厅。不进成片，确认风格后再推到全片。
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { clamp, ease, lerp, mixColor, prog } from "./lib";
import { City, PLATFORM_H, Parks, Platform, Ruifu, Terrain, Venues, loadWorld, useWorld, waitForWorld, worldReady } from "./world";

type V3 = [number, number, number];
type XZ = [number, number];
const L3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const SANS = '"PingFang SC", "Hiragino Sans GB", sans-serif';
const SERIF = '"Songti SC", "STSong", serif';
const SEG = 6 * 30; // 每段6秒

// ---------- 场景（带泛光、暗角） ----------
const Rig: React.FC<{ cam: V3; look: V3; fov: number }> = ({ cam, look, fov }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.localClippingEnabled = true;
  const c = camera as THREE.PerspectiveCamera;
  c.position.set(...cam); c.fov = fov; c.near = Math.max(0.05, Math.hypot(cam[0] - look[0], cam[1] - look[1], cam[2] - look[2]) / 2000); c.far = 80000;
  c.lookAt(...look); c.updateProjectionMatrix();
  return null;
};
const SceneLD: React.FC<{ bg: string; cam: V3; look: V3; fov?: number; fog: [number, number]; ao: number; bloom: number; sun: { pos: V3; color: string; i: number }; hemi: [string, string, number]; shadowBox: number; children: React.ReactNode }> = ({
  bg, cam, look, fov = 34, fog, ao, bloom, sun, hemi, shadowBox, children,
}) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} shadows style={{ backgroundColor: bg }}>
      <Rig cam={cam} look={look} fov={fov} />
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, fog[0], fog[1]]} />
      <hemisphereLight args={hemi} />
      <directionalLight position={sun.pos} intensity={sun.i} color={sun.color} castShadow shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-shadowBox} shadow-camera-right={shadowBox} shadow-camera-top={shadowBox} shadow-camera-bottom={-shadowBox} shadow-camera-far={8000} shadow-bias={-0.0003} shadow-normalBias={0.3}>
        <object3D attach="target" position={look} />
      </directionalLight>
      {children}
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={ao} intensity={2.2} distanceFalloff={1} quality="high" />
        <Bloom intensity={bloom} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur radius={0.7} />
        <Vignette offset={0.25} darkness={0.55} />
      </EffectComposer>
    </ThreeCanvas>
  );
};

// ---------- 发光线：固定像素宽度、抗锯齿，核心亮线 + 外晕 + 头部光点 ----------
const partial = (pts: XZ[], k: number): XZ[] => {
  const seg = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const upto = seg[seg.length - 1] * clamp(k);
  const out: XZ[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (seg[i] <= upto) out.push(pts[i]);
    else { const f = (upto - seg[i - 1]) / (seg[i] - seg[i - 1] || 1); out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]); break; }
  }
  return out;
};
const GLine: React.FC<{ pts: XZ[]; k: number; color: string; width: number; y?: number; halo?: number; head?: boolean; opacity?: number }> = ({ pts, k, color, width, y = 0.5, halo = 4, head = true, opacity = 1 }) => {
  const { width: W, height: H } = useVideoConfig();
  const { core, glow, mc, mg } = useMemo(() => {
    const mc = new LineMaterial({ color: new THREE.Color(color).multiplyScalar(2.2).getHex(), linewidth: width, transparent: true, depthWrite: false, toneMapped: false } as any);
    const mg = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width * halo, transparent: true, opacity: 0.18, depthWrite: false } as any);
    mc.resolution.set(W, H); mg.resolution.set(W, H);
    return { core: new Line2(new LineGeometry(), mc), glow: new Line2(new LineGeometry(), mg), mc, mg };
  }, [color, width, halo, W, H]);
  const p = partial(pts, k);
  if (k <= 0 || p.length < 2) return null;
  const flat = p.flatMap(([x, z]) => [x, y, z]);
  core.geometry.dispose(); glow.geometry.dispose();
  core.geometry = new LineGeometry().setPositions(flat);
  glow.geometry = new LineGeometry().setPositions(flat);
  core.computeLineDistances(); glow.computeLineDistances();
  mc.opacity = opacity; mg.opacity = 0.18 * opacity;
  const tip = p[p.length - 1];
  return (
    <group>
      <primitive object={glow} />
      <primitive object={core} />
      {head && k < 0.995 ? (
        <mesh position={[tip[0], y + 0.5, tip[1]]}>
          <sphereGeometry args={[width * 1.6, 16, 16]} />
          <meshBasicMaterial color={new THREE.Color("#fff3d0").multiplyScalar(4)} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
};

// ---------- 田垄地面（镜4） ----------
const Fields: React.FC<{ k: number }> = ({ k }) => {
  const w = useWorld();
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: "#2b2418", roughness: 1 });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWf;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWf = (modelMatrix * vec4(transformed,1.0)).xyz;");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWf;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}")
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec2 cell = floor(vWf.xz / 380.0);
          float ang = (h21(cell) - 0.5) * 0.6;
          vec2 d = vec2(cos(ang), sin(ang));
          float rows = smoothstep(0.35, 0.5, abs(fract(dot(vWf.xz, d) / 9.0) - 0.5));
          float tone = 0.75 + 0.5 * h21(cell + 7.0);
          float edge = 1.0 - smoothstep(0.0, 6.0, min(min(fract(vWf.x/380.0), 1.0-fract(vWf.x/380.0)), min(fract(vWf.z/380.0), 1.0-fract(vWf.z/380.0))) * 380.0);
          diffuseColor.rgb *= tone * (0.82 + 0.18 * rows) * (1.0 - 0.35 * edge);`);
    };
    return m;
  }, []);
  const mesh = useMemo(() => { const m = new THREE.Mesh(w.terrain, mat); m.receiveShadow = true; return m; }, [w, mat]);
  mat.color.set(mixColor("#16181b", "#5a4a2e", k));
  return <primitive object={mesh} />;
};

// ---------- 水面：深浅、流动波光、水头高光 ----------
const WaterLD: React.FC<{ reveal: number; night?: number }> = ({ reveal, night = 1 }) => {
  const w = useWorld();
  const frame = useCurrentFrame();
  const { fenM, innerM, u } = useMemo(() => {
    const u = { uReveal: { value: 1 }, uC: { value: new THREE.Vector2(w.islandC[0], w.islandC[1]) }, uTime: { value: 0 } };
    const mk = (inner: boolean) => {
      const m = new THREE.MeshStandardMaterial({ color: "#0f4f73", roughness: 0.12, metalness: 0.2, emissive: "#0b3a57", emissiveIntensity: 0.8 });
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, u);
        s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWw;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWw = (modelMatrix * vec4(transformed,1.0)).xyz;");
        s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWw; uniform float uReveal; uniform vec2 uC; uniform float uTime;")
          .replace("void main() {", `void main() {
            float pr = 0.0;
            ${inner ? "float a = degrees(atan(vWw.z - uC.y, vWw.x - uC.x)); pr = mod(-71.0 - a + 720.0, 360.0) / 218.0; if (pr > uReveal) discard;" : ""}`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            float n1 = sin(vWw.z * 0.012 + vWw.x * 0.004 + uTime * 0.6);
            float n2 = sin(vWw.z * 0.031 - vWw.x * 0.011 - uTime * 0.9 + n1 * 1.7);
            float sheen = smoothstep(0.55, 1.0, n2 * 0.6 + n1 * 0.4);
            totalEmissiveRadiance += vec3(0.35, 0.6, 0.8) * 0.06 * sheen;
            ${inner ? "float headGlow = smoothstep(0.06, 0.0, uReveal - pr) * step(uReveal, 0.999); totalEmissiveRadiance += vec3(0.8, 0.95, 1.0) * 2.5 * headGlow;" : ""}`);
      };
      return m;
    };
    return { fenM: new THREE.Mesh(w.fen, mk(false)), innerM: new THREE.Mesh(w.inner, mk(true)), u };
  }, [w]);
  u.uReveal.value = reveal;
  u.uTime.value = frame / 30;
  [fenM, innerM].forEach((m) => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = lerp(0.3, 0.8, night); });
  return <group><primitive object={fenM} /><primitive object={innerM} /></group>;
};

// ---------- 建筑模型式小人（户型段） ----------
const Person: React.FC<{ at: V3; sit?: boolean; rot?: number; color?: string }> = ({ at, sit = false, rot = 0, color = "#fbf8f2" }) => (
  <group position={at} rotation={[0, rot, 0]}>
    <mesh position={[0, sit ? 0.72 : 0.62, 0]} castShadow>
      <capsuleGeometry args={[0.17, sit ? 0.42 : 0.86, 6, 16]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
    {sit ? (
      <mesh position={[0, 0.48, 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.13, 0.32, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    ) : null}
    <mesh position={[0, sit ? 1.18 : 1.42, 0]} castShadow>
      <sphereGeometry args={[0.12, 20, 16]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  </group>
);

// ================= 四段样片 =================
const Title: React.FC<{ n: string; title: string; sub: string; dark?: boolean }> = ({ n, title, sub, dark = true }) => (
  <div style={{ position: "absolute", left: 40, top: 30, fontFamily: SANS, color: dark ? "#fff" : "#2a2622", textShadow: dark ? "0 2px 10px rgba(0,0,0,.6)" : "none" }}>
    <div style={{ fontSize: 20, letterSpacing: 4, opacity: 0.75 }}>渲染精度样片 · {n}</div>
    <div style={{ fontSize: 34, fontWeight: 600, marginTop: 6 }}>{title}</div>
    <div style={{ fontSize: 22, marginTop: 4, opacity: 0.8 }}>{sub}</div>
  </div>
);

const ShotRoads: React.FC = () => {
  const t = useCurrentFrame() / 30;
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const near = useMemo(() => w.roads.filter((r) => r.pts.some(([x, z]) => Math.hypot(x - cx, z - cz) < 2600)), [w, cx, cz]);
  const ring = useMemo(() => [...w.island, w.island[0]] as XZ[], [w]);
  return (
    <AbsoluteFill>
      <SceneLD bg="#08090b" cam={L3([cx - 1300, 1500, cz + 1900], [cx - 1000, 1180, cz + 1500], t / 6)} look={[cx, 0, cz]} fog={[1800, 7000]} ao={0} bloom={1.1}
        sun={{ pos: [cx - 2000, 1500, cz + 1500], color: "#ffd9a0", i: 0.6 }} hemi={["#3b4250", "#0b0c0e", 0.5]} shadowBox={2000}>
        <Fields k={1} />
        {near.map((r, i) => <GLine key={i} pts={r.pts} k={prog(t, 0.2 + (i % 14) * 0.18, 1.6 + (i % 14) * 0.18)} color="#d9a64e" width={r.cls === "trunk" ? 2.4 : 1.6} y={-0.9} />)}
        <GLine pts={ring} k={prog(t, 3.0, 5.2)} color="#ffe2a6" width={3.6} y={-0.6} halo={5} />
      </SceneLD>
      <Title n="①" title="规划线：统一线型 + 光晕" sub="田垄地面 · 发光线头 · 泛光" />
    </AbsoluteFill>
  );
};

const ShotWater: React.FC = () => {
  const t = useCurrentFrame() / 30;
  const w = useWorld();
  const [cx, cz] = w.islandC;
  // 内河东北口 → 汾河西岸最近点：一段引水光流
  const mouth = useMemo(() => {
    const a = w.innerPoly.reduce((b, p) => (p[1] < b[1] ? p : b), w.innerPoly[0]);
    let best = w.fenPoly[0], bd = 1e9;
    for (const p of w.fenPoly) { const d = Math.hypot(p[0] - a[0], p[1] - a[1]); if (d < bd) { bd = d; best = p; } }
    return [[best[0], best[1]], [a[0], a[1]]] as XZ[];
  }, [w]);
  return (
    <AbsoluteFill>
      <SceneLD bg="#07090c" cam={L3([cx - 950, 820, cz + 1150], [cx - 700, 640, cz + 880], t / 6)} look={[cx + 60, 0, cz - 60]} fog={[1500, 6000]} ao={0} bloom={1.0}
        sun={{ pos: [cx - 1500, 1200, cz + 1200], color: "#9fb6d6", i: 0.5 }} hemi={["#2c3644", "#08090b", 0.6]} shadowBox={1500}>
        <Terrain color="#14171b" />
        <WaterLD reveal={prog(t, 1.2, 5.6)} />
        <GLine pts={mouth} k={prog(t, 0.3, 1.2)} color="#7fd0ff" width={4} y={-0.3} halo={4} />
        <GLine pts={[...w.island, w.island[0]] as XZ[]} k={1} color="#ffe2a6" width={1.6} y={-0.5} head={false} opacity={0.6 * (1 - prog(t, 3, 5.5))} />
      </SceneLD>
      <Title n="②" title="汾河引水：水头带光，和汾河连成一体" sub="水面波光 · 岸线 · 流动方向" />
    </AbsoluteFill>
  );
};

const ShotNight: React.FC = () => {
  const t = useCurrentFrame() / 30;
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const a = lerp(0.1, 0.55, t / 6);
  return (
    <AbsoluteFill>
      <SceneLD bg="#06080b" cam={[cx + Math.sin(a) * 950, 480, cz + Math.cos(a) * 950]} look={[cx, 10, cz]} fog={[1600, 7000]} ao={18} bloom={1.4}
        sun={{ pos: [cx - 1500, 1500, cz + 1000], color: "#8fa6c8", i: 0.8 }} hemi={["#3a4656", "#07080a", 0.8]} shadowBox={1200}>
        <Terrain color="#101317" />
        <WaterLD reveal={1} />
        <City color="#46505c" lit={1} />
        <Platform rise={1} color="#3a414a" />
        <Venues color="#d9b46a" emissive={0.9} />
        <Ruifu turn={1} color="#2a3038" hero="#f6d9a6" heroGlow={1.6} />
      </SceneLD>
      <Title n="③" title="夜景文化岛：城市灯光 + 泛光" sub="窗灯 · 场馆亮化 · 水面倒映光" />
    </AbsoluteFill>
  );
};

const ShotLiving: React.FC = () => {
  const t = useCurrentFrame() / 30;
  const w = useWorld();
  // 客厅分区高亮：给户型地面上色（只在这个镜头的克隆上改）
  const k = ease(prog(t, 0.6, 1.6));
  const look: V3 = [15.6, 0.4, -4.6];
  return (
    <AbsoluteFill>
      <SceneLD bg="#efede9" cam={L3([24.5, 9.5, 5.5], [24.0, 9.2, 5.0], t / 6)} look={look} fov={38} fog={[200, 600]} ao={0.8} bloom={0.25}
        sun={{ pos: [6, 14, 12], color: "#ffe6c4", i: 2.4 }} hemi={["#ffffff", "#c8c4bd", 1.1]} shadowBox={18}>
        <UnitZones highlight={["living"]} k={k} />
        {/* 窗外的和园：南侧一片绿地和几棵树（示意） */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[11.4, -2.6, 22]} receiveShadow>
          <planeGeometry args={[80, 40]} />
          <meshStandardMaterial color="#b9c9a6" roughness={1} />
        </mesh>
        {[[6, 12], [12, 16], [18, 11], [24, 17], [3, 20], [28, 9]].map(([x, z], i) => (
          <group key={i} position={[x, -2.6, z]}>
            <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.12, 0.16, 2.4, 8]} /><meshStandardMaterial color="#cbbfa9" /></mesh>
            <mesh position={[0, 3.2, 0]} castShadow><sphereGeometry args={[1.5, 16, 12]} /><meshStandardMaterial color="#9fb88a" roughness={0.9} /></mesh>
          </group>
        ))}
        {/* 一家人：沙发上三人，窗边一人 */}
        <Person at={[17.95, 0, -3.2]} sit rot={-Math.PI / 2} />
        <Person at={[17.95, 0, -4.4]} sit rot={-Math.PI / 2} color="#f3e6d3" />
        <Person at={[15.2, 0, -2.6]} sit rot={0} />
        <Person at={[13.2, 0, -2.4]} rot={Math.PI} color="#f3e6d3" />
      </SceneLD>
      <Title n="④" title="户型段：固定机位 + 分区高亮 + 小人" sub="午后阳光 · 软装配色 · 窗外和园（示意）" dark={false} />
      <div style={{ position: "absolute", right: 120, top: 220, opacity: prog(t, 1.4, 2.0), fontFamily: SERIF, color: "#2c2a26" }}>
        <div style={{ fontFamily: SANS, fontSize: 22, letterSpacing: 6, color: "#a0896a" }}>纵线 · 看景</div>
        <div style={{ fontSize: 60, fontWeight: 700, marginTop: 6 }}>午后 · 客厅</div>
        <div style={{ fontSize: 30, marginTop: 10, color: "#5e564c" }}>面宽约7.8米 ｜ 窗外是和园</div>
      </div>
    </AbsoluteFill>
  );
};

/** 户型沙盘 + 分区上色：highlight 的房间暖色，其余退成浅灰；软装按类别配色 */
const UnitZones: React.FC<{ highlight: string[]; k: number }> = ({ highlight, k }) => {
  const w = useWorld();
  const root = useMemo(() => {
    const r = w.unit.clone(true);
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      const old = m.material as THREE.Material;
      let room: string | null = null;
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.name.startsWith("room_")) { room = p.name.slice(5); break; }
      const isFloor = /^floor_/.test(m.name), isFurn = /furn_/.test(m.name) || /furn_/.test(m.parent?.name ?? "");
      let base = "#f4f2ee";
      if (old.name === "fabric") base = "#c9b79c";
      else if (isFurn && old.name === "white_model") base = "#b9926a";
      else if (isFloor && old.name === "wood_floor") base = "#e6d6bd";
      else if (isFloor && old.name === "stone_floor") base = "#e3e1dc";
      const mat = old.name === "glass"
        ? Object.assign(new THREE.MeshStandardMaterial({ color: "#dfeef2", transparent: true, opacity: 0.2, roughness: 0.05 }), { clippingPlanes: old.clippingPlanes })
        : new THREE.MeshStandardMaterial({ color: base, roughness: 0.85 });
      (mat as any).userData = { base, room, isFloor, isFurn };
      m.material = mat;
    });
    return r;
  }, [w]);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const ud = (mat as any).userData as { base: string; room: string | null; isFloor: boolean; isFurn: boolean } | undefined;
    if (!ud?.base || mat.transparent) return;
    const on = ud.room !== null && highlight.includes(ud.room);
    const target = on ? (ud.isFloor ? "#f1dcb6" : ud.base) : (ud.isFloor || ud.isFurn ? "#e8e6e2" : ud.base);
    mat.color.set(mixColor(ud.base, target, k));
    mat.emissive.set(on && ud.isFloor ? "#f0b860" : "#000000");
    mat.emissiveIntensity = on && ud.isFloor ? 0.05 * k : 0;
  });
  return <primitive object={root} />;
};

export const LookDev: React.FC = () => {
  const [ready, setReady] = useState(worldReady());
  useEffect(() => { waitForWorld(); if (!ready) loadWorld().then(() => setReady(true)); }, [ready]);
  if (!ready) return <AbsoluteFill style={{ background: "#000" }} />;
  return <LookDevBody />;
};
const LookDevBody: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Sequence durationInFrames={SEG}><ShotRoads /></Sequence>
    <Sequence from={SEG} durationInFrames={SEG}><ShotWater /></Sequence>
    <Sequence from={SEG * 2} durationInFrames={SEG}><ShotNight /></Sequence>
    <Sequence from={SEG * 3} durationInFrames={SEG}><ShotLiving /></Sequence>
  </AbsoluteFill>
);
export const LOOKDEV_FRAMES = SEG * 4;
export { PLATFORM_H };

// ---------- 给 AI 渲染用的白模输入：客厅，矮墙（0.7米），无小人、无文字，镜头固定微推 ----------
const LowWallUnit: React.FC<{ wallH: number }> = ({ wallH }) => {
  const w = useWorld();
  const root = useMemo(() => {
    const r = w.unit.clone(true);
    r.updateMatrixWorld(true);
    const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), wallH)];
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      const old = m.material as THREE.Material;
      const isWall = /^wall_/.test(m.name) || /^wall_/.test(m.parent?.name ?? "");
      const isWin = /^window_/.test(m.name) || /^window_/.test(m.parent?.name ?? "");
      const isFurn = /^furn_/.test(m.name) || /^furn_/.test(m.parent?.name ?? "");
      const cap = isWall ? wallH : isFurn ? 0.95 : Infinity; // 墙压到矮墙高度，柜子类高家具压到0.95米
      if (cap < Infinity) {
        const box = new THREE.Box3().setFromObject(m);
        if (box.max.y > cap + 0.01) {
          const target = (isWall ? /^wall_/ : /^furn_/).test(m.name) ? m : m.parent!;
          target.scale.y *= (cap - box.min.y) / (box.max.y - box.min.y);
          target.updateMatrixWorld(true);
          target.position.y += box.min.y - new THREE.Box3().setFromObject(m).min.y;
          target.updateMatrixWorld(true);
        }
      }
      const isFloor = /^floor_/.test(m.name);
      const mat = new THREE.MeshStandardMaterial({ color: isFloor ? "#e9e6e1" : "#f6f5f2", roughness: 0.9, transparent: old.name === "glass", opacity: old.name === "glass" ? 0.15 : 1 });
      if (isWin || old.name === "glass") mat.clippingPlanes = clip;
      m.material = mat;
    });
    return r;
  }, [w, wallH]);
  return <primitive object={root} />;
};
const AIClayBody: React.FC = () => {
  const t = useCurrentFrame() / 30;
  return (
    <AbsoluteFill>
      <SceneLD bg="#f1f0ed" cam={L3([24.5, 9.5, 5.5], [23.6, 9.0, 4.7], t / 5)} look={[15.6, 0.3, -4.8]} fov={38} fog={[200, 600]} ao={0.8} bloom={0}
        sun={{ pos: [6, 14, 12], color: "#fff1dc", i: 2.4 }} hemi={["#ffffff", "#c8c4bd", 1.1]} shadowBox={18}>
        <LowWallUnit wallH={0.7} />
      </SceneLD>
    </AbsoluteFill>
  );
};
export const AIClay: React.FC = () => {
  const [ready, setReady] = useState(worldReady());
  useEffect(() => { if (!ready) loadWorld().then(() => setReady(true)); }, [ready]);
  if (!ready) return <AbsoluteFill style={{ background: "#000" }} />;
  return <AIClayBody />;
};

// ---------- 区域大场景的白模输入（给即梦提质感用）：文化岛近景、长风全景 ----------
const AIRegionBody: React.FC = () => {
  const f = useCurrentFrame();
  const w = useWorld();
  const [cx, cz] = w.islandC;
  const views: { cam: V3; look: V3; fov: number }[] = [
    { cam: [cx - 780, 520, cz + 820], look: [cx + 40, 0, cz - 40], fov: 34 },
    { cam: [cx - 2300, 1700, cz + 2700], look: [cx + 300, 0, cz + 200], fov: 36 },
  ];
  const v = views[Math.min(f, views.length - 1)];
  return (
    <AbsoluteFill>
      <SceneLD bg="#e9eef2" cam={v.cam} look={v.look} fov={v.fov} fog={[3000, 14000]} ao={20} bloom={0}
        sun={{ pos: [cx - 1500, 1400, cz + 1300], color: "#fff2df", i: 2.6 }} hemi={["#ffffff", "#c9c3b8", 1.0]} shadowBox={2500}>
        <Terrain color="#e4ded3" />
        <Parks color="#c7d6b8" />
        <WaterLD reveal={1} night={0} />
        <City color="#f4f2ee" lit={0} />
        <Platform rise={1} color="#fbfaf7" />
        <Venues color="#ffffff" />
        <Ruifu turn={1} color="#f4f2ee" />
      </SceneLD>
    </AbsoluteFill>
  );
};
export const AIRegion: React.FC = () => {
  const [ready, setReady] = useState(worldReady());
  useEffect(() => { if (!ready) loadWorld().then(() => setReady(true)); }, [ready]);
  if (!ready) return <AbsoluteFill style={{ background: "#000" }} />;
  return <AIRegionBody />;
};
