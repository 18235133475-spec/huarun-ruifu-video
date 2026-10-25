// 节点2/3验收用：把建模交付的地形、真实城市、文化岛平台、水面、五馆体块合到一个场景里看效果。不进成片。
import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer, N8AO } from "@react-three/postprocessing";

type View = { label: string; pos: [number, number, number]; look: [number, number, number]; fov: number; dark: boolean; turned?: boolean };
const VIEWS: View[] = [
  { label: "① 暗场：西山—汾河谷地全景（开场基调）", pos: [-9000, 4200, 9000], look: [-2500, 0, -500], fov: 35, dark: true },
  { label: "② 暗场：文化岛与五馆（造岛段）", pos: [-900, 650, 1200], look: [80, 0, 80], fov: 32, dark: true },
  { label: "③ 奶白：瑞府—文化岛—汾河（转身段）", pos: [-700, 520, 1900], look: [120, 0, 600], fov: 34, dark: false },
  { label: "④ 奶白：五馆近景", pos: [-420, 180, 420], look: [40, 10, 60], fov: 34, dark: false },
  { label: "⑤ 镜12：瑞府正南正北立起", pos: [-520, 420, 1450], look: [170, 30, 840], fov: 30, dark: false, turned: false },
  { label: "⑥ 镜13：1号、2号楼转身之后", pos: [-520, 420, 1450], look: [170, 30, 840], fov: 30, dark: false, turned: true },
  { label: "⑦ 镜13俯视：转身角度一目了然", pos: [180, 900, 790], look: [180, 0, 789], fov: 30, dark: false, turned: true },
];

type TerrainMeta = { n: number; x_min: number; x_max: number; z_min: number; z_max: number };
type Assets = { terrain: THREE.Mesh; city: THREE.Mesh; water: THREE.Mesh; island: THREE.Mesh; venues: THREE.Group; ruifu: THREE.Group; turners: { o: THREE.Object3D; q: THREE.Quaternion }[]; sample: (x: number, z: number) => number };

const shapeOf = (poly: number[][]) => {
  const s = new THREE.Shape();
  poly.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  return s;
};
// ExtrudeGeometry 在 xy 平面挤出，转成 y 向上：绕 x 轴转 -90°，shape 里的 y 用 -z 存
const flatToWorld = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

const load = async (): Promise<Assets> => {
  const meta: TerrainMeta = await (await fetch(staticFile("city/terrain.json"))).json();
  const buf = new Float32Array(await (await fetch(staticFile("city/terrain_512.f32"))).arrayBuffer());
  const n = meta.n;
  const sample = (x: number, z: number) => {
    const c = Math.min(n - 1, Math.max(0, Math.floor(((x - meta.x_min) / (meta.x_max - meta.x_min)) * n)));
    const r = Math.min(n - 1, Math.max(0, Math.floor(((z - meta.z_min) / (meta.z_max - meta.z_min)) * n)));
    return buf[r * n + c];
  };
  // 地形网格：行0在北（z_min）
  const tg = new THREE.PlaneGeometry(meta.x_max - meta.x_min, meta.z_max - meta.z_min, n - 1, n - 1);
  tg.rotateX(-Math.PI / 2);
  tg.translate((meta.x_min + meta.x_max) / 2, 0, (meta.z_min + meta.z_max) / 2);
  const p = tg.attributes.position;
  // 城市范围内把地形压到所有平面图层之下（-1.5米），城外保留真实起伏，边缘800米渐变
  const CITY = { x0: -2300, x1: 2900, z0: -2400, z1: 3400 };
  const outside = (x: number, z: number) => Math.max(CITY.x0 - x, x - CITY.x1, CITY.z0 - z, z - CITY.z1, 0);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), k = Math.min(1, outside(x, z) / 800);
    p.setY(i, -1.5 + k * (sample(x, z) - 0.8 + 1.5));
  }
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
  terrain.receiveShadow = true;

  const bs: [number, number[][]][] = await (await fetch(staticFile("city/buildings.json"))).json();
  const parts: THREE.BufferGeometry[] = [];
  for (const [h, poly] of bs) {
    if (poly.length < 3) continue;
    const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: h, bevelEnabled: false });
    g.applyMatrix4(flatToWorld);
    const cx = poly.reduce((a, q) => a + q[0], 0) / poly.length, cz = poly.reduce((a, q) => a + q[1], 0) / poly.length;
    g.translate(0, -1.5, 0);
    parts.push(g.toNonIndexed());
  }
  const city = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }));
  city.castShadow = city.receiveShadow = true;

  const flat = async (file: string, y: number) => {
    const d = await (await fetch(staticFile(`city/${file}`))).json();
    const geos: THREE.BufferGeometry[] = [];
    for (const f of d.features) {
      const poly: number[][] = f.properties?.polygon ?? f.polygon ?? f.geometry?.coordinates?.[0];
      if (!poly) continue;
      const g = new THREE.ShapeGeometry(shapeOf(poly));
      g.applyMatrix4(flatToWorld); g.translate(0, y, 0);
      geos.push(g.toNonIndexed());
    }
    return mergeGeometries(geos);
  };
  const water = new THREE.Mesh(await flat("water.json", -0.6), new THREE.MeshStandardMaterial({ color: "#3fa7d6", roughness: 0.2 }));
  const island = new THREE.Mesh(await flat("island.json", 0.4), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1 }));
  island.receiveShadow = true;

  const venues = new THREE.Group();
  const vm = await (await fetch(staticFile("city/venue_meta.json"))).json();
  for (const v of vm.venues) {
    const g = await new GLTFLoader().loadAsync(staticFile(`city/${v.id}.glb`));
    g.scene.position.set(v.scene_anchor_m[0], 0.4, v.scene_anchor_m[2]);
    g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
    venues.add(g.scene);
  }
  const rg = await new GLTFLoader().loadAsync(staticFile("city/ruifu.glb"));
  const turners: { o: THREE.Object3D; q: THREE.Quaternion }[] = [];
  rg.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    if (o.name === "ruifu_b01" || o.name === "ruifu_b02") turners.push({ o, q: o.quaternion.clone() });
  });
  return { terrain, city, water, island, venues, ruifu: rg.scene, turners, sample };
};

const Rig: React.FC<{ v: View; ready: boolean }> = ({ v, ready }) => {
  const { camera, gl, advance } = useThree();
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap;
  const c = camera as THREE.PerspectiveCamera;
  c.position.set(...v.pos); c.fov = v.fov; c.near = 5; c.far = 60000; c.lookAt(...v.look); c.updateProjectionMatrix();
  useEffect(() => { if (ready) { advance(performance.now()); const t = setTimeout(() => advance(performance.now()), 300); return () => clearTimeout(t); } }, [ready, advance]);
  return null;
};

export const CityTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const v = VIEWS[Math.min(frame, VIEWS.length - 1)];
  const [a, setA] = useState<Assets | null>(null);
  const [handle] = useState(() => delayRender("city assets", { timeoutInMilliseconds: 120000 }));
  useEffect(() => { load().then((x) => { setA(x); setTimeout(() => continueRender(handle), 1500); }); }, [handle]);
  if (a) {
    const set = (m: THREE.Mesh, c: string) => (m.material as THREE.MeshStandardMaterial).color.set(c);
    set(a.terrain, v.dark ? "#2a2f35" : "#e9e4da");
    set(a.city, v.dark ? "#4a525b" : "#f6f3ec");
    set(a.island, v.dark ? "#59616a" : "#fbfaf6");
    set(a.water, v.dark ? "#1f6f96" : "#8cc6df");
    a.turners.forEach(({ o, q }) => (v.turned === false ? o.quaternion.identity() : o.quaternion.copy(q)));
    a.ruifu.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.color && m.name !== "glass") m.color.set("#ffffff"); });
    a.turners.forEach(({ o }) => o.traverse((c) => { const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.color && m.name !== "glass") { m.color.set("#f3dcb4"); } }));
    a.venues.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.color && m.name !== "glass") m.color.set(v.dark ? "#d9b46a" : "#ffffff"); });
  }
  const bg = v.dark ? "#0d1013" : "#efeae1";
  return (
    <AbsoluteFill style={{ background: bg }}>
      <ThreeCanvas width={width} height={height} shadows>
        <Rig v={v} ready={!!a} />
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={[bg, v.dark ? 6000 : 2500, v.dark ? 26000 : 9000]} />
        <hemisphereLight args={["#ffffff", v.dark ? "#202428" : "#bdb6aa", v.dark ? 0.5 : 1.0]} />
        <directionalLight position={[-3000, 4000, 2500]} intensity={v.dark ? 1.2 : 2.2} color={v.dark ? "#ffd7a0" : "#fff4e4"} castShadow
          shadow-mapSize={[4096, 4096]} shadow-camera-left={-2500} shadow-camera-right={2500} shadow-camera-top={2500} shadow-camera-bottom={-2500} shadow-camera-far={12000} shadow-bias={-0.0005} />
        {a && <primitive object={a.terrain} />}
        {a && <primitive object={a.water} />}
        {a && <primitive object={a.island} />}
        {a && <primitive object={a.city} />}
        {a && <primitive object={a.venues} />}
        {a && <primitive object={a.ruifu} />}
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={30} intensity={2} distanceFalloff={1} quality="medium" />
        </EffectComposer>
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 40, top: 30, fontSize: 30, fontFamily: "PingFang SC", color: v.dark ? "#fff" : "#333", background: v.dark ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.75)", padding: "6px 16px", borderRadius: 8 }}>{v.label}</div>
    </AbsoluteFill>
  );
};
