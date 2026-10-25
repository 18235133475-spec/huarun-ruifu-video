// 动态分镜（M1）的公共工具：缓动、配色、三维场景、占位城市布局。
// 所有动画只由帧号决定，不用随机数和实时时钟，保证每次渲染一致。
import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export const C = {
  dark: "#0d1013",
  ground: "#1a1e23",
  wheat: "#3a3222",
  cityDark: "#3b4148",
  gold: "#d9b46a",
  goldSoft: "#b8955a",
  water: "#3fa7d6",
  cream: "#f2eee6",
  creamGround: "#e9e4da",
  white: "#fbfaf6",
  green: "#7fae7a",
  blue: "#5a9cc0",
  orange: "#e0955a",
  purple: "#8f7ac4",
  warm: "#f4c27a",
};

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
/** 在 [a, b] 秒之间从 0 走到 1（带缓动） */
export const prog = (t: number, a: number, b: number) => ease((t - a) / (b - a));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const mixColor = (a: string, b: string, k: number) => {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return "#" + ca.lerp(cb, clamp(k)).getHexString();
};

export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

// 简单的确定性伪随机
export const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const Cam: React.FC<{ pos: [number, number, number]; look: [number, number, number]; fov?: number }> = ({ pos, look, fov = 35 }) => {
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(...pos);
  cam.fov = fov;
  cam.near = 0.1;
  cam.far = 4000;
  cam.lookAt(...look);
  cam.updateProjectionMatrix();
  return null;
};

export const Scene3D: React.FC<{
  bg: string;
  cam: [number, number, number];
  look: [number, number, number];
  fov?: number;
  light?: number;
  warm?: number;
  children: React.ReactNode;
}> = ({ bg, cam, look, fov, light = 1, warm = 0, children }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} style={{ backgroundColor: bg }} camera={{ position: cam, fov: fov ?? 35 }}>
      <Cam pos={cam} look={look} fov={fov} />
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 220, 900]} />
      <hemisphereLight args={[mixColor("#ffffff", "#ffd9a8", warm), "#5b6470", 0.9 * light]} />
      <directionalLight position={[-120, 200, 140]} intensity={1.4 * light} color={mixColor("#ffffff", "#ffc98a", warm)} />
      <directionalLight position={[160, 80, -100]} intensity={0.35 * light} />
      {children}
    </ThreeCanvas>
  );
};

export const Box: React.FC<{ x: number; z: number; w: number; d: number; h: number; color: string; y?: number; emissive?: string; ei?: number; rot?: number; opacity?: number }> = ({
  x, z, w, d, h, color, y = 0, emissive, ei = 0, rot = 0, opacity = 1,
}) => {
  if (h <= 0.01) return null;
  return (
    <mesh position={[x, y + h / 2, z]} rotation={[0, rot, 0]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} emissive={emissive ?? "#000000"} emissiveIntensity={ei} roughness={0.85} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
};

export const Ground: React.FC<{ color: string; size?: number; y?: number }> = ({ color, size = 2000, y = 0 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
    <planeGeometry args={[size, size]} />
    <meshStandardMaterial color={color} roughness={1} />
  </mesh>
);

export const Flat: React.FC<{ x: number; z: number; w: number; d: number; color: string; y?: number; opacity?: number; emissive?: string; ei?: number }> = ({
  x, z, w, d, color, y = 0.05, opacity = 1, emissive, ei = 0,
}) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]}>
    <planeGeometry args={[w, d]} />
    <meshStandardMaterial color={color} transparent opacity={opacity} emissive={emissive ?? "#000000"} emissiveIntensity={ei} roughness={1} />
  </mesh>
);

/** 地面上的发光折线，k 控制画到多少（0–1） */
export const GlowLine: React.FC<{ pts: [number, number][]; k: number; color: string; y?: number; width?: number; opacity?: number }> = ({ pts, k, color, y = 0.3, width = 1.2, opacity = 1 }) => {
  const shape = useMemo(() => {
    const seg: number[] = [0];
    for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return seg;
  }, [pts]);
  const total = shape[shape.length - 1];
  const upto = total * clamp(k);
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (shape[i] <= upto) out.push(pts[i]);
    else {
      const f = (upto - shape[i - 1]) / (shape[i] - shape[i - 1] || 1);
      out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]);
      break;
    }
  }
  if (k <= 0 || out.length < 2) return null;
  return (
    <group>
      {out.slice(1).map((p, i) => {
        const a = out[i];
        const len = Math.hypot(p[0] - a[0], p[1] - a[1]);
        if (len < 0.01) return null;
        const ang = Math.atan2(p[1] - a[1], p[0] - a[0]);
        return (
          <mesh key={i} position={[(a[0] + p[0]) / 2, y, (a[1] + p[1]) / 2]} rotation={[-Math.PI / 2, 0, -ang]}>
            <planeGeometry args={[len + width * 0.5, width]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
};

/** 地面上的圆环，k 控制画到多少 */
export const GlowRing: React.FC<{ cx: number; cz: number; r: number; k: number; color: string; width?: number; y?: number; opacity?: number }> = ({ cx, cz, r, k, color, width = 1.4, y = 0.3, opacity = 1 }) => {
  if (k <= 0) return null;
  return (
    <mesh position={[cx, y, cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r - width / 2, r + width / 2, 96, 1, Math.PI / 2, Math.PI * 2 * clamp(k)]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
};

// ---------- 占位城市布局（单位约10米；+x 向东，+z 向南） ----------
export const RIVER = { x: 55, w: 26 }; // 汾河：南北向的一条水带
export const ISLAND = { x: -10, z: -10, r: 26 }; // 文化岛
export const VENUES = [
  { name: "大剧院", x: -14, z: -16, w: 14, d: 10, h: 9 },
  { name: "图书馆", x: 2, z: -18, w: 9, d: 9, h: 7 },
  { name: "美术馆", x: -24, z: -2, w: 9, d: 8, h: 6 },
  { name: "科技馆", x: -4, z: 2, w: 12, d: 8, h: 8 },
  { name: "博物馆", x: 6, z: -4, w: 8, d: 10, h: 10 },
];
type B = { x: number; z: number; w: number; d: number; h: number; dist: number; side: "east" | "west" };
export const CITY: B[] = (() => {
  const out: B[] = [];
  let i = 0;
  for (let gx = -180; gx <= 200; gx += 14) {
    for (let gz = -160; gz <= 160; gz += 14) {
      i++;
      const x = gx + (rand(i) - 0.5) * 5, z = gz + (rand(i + 99) - 0.5) * 5;
      if (Math.abs(x - RIVER.x) < RIVER.w / 2 + 8) continue;
      if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.r + 8) continue;
      if (x > 8 && x < 50 && z > 12 && z < 118) continue; // 留给瑞府及周边
      if (rand(i + 7) < 0.25) continue;
      const side = x > RIVER.x ? "east" : "west";
      const tall = side === "west" && Math.hypot(x - ISLAND.x, z - ISLAND.z) < 90 ? 1 : 0;
      out.push({ x, z, w: 6 + rand(i + 3) * 5, d: 6 + rand(i + 5) * 5, h: (tall ? 14 + rand(i + 11) * 26 : 4 + rand(i + 13) * 10), dist: Math.hypot(x - ISLAND.x, z - ISLAND.z), side });
    }
  }
  return out;
})();
// 瑞府：沿汾河西岸南北排列；最北边两栋是1号楼、2号楼
export const RUIFU = (() => {
  const out: { x: number; z: number; id: number }[] = [];
  let id = 3;
  for (let row = 0; row < 7; row++) for (let col = 0; col < 3; col++) out.push({ x: 22 + col * 8, z: 44 + row * 10, id: id++ });
  return out;
})();
export const B01 = { x: 24, z: 30 };
export const B02 = { x: 34, z: 30 };
export const TOWER = { w: 6, d: 4.4, h: 26 };
// 视线目标
export const PARKS = [
  { name: "和园", x: 8, z: 22, w: 16, d: 14 },
  { name: "谐园", x: -8, z: 34, w: 12, d: 10 },
];
