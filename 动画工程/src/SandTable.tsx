// 户内剖切沙盘的质感样图：去吊顶、墙切到1.5米、按房间“长出材质”、柔光加阴影。
// 模型没有贴图坐标，这里按世界坐标做盒式投影生成 UV。
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import { GlowLine } from "./lib";

const CUT = 1.5; // 剖切高度（米）
const CENTER = new THREE.Vector3(11.4, 0, -8.95);
const PUBLIC_ROOMS = new Set(["living", "dining", "tea"]); // “长出材质”中间态：纵线上的三个空间
const VERTICAL: [number, number][] = [[16.3, -2.27], [16.3, -10.71], [16.3, -15.7]];

type Shot = { label: string; pos: [number, number, number]; look: [number, number, number]; fov: number; mode: "white" | "mid" | "full"; line: boolean };
const SHOTS: Shot[] = [
  { label: "① 白模沙盘", pos: [-11, 24, 15], look: [11.4, -0.8, -8.6], fov: 30, mode: "white", line: false },
  { label: "② 纵线点亮，公区长出材质", pos: [-11, 24, 15], look: [11.4, -0.8, -8.6], fov: 30, mode: "mid", line: true },
  { label: "③ 全部长出材质", pos: [-11, 24, 15], look: [11.4, -0.8, -8.6], fov: 30, mode: "full", line: false },
  { label: "④ 近景：客厅—餐厅—茶区", pos: [7.5, 8.2, 5.5], look: [15.2, 0, -8.5], fov: 38, mode: "full", line: true },
];

const pending: Promise<unknown>[] = [];
const tex = (name: string, size: number, srgb: boolean) => {
  let done: (v: unknown) => void = () => {};
  pending.push(new Promise((r) => (done = r)));
  const t = new THREE.TextureLoader().load(staticFile(`tex/${name}`), done, undefined, done);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const pbr = (base: string, size: number, tint: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({
    map: tex(`${base}_2k_color.jpg`, size, true),
    normalMap: tex(`${base}_2k_normal.jpg`, size, false),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: tex(`${base}_2k_roughness.jpg`, size, false),
    color: tint,
    ...extra,
  });

// 盒式投影 UV：水平面用 xz，竖直面按法线取 xy 或 zy（单位：米）
const boxUV = (mesh: THREE.Mesh) => {
  const g = mesh.geometry as THREE.BufferGeometry;
  const p = g.attributes.position, n = g.attributes.normal;
  const m = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m);
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(m);
    w.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
    const [a, b] = Math.abs(w.y) > 0.5 ? [v.x, v.z] : Math.abs(w.x) > Math.abs(w.z) ? [v.z, v.y] : [v.x, v.y];
    uv[i * 2] = a; uv[i * 2 + 1] = b;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
};

const roomOf = (o: THREE.Object3D): string | null => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name.startsWith("room_")) return p.name.slice(5);
  return null;
};

type Prepared = { root: THREE.Group; swap: (mode: Shot["mode"]) => void };

const prepare = (root: THREE.Group): Prepared => {
  root.updateMatrixWorld(true);
  const M = {
    white: new THREE.MeshStandardMaterial({ color: "#f1eee8", roughness: 0.92 }),
    whiteFurn: new THREE.MeshStandardMaterial({ color: "#f6f4ef", roughness: 0.85 }),
    wall: pbr("wall_plaster002", 2.5, "#f4f1ea", { roughness: 0.95 }),
    // 现有木纹偏灰绿偏暗，按线性空间提亮成浅橡木色；正式版换新木地板
    wood: pbr("wood_woodfloor001", 2.4, new THREE.Color().setRGB(2.2, 1.85, 1.6), { roughness: 0.55 }),
    stone: pbr("stone_marble004", 1.6, "#ffffff", { roughness: 0.35 }),
    fabric: pbr("fabric_fabric032", 0.8, "#e3d6c2", { roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#dfeef2", roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.18, metalness: 0 }),
  };
  const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT)];
  const meshes: { mesh: THREE.Mesh; finished: THREE.Material; room: string | null }[] = [];
  const toHide: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith("ceiling_")) toHide.push(o);
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const slot = (mesh.material as THREE.Material).name;
    const node = mesh.name.startsWith("wall_") || mesh.name.startsWith("window_") || mesh.name.startsWith("furn_") || mesh.name.startsWith("floor_") ? mesh.name : mesh.parent?.name ?? "";
    mesh.castShadow = true; mesh.receiveShadow = true;
    // 高于剖切面的墙和家具：以底面为基准压低到剖切高度
    if (node.startsWith("wall_") || node.startsWith("furn_")) {
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.max.y > CUT + 0.02) {
        const k = (CUT - box.min.y) / (box.max.y - box.min.y);
        const target = mesh.name === node ? mesh : mesh.parent!;
        target.scale.y *= k;
        target.updateMatrixWorld(true);
        const nb = new THREE.Box3().setFromObject(mesh);
        target.position.y += box.min.y - nb.min.y;
        target.updateMatrixWorld(true);
      }
    }
    boxUV(mesh);
    let finished: THREE.Material;
    if (slot === "glass") { finished = M.glass.clone(); (finished as THREE.Material).clippingPlanes = clip; mesh.castShadow = false; }
    else if (node.startsWith("window_") && /mullion/.test(node)) { toHide.push(mesh); finished = M.white; }
    else if (node.startsWith("window_")) { finished = M.white.clone(); finished.clippingPlanes = clip; }
    else if (slot === "wood_floor") finished = M.wood;
    else if (slot === "stone_floor") finished = M.stone;
    else if (slot === "fabric") finished = M.fabric;
    else if (node.startsWith("wall_")) finished = M.wall;
    else if (node.startsWith("furn_")) finished = M.whiteFurn;
    else finished = M.white;
    meshes.push({ mesh, finished, room: roomOf(mesh) });
  });
  toHide.forEach((o) => (o.visible = false));
  const whiteFor = (f: THREE.Material) => {
    if (f === M.glass || (f as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return f;
    if (f.clippingPlanes) return f;
    return M.white;
  };
  return {
    root,
    swap: (mode) => {
      for (const { mesh, finished, room } of meshes) {
        const isWall = mesh.name.startsWith("wall_") || mesh.parent?.name.startsWith("wall_");
        const grown = mode === "full" || (mode === "mid" && room !== null && PUBLIC_ROOMS.has(room));
        mesh.material = isWall ? (mode === "white" ? M.white : M.wall) : grown ? finished : whiteFor(finished);
      }
    },
  };
};

const Rig: React.FC<{ shot: Shot; env: THREE.Texture | null; ready: boolean }> = ({ shot, env, ready }) => {
  const { camera, gl, scene, advance } = useThree();
  // Remotion 的画布不自动循环，贴图上传后要手动多画两帧，否则可能截到贴图还没上屏的画面
  useEffect(() => {
    if (!ready) return;
    advance(performance.now());
    const t = setTimeout(() => advance(performance.now()), 250);
    return () => clearTimeout(t);
  }, [ready, advance]);
  gl.localClippingEnabled = true;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.05;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  const c = camera as THREE.PerspectiveCamera;
  c.position.set(...shot.pos); c.fov = shot.fov; c.near = 0.1; c.far = 300; c.lookAt(...shot.look); c.updateProjectionMatrix();
  return null;
};

export const SandTable: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const shot = SHOTS[Math.min(frame, SHOTS.length - 1)];
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [env, setEnv] = useState<THREE.Texture | null>(null);
  const [handle] = useState(() => delayRender("sandtable assets"));
  const [ready, setReady] = useState(false);
  useEffect(() => { if (ready) { const t = setTimeout(() => continueRender(handle), 900); return () => clearTimeout(t); } }, [ready, handle]);
  useEffect(() => {
    // 模型、全部贴图、环境光照都到位后，再等一小会儿让画面重绘，最后放行渲染
    const glb = new Promise<void>((r) => new GLTFLoader().load(staticFile("models/unit_b02.glb"), (g) => { setPrep(prepare(g.scene)); r(); }));
    const hdr = new Promise<void>((r) => new RGBELoader().load(staticFile("tex/hdri_indoor_day_2k.hdr"), (t) => { t.mapping = THREE.EquirectangularReflectionMapping; setEnv(t); r(); }));
    Promise.all([glb, hdr]).then(() => Promise.all(pending)).then(() => setReady(true));
  }, [handle]);
  if (prep) prep.swap(shot.mode);
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight("#fff3e2", 2.4);
    l.position.set(CENTER.x - 14, 22, CENTER.z + 16);
    l.target.position.copy(CENTER);
    l.castShadow = true;
    l.shadow.mapSize.set(4096, 4096);
    Object.assign(l.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; l.shadow.radius = 6;
    return l;
  }, []);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, #f7f4ee 0%, #e9e4db 70%, #ddd6ca 100%)" }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true, alpha: true }} shadows>
        <Rig shot={shot} env={env} ready={ready} />
        <hemisphereLight args={["#fffaf2", "#cfc7ba", 0.6]} />
        <primitive object={sun} />
        <primitive object={sun.target} />
        {/* 悬浮沙盘下方的投影 */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTER.x, -1.6, CENTER.z]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <shadowMaterial opacity={0.16} />
        </mesh>
        {prep && <primitive object={prep.root} />}
        {shot.line && <GlowLine pts={VERTICAL} k={1} color="#e9b45a" y={0.06} width={0.16} />}
        {shot.line && VERTICAL.map(([x, z], i) => (
          <mesh key={i} position={[x, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.32, 40]} />
            <meshBasicMaterial color="#e9b45a" toneMapped={false} />
          </mesh>
        ))}
        {/* 环境光遮蔽：墙角、家具脚下的柔和暗部，让体块“落地” */}
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={0.9} intensity={2.2} distanceFalloff={0.6} quality="high" />
        </EffectComposer>
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 40, top: 30, fontSize: 30, fontFamily: "PingFang SC", color: "#3a3530", background: "rgba(255,255,255,.75)", padding: "6px 16px", borderRadius: 8 }}>{shot.label}</div>
    </AbsoluteFill>
  );
};
