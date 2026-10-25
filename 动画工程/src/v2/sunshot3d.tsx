// O5S 的另一版（直观版）：一个沙盘里两栋一样的楼，左边正南正北作对照，右边是侧身 37.7° 的2号楼。
// 太阳沿太原夏至的真实轨迹在头顶走一天，平行光投下影子；被晒到的那一面变暖色，越正对太阳越亮，斜光就淡。
// 太阳位置用和 tools/v2/sun_hours.py 相同的公式现算（北纬37.82°、东经112.52°、北京时间）。
import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { clamp, ease } from "../lib";
import { CamFrom, CamSpec, V3, makeCamera, toScreen } from "./geo";
import { pr, useT } from "./open";
import { Footnote, P, SANS, SERIF } from "./theme";
import { kw } from "./timeline";

// ---------- 太阳 ----------
const LAT = 37.82, LON = 112.52, DOY = 172; // 夏至（6月21日）
const sunAt = (minute: number) => {
  const g = ((2 * Math.PI) / 365) * (DOY - 1 + (minute / 60 - 20) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = (((minute + eqt + 4 * LON - 480) / 4 - 180) * Math.PI) / 180, lat = (LAT * Math.PI) / 180;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI;
  return { az, el }; // 弧度；方位从正北顺时针
};
const sunDir = (m: number) => { const { az, el } = sunAt(m); return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); };
const domeAt = (m: number) => { const d = sunDir(m).multiplyScalar(DOME); d.y *= DOME_Y; return d; };
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

// ---------- 沙盘 ----------
const DOME = 300, DOME_Y = 0.6, BW = 78, BD = 26, BH = 140; // 太阳画在压扁的穹顶上，正午也留在画面里（光照方向仍按真实高度角）
const A_POS = new THREE.Vector3(120, 0, 0), B_POS = new THREE.Vector3(-120, 0, 0); // 从北往南看时东在左：对照楼放东边，画面里在左
const B_ROT = (-37.7 * Math.PI) / 180; // 正面从正南转到 217.7°（西南）
const faceN = (rot: number, z: number) => new THREE.Vector3(0, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); // 北面 z=-1，南面 z=+1
const SHADE = new THREE.Color("#AEB2BD"), LIT = new THREE.Color("#F6C25E"), SIDE = new THREE.Color("#E6E0D4");
const CAM: CamSpec = { t: [0, 95, 10], az: 16, el: 24, D: 1150, span: 430, sy: 610 };

const floorTex = () => {
  const c = document.createElement("canvas"); c.width = 64; c.height = 256;
  const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 256);
  g.fillStyle = "#c9c4ba"; for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 64, 2);
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(4, 2); return tx;
};
const makeBuilding = (roof: string, tex: THREE.Texture) => {
  const mats = Array.from({ length: 6 }, (_, i) => new THREE.MeshLambertMaterial({ color: i === 2 ? roof : SIDE.clone(), map: i === 2 || i === 3 ? null : tex }));
  const m = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), mats);
  m.position.y = BH / 2; m.castShadow = true; m.receiveShadow = true;
  return { mesh: m, mats };
};

export const O5SB: React.FC = () => {
  const t = useT();
  const tA = kw("O5S", "正南正北"), tN = kw("O5S", "北面只在"), tSl = kw("O5S", "斜斜"), tT = kw("O5S", "侧身之后"), tNE = kw("O5S", "东北这一面");
  const tEq = kw("O5S", "春分到秋分"), tSs = kw("O5S", "夏至前后"), tSr = kw("O5S", "日出"), tDay = kw("O5S", "一天里"), tBoth = kw("O5S", "前后两面");
  const scene = useMemo(() => {
    const tex = floorTex();
    const a = makeBuilding("#BDB6AA", tex), b = makeBuilding(P.hero, tex);
    a.mesh.position.x = A_POS.x; b.mesh.position.x = B_POS.x; b.mesh.rotation.y = B_ROT;
    const sun = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 16), new THREE.MeshBasicMaterial({ color: "#FFC24A" }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: "#FFD27A", transparent: true, opacity: 0.28, depthWrite: false }));
    const pts = Array.from({ length: 200 }, (_, i) => 290 + i * 4.5).filter((m) => sunAt(m).el > -0.02).map((m) => domeAt(m));
    const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: "#E39A3B", dashSize: 8, gapSize: 9, transparent: true, opacity: 0.6 }));
    path.computeLineDistances();
    const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#E39A3B", linewidth: 3 }));
    return { a, b, sun, halo, path, trail };
  }, []);

  // ---------- 太阳走到几点 ----------
  const [sr, s11, ss] = [313, 679, 1190]; // 夏至日出 05:13、东北面最后受光 11:19、日落 19:50
  let minute: number, from = sr;
  if (t < tA - 0.2) minute = 296 + 17 * pr(t, 0, tA - 0.2); // 天刚亮
  else if (t < tT - 0.3) minute = sr + (ss - sr) * ease(clamp((t - (tA - 0.2)) / (tT - 0.3 - (tA - 0.2)))); // 正南楼：快速走完一整天
  else if (t < tDay - 0.2) { minute = sr + (s11 - sr) * ease(clamp((t - (tT + 0.2)) / (tSr + 1.6 - (tT + 0.2)))); } // 侧身后：从日出慢慢走到 11 点
  else { minute = s11 + (960 - s11) * ease(clamp((t - (tDay - 0.2)) / 2.2)); from = sr; }
  const phase = t < tT - 0.3 ? "A" : t < tDay - 0.2 ? "B" : "C";
  const dir = sunDir(minute), up = clamp(dir.y / 0.12);
  // 回到日出时淡一下，提示“重新走一遍”
  const reset = phase === "B" ? 1 - clamp(Math.abs(t - (tT - 0.1)) / 0.4) : 0;

  // ---------- 立面受光 ----------
  const inc = (rot: number, z: number) => Math.max(0, faceN(rot, z).dot(dir)) * up;
  const aN = inc(0, -1), bNE = inc(B_ROT, -1), bSW = inc(B_ROT, 1), aS = inc(0, 1);
  const paint = (mats: THREE.MeshLambertMaterial[], idx: number, k: number, on: boolean) => { mats[idx].color.copy(on ? SHADE.clone().lerp(LIT, Math.pow(k, 0.6)) : SIDE); };
  paint(scene.a.mats, 5, aN, true); paint(scene.b.mats, 5, bNE, t > tA); paint(scene.b.mats, 4, bSW, phase === "C"); paint(scene.a.mats, 4, aS, false);
  scene.sun.position.copy(domeAt(minute)); scene.halo.position.copy(scene.sun.position);
  scene.sun.visible = scene.halo.visible = dir.y > -0.03;
  const trailPts = Array.from({ length: 80 }, (_, i) => from + ((minute - from) * i) / 79).filter((m) => sunAt(m).el > -0.02).map((m) => domeAt(m));
  if (trailPts.length > 1) scene.trail.geometry.setFromPoints(trailPts);
  scene.trail.visible = trailPts.length > 1;

  const orbit = ease(clamp((t - (tDay - 0.4)) / 1.8));
  const cam = makeCamera({ ...CAM, az: CAM.az + (212 - CAM.az) * orbit, el: CAM.el + 4 * Math.sin(orbit * Math.PI) }); cam.near = 50; cam.far = 4000; cam.updateProjectionMatrix();
  const S = (p: V3) => toScreen(cam, p);
  const k0 = pr(t, 0.1, 0.7);
  const kA = phase === "A" ? 1 : 0.55, kB = phase === "A" ? (t > tA ? 0.55 : 1) : 1;
  const faceA = S([A_POS.x, 80, -BD / 2]);
  const neC = new THREE.Vector3(0, 80, -BD / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), B_ROT).add(B_POS);
  const swC = new THREE.Vector3(0, 80, BD / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), B_ROT).add(B_POS);
  const faceB = S([neC.x, neC.y, neC.z]), faceBS = S([swC.x, swC.y, swC.z]);
  const status = (k: number) => (k > 0.6 ? "正对阳光" : k > 0.02 ? "晒得到" : "晒不到");
  const dawn = 1 - clamp(dir.y / 0.35); // 太阳低时天色偏暖
  const arrow = (p: THREE.Vector3, rot: number, len: number) => { const d = faceN(rot, 1); return [S([p.x + d.x * 18, 0.5, p.z + d.z * 18]), S([p.x + d.x * (18 + len), 0.5, p.z + d.z * (18 + len)])]; };
  const [aa0, aa1] = arrow(A_POS, 0, 90), [ba0, ba1] = arrow(B_POS, B_ROT, 90), [bs0, bs1] = arrow(B_POS, 0, 90);
  return (
    <AbsoluteFill style={{ background: P.paper, fontFamily: SANS }}>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(246,196,120,${0.35 * dawn * up}) 0%, rgba(246,196,120,0) 60%)` }} />
      <ThreeCanvas width={1920} height={1080} shadows style={{ position: "absolute", inset: 0 }}>
        <CamFrom cam={cam} />
        <ambientLight intensity={1.15} />
        <directionalLight position={[dir.x * 900, Math.max(dir.y, 0.01) * 900, dir.z * 900]} intensity={1.1 * up} color="#fff1dc" castShadow
          shadow-mapSize={[4096, 4096]} shadow-camera-left={-520} shadow-camera-right={520} shadow-camera-top={520} shadow-camera-bottom={-520} shadow-camera-near={10} shadow-camera-far={2400} shadow-bias={-0.0004} shadow-normalBias={0.5}>
          <object3D attach="target" position={[0, 0, 0]} />
        </directionalLight>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[470, 96]} />
          <meshBasicMaterial color="#EEEBDF" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} receiveShadow>
          <circleGeometry args={[470, 96]} />
          <shadowMaterial opacity={0.28 * up} color="#5B5240" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
          <ringGeometry args={[468, 474, 96]} />
          <meshBasicMaterial color="#CFC8BA" />
        </mesh>
        <primitive object={scene.a.mesh} />
        <primitive object={scene.b.mesh} />
        <primitive object={scene.path} />
        <primitive object={scene.trail} />
        <primitive object={scene.halo} />
        <primitive object={scene.sun} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "#fff", opacity: 0.55 * reset }} />

      {/* 地面上的朝向箭头 */}
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
        <defs><marker id="sa" markerUnits="userSpaceOnUse" markerWidth="18" markerHeight="18" refX="9" refY="9" orient="auto"><path d="M0,2 L18,9 L0,16 z" fill={P.ink2} /></marker>
          <marker id="sb" markerUnits="userSpaceOnUse" markerWidth="18" markerHeight="18" refX="9" refY="9" orient="auto"><path d="M0,2 L18,9 L0,16 z" fill={P.hero} /></marker></defs>
        <g opacity={k0}>
          <line x1={aa0[0]} y1={aa0[1]} x2={aa1[0]} y2={aa1[1]} stroke={P.ink2} strokeWidth={3} markerEnd="url(#sa)" />
          <line x1={bs0[0]} y1={bs0[1]} x2={bs1[0]} y2={bs1[1]} stroke={P.ink2} strokeWidth={2} strokeDasharray="5 6" opacity={0.7} />
          <line x1={ba0[0]} y1={ba0[1]} x2={ba1[0]} y2={ba1[1]} stroke={P.hero} strokeWidth={3} markerEnd="url(#sb)" />
          <text x={aa1[0]} y={aa1[1] + 32} textAnchor="middle" fontSize={20} fill={P.ink2}>正南</text>
          <text x={ba1[0] - 10} y={ba1[1] + 32} textAnchor="middle" fontSize={20} fill={P.hero}>西南</text>
          {(() => { const n = S([0, 0.5, -440]); return <text x={n[0]} y={n[1] + 8} textAnchor="middle" fontSize={24} fontWeight={700} fill={P.ink}>北</text>; })()}
        </g>
      </svg>

      {/* 楼名 */}
      {([[A_POS, "正南正北的楼", "对照", kA, P.ink2], [B_POS, "瑞府2号楼", "侧身 37.7°", kB, P.hero]] as const).map(([p, n, s, k, c]) => {
        const q = S([p.x, BH + 22, p.z]);
        return (
          <div key={n} style={{ position: "absolute", left: q[0], top: q[1], transform: "translate(-50%,-100%)", textAlign: "center", opacity: k0 * k * (1 - Math.sin(orbit * Math.PI)), whiteSpace: "nowrap" }}>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 38, color: P.ink }}>{n}</div>
            <div style={{ fontSize: 24, color: c, marginTop: 2 }}>{s}</div>
          </div>
        );
      })}
      {/* 立面状态：正南楼北面 / 2号楼东北面 / 2号楼西南面 */}
      {([[faceA, "北面", aN, pr(t, tN - 0.3, 0.4) * (phase === "A" ? 1 : 0.8) * (1 - orbit), -190], [faceB, "东北面", bNE, pr(t, tNE - 0.3, 0.4) * (1 - orbit), 190], [faceBS, "西南面", bSW, pr(t, tDay + 1.2, 0.4), -200]] as const).map(([p, n, k, o, dx]) => (
        <div key={n} style={{ position: "absolute", left: p[0] + dx, top: p[1], transform: "translate(-50%,-50%)", opacity: o, background: k > 0.02 ? "#FFF4DD" : "rgba(255,255,255,.92)", border: `2px solid ${k > 0.6 ? "#E39A3B" : k > 0.02 ? "#EBC98E" : "#C9C4BA"}`, borderRadius: 6, padding: "6px 14px", textAlign: "center", boxShadow: "0 4px 14px rgba(60,45,30,.12)", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 22, color: P.ink2 }}>{n}</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: k > 0.6 ? "#C9771F" : k > 0.02 ? "#B9925A" : P.ink2 }}>{status(k)}</div>
        </div>
      ))}

      {/* 标题和时钟 */}
      <div style={{ position: "absolute", left: 110, top: 80, opacity: k0 }}>
        <div style={{ fontSize: 24, color: P.hero, letterSpacing: 5 }}>这个侧身，带来的是</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 54, color: P.ink, marginTop: 8 }}>更长的日照，更好的采光面</div>
        <div style={{ fontSize: 22, color: P.ink2, marginTop: 6 }}>以太原夏至为例 · 左边正南正北的楼作对照</div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 80, textAlign: "right", opacity: k0 }}>
        <div style={{ fontSize: 22, color: P.ink2 }}>{dir.y > 0 ? "北京时间" : "日出前"}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 76, color: dir.y > 0 ? "#C9771F" : P.ink2, fontVariantNumeric: "tabular-nums" }}>{hm(Math.round(minute / 5) * 5)}</div>
      </div>
      {/* 读数 */}
      <div style={{ position: "absolute", right: 110, top: 230, textAlign: "right", fontSize: 24, color: P.ink2, opacity: pr(t, tEq - 0.2, 0.5) * (1 - pr(t, tSs - 0.3, 0.3)) }}>春分到秋分，每天上午都晒得到</div>
      <div style={{ position: "absolute", right: 110, top: 226, textAlign: "right", opacity: pr(t, tSs + 0.2, 0.5) * (1 - pr(t, tDay - 0.3, 0.3)) }}>
        <div style={{ fontSize: 22, color: P.ink2 }}>夏至 · 2号楼东北面</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 46, color: "#C9771F" }}>日出 → 约11:20</div>
      </div>
      <div style={{ position: "absolute", right: 110, top: 236, fontFamily: SERIF, fontWeight: 900, fontSize: 46, color: P.ink, opacity: pr(t, tBoth - 0.3, 0.5) }}>前后两面，都有阳光</div>
      {void tSl}
      <Footnote text="示意沙盘 · 太阳位置按太原纬度、夏至日推算（北京时间），2号楼朝向据总平面量得；未计周边楼栋与树木遮挡" />
    </AbsoluteFill>
  );
};
