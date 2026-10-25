// 模型粗片的真实世界：建模交付的地形、城市、水面、文化岛、五馆、瑞府楼栋、户型沙盘。
// 资源在模块加载时读一次（Main 里 waitForWorld 等它读完），每个镜头的画布各自克隆一份，互不干扰。
// 坐标：米；+X 东，+Y 上，+Z 南；原点是山西大剧院形心。
import React, { useMemo } from "react";
import { continueRender, delayRender, staticFile, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import { mixColor } from "./lib";

type XZ = [number, number];
const GROUND_Y = -1.5; // 城内地面、建筑底面
export const PLATFORM_H = 6; // 文化岛平台抬升高度（动画参数，非实测）

// ---------- 读取 ----------
const json = async (p: string) => (await fetch(staticFile(p))).json();
const shapeOf = (poly: number[][]) => {
  const s = new THREE.Shape();
  poly.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  return s;
};
const flatToWorld = new THREE.Matrix4().makeRotationX(-Math.PI / 2); // ShapeGeometry/Extrude 的 xy 平面 → 地面
const centroid = (poly: number[][]): XZ => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export type Venue = { id: string; name: string; anchor: XZ; scene: THREE.Group };
export type World = {
  islandC: XZ;
  island: number[][];
  terrain: THREE.BufferGeometry;
  city: THREE.BufferGeometry; // 带 aDist、aRand 属性，供生长和亮灯着色器使用
  fen: THREE.BufferGeometry;
  inner: THREE.BufferGeometry;
  fenPoly: number[][];
  innerPoly: number[][];
  parks: { id: string; poly: number[][]; geo: THREE.BufferGeometry }[];
  roads: { cls: string; pts: XZ[] }[];
  venues: Venue[];
  ruifu: THREE.Group;
  b02: { anchor: XZ; facing: number }; // 2号楼底面中心、正面方位角（北0顺时针，度）
  site: number[][];
  unit: THREE.Group; // 户型沙盘：去吊顶、墙切到1.5米、白模
  routes: { vertical: XZ[]; horizontal: XZ[] };
  planTex: THREE.Texture;
};

const VENUE_NAMES: Record<string, string> = {
  venue_grand_theatre: "山西大剧院", venue_library: "山西省图书馆", venue_art_museum: "太原美术馆", venue_science_museum: "山西省科技馆", venue_museum: "太原博物馆",
};

const load = async (): Promise<World> => {
  const island = (await json("city/island.json")).features[0].properties.polygon as number[][];
  const islandC = centroid(island);

  // 地形：城内压平到地面以下，城外保留起伏
  const meta = await json("city/terrain.json");
  const buf = new Float32Array(await (await fetch(staticFile("city/terrain_512.f32"))).arrayBuffer());
  const n = meta.n as number;
  const sample = (x: number, z: number) => {
    const c = Math.min(n - 1, Math.max(0, Math.floor(((x - meta.x_min) / (meta.x_max - meta.x_min)) * n)));
    const r = Math.min(n - 1, Math.max(0, Math.floor(((z - meta.z_min) / (meta.z_max - meta.z_min)) * n)));
    return buf[r * n + c];
  };
  const terrain = new THREE.PlaneGeometry(meta.x_max - meta.x_min, meta.z_max - meta.z_min, n - 1, n - 1);
  terrain.rotateX(-Math.PI / 2);
  terrain.translate((meta.x_min + meta.x_max) / 2, 0, (meta.z_min + meta.z_max) / 2);
  const CITY = { x0: -2300, x1: 2900, z0: -2400, z1: 3400 };
  const tp = terrain.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const out = Math.max(CITY.x0 - x, x - CITY.x1, CITY.z0 - z, z - CITY.z1, 0);
    const k = Math.min(1, out / 800);
    tp.setY(i, GROUND_Y - 0.3 + k * (sample(x, z) - 0.8 - GROUND_Y + 0.3));
  }
  terrain.computeVertexNormals();

  // 城市：一次合并，逐顶点写入到文化岛的距离和随机数
  const bs: [number, number[][]][] = await json("city/buildings.json");
  const nearIds = new Set<number>(await json("v2/refine/city_near_ids.json")); // 精细化近景城市（refine_v1 G 包）已重做的楼：打 aNear 标记，开精细化时从白模里扣掉
  const parts: THREE.BufferGeometry[] = [];
  bs.forEach(([h, poly], i) => {
    if (poly.length < 3) return;
    const g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: h, bevelEnabled: false }).toNonIndexed();
    g.applyMatrix4(flatToWorld);
    g.translate(0, GROUND_Y, 0);
    const [cx, cz] = centroid(poly);
    const d = Math.hypot(cx - islandC[0], cz - islandC[1]);
    const cnt = g.attributes.position.count;
    g.setAttribute("aDist", new THREE.BufferAttribute(new Float32Array(cnt).fill(d), 1));
    g.setAttribute("aRand", new THREE.BufferAttribute(new Float32Array(cnt).fill(rnd(i)), 1));
    g.setAttribute("aNear", new THREE.BufferAttribute(new Float32Array(cnt).fill(nearIds.has(i) ? 1 : 0), 1));
    g.deleteAttribute("uv");
    parts.push(g);
  });
  const city = mergeGeometries(parts)!;

  const flat = (poly: number[][], y: number) => {
    const g = new THREE.ShapeGeometry(shapeOf(poly));
    g.applyMatrix4(flatToWorld);
    g.translate(0, y, 0);
    return g;
  };
  const water = (await json("city/water.json")).features;
  const fen = flat(water[0].properties.polygon, -0.6);
  const inner = flat(water[1].properties.polygon, -0.6);
  const parks = (await json("city/parks.json")).features.map((f: any) => ({ id: f.properties.source_id, poly: f.properties.polygon, geo: flat(f.properties.polygon, -1.2) }));
  const roads = (await json("city/roads.json")).features
    .filter((f: any) => ["primary", "secondary", "trunk"].includes(f.properties.class))
    .map((f: any) => ({ cls: f.properties.class, pts: f.geometry.coordinates.map((c: number[]) => [c[0], c[1]] as XZ) }));

  const loader = new GLTFLoader();
  const vm = await json("city/venue_meta.json");
  const venues: Venue[] = [];
  for (const v of vm.venues) {
    const g = await loader.loadAsync(staticFile(`city/${v.id}.glb`));
    venues.push({ id: v.id, name: VENUE_NAMES[v.id] ?? v.official_name, anchor: [v.scene_anchor_m[0], v.scene_anchor_m[2]], scene: g.scene });
  }
  const ruifu = (await loader.loadAsync(staticFile("city/ruifu.glb"))).scene;
  const rm = await json("city/ruifu_meta.json");
  const b02m = rm.buildings.find((b: any) => b.node_name === "ruifu_b02");
  const site = (await json("city/site_boundary.json")).features[0].properties.polygon ?? (await json("city/site_boundary.json")).features[0].geometry.coordinates[0];

  // 户型沙盘
  const unit = (await loader.loadAsync(staticFile("models/unit_b02.glb"))).scene;
  unit.updateMatrixWorld(true);
  const CUT = 1.5;
  const hide: THREE.Object3D[] = [];
  unit.traverse((o) => {
    if (o.name.startsWith("ceiling_") || /mullion/.test(o.name)) hide.push(o);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (/^(wall_|furn_)/.test(m.name) || /^(wall_|furn_)/.test(m.parent?.name ?? "")) {
      const box = new THREE.Box3().setFromObject(m);
      if (box.max.y > CUT + 0.02) {
        const target = /^(wall_|furn_)/.test(m.name) ? m : m.parent!;
        target.scale.y *= (CUT - box.min.y) / (box.max.y - box.min.y);
        target.updateMatrixWorld(true);
        target.position.y += box.min.y - new THREE.Box3().setFromObject(m).min.y;
        target.updateMatrixWorld(true);
      }
    }
    if ((m.material as THREE.Material).name === "glass") {
      (m.material as THREE.Material).clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT)];
    }
  });
  hide.forEach((o) => (o.visible = false));
  const pts = await json("models/unit_b02_points.json");
  const planTex = await new THREE.TextureLoader().loadAsync(staticFile("client/c00.jpg"));
  planTex.colorSpace = THREE.SRGBColorSpace; planTex.anisotropy = 8;
  const r2 = (r: any): XZ[] => (r.points ?? r).map((p: number[]) => [p[0], p[2]] as XZ);

  return {
    islandC, island, terrain, city, fen, inner, fenPoly: water[0].properties.polygon, innerPoly: water[1].properties.polygon, parks, roads, venues, ruifu, site, unit,
    b02: { anchor: [b02m.scene_anchor_m[0], b02m.scene_anchor_m[2]], facing: 217.744 },
    routes: { vertical: r2(pts.routes.vertical), horizontal: r2(pts.routes.horizontal) },
    planTex,
  };
};

let worldP: Promise<World> | null = null;
let worldV: World | null = null;
export const loadWorld = () => (worldP ??= load().then((w) => (worldV = w)));
export const waitForWorld = () => {
  if (worldV) return;
  const h = delayRender("world", { timeoutInMilliseconds: 240000 });
  loadWorld().then(() => continueRender(h));
};
export const useWorld = () => worldV as World;
export const worldReady = () => worldV !== null;

// ---------- 场景 ----------
const Rig: React.FC<{ cam: [number, number, number]; look: [number, number, number]; fov: number }> = ({ cam, look, fov }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.localClippingEnabled = true;
  const c = camera as THREE.PerspectiveCamera;
  c.position.set(...cam); c.fov = fov; c.near = Math.max(0.05, Math.hypot(cam[0] - look[0], cam[1] - look[1], cam[2] - look[2]) / 2000); c.far = 80000;
  c.lookAt(...look); c.updateProjectionMatrix();
  return null;
};
/** 米制三维场景。dark：0 奶白，1 暗场；ao：环境光遮蔽半径（米） */
export const SceneM: React.FC<{ bg: string; cam: [number, number, number]; look: [number, number, number]; fov?: number; dark: number; fog?: [number, number]; ao?: number; sun?: number; warm?: number; shadowBox?: number; children: React.ReactNode }> = ({
  bg, cam, look, fov = 34, dark, fog, ao = 25, sun = 1, warm = 0, shadowBox = 1600, children,
}) => {
  const { width, height } = useVideoConfig();
  const dist = Math.hypot(cam[0] - look[0], cam[1] - look[1], cam[2] - look[2]);
  const f = fog ?? [dist * 1.6, dist * 6];
  return (
    <ThreeCanvas width={width} height={height} shadows style={{ backgroundColor: bg }}>
      <Rig cam={cam} look={look} fov={fov} />
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, f[0], f[1]]} />
      <hemisphereLight args={[mixColor("#ffffff", "#9fb3c8", dark), mixColor("#bdb6aa", "#15181c", dark), 1.0 - 0.55 * dark]} />
      <directionalLight
        position={[look[0] - 1200, 1600, look[2] + 900]} intensity={(2.3 - 1.4 * dark) * sun} color={mixColor(mixColor("#fff4e4", "#ffcf8f", warm), "#9fb6d6", dark)} castShadow
        shadow-mapSize={[4096, 4096]} shadow-camera-left={-shadowBox} shadow-camera-right={shadowBox} shadow-camera-top={shadowBox} shadow-camera-bottom={-shadowBox}
        shadow-camera-far={6000} shadow-bias={-0.0004} shadow-normalBias={0.5}
      >
        <object3D attach="target" position={look} />
      </directionalLight>
      {children}
      {ao > 0 ? (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={ao} intensity={2} distanceFalloff={1} quality="medium" />
        </EffectComposer>
      ) : <></>}
    </ThreeCanvas>
  );
};

// ---------- 城市（生长、亮灯着色器） ----------
const WARM = new THREE.Color("#ffc977");
export const City: React.FC<{ grow?: number; lit?: number; color: string; reach?: number }> = ({ grow = 1, lit = 0, color, reach = 3600 }) => {
  const w = useWorld();
  const { mesh, uniforms } = useMemo(() => {
    const uniforms = { uGrow: { value: 1 }, uLit: { value: 0 }, uReach: { value: reach } };
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, uniforms);
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aDist; attribute float aRand; uniform float uGrow; uniform float uReach; varying float vRand; varying float vH; varying vec3 vW; varying float vSide;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float g = clamp((uGrow * 1.35 - aDist / uReach) / 0.35, 0.0, 1.0);
          vH = (transformed.y - ${GROUND_Y.toFixed(1)});
          transformed.y = ${GROUND_Y.toFixed(1)} + vH * g;
          vRand = aRand; vSide = 1.0 - abs(normal.y);
          vW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uLit; varying float vRand; varying float vH; varying vec3 vW; varying float vSide;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float row = step(0.45, fract(vH / 3.2));
          float col = step(0.35, fract((vW.x + vW.z) / 3.6));
          float cellR = fract(sin(dot(vec2(floor(vH / 3.2), floor((vW.x + vW.z) / 3.6)) + vRand * 31.0, vec2(12.9898, 78.233))) * 43758.5453);
          float bldOn = step(0.25, vRand);               // 约四分之一的楼整栋不亮
          float on = step(0.72, cellR) * bldOn;           // 亮着的窗约三成
          float warmth = 0.7 + 0.6 * fract(vRand * 13.0);
          totalEmissiveRadiance += vec3(${WARM.r.toFixed(3)}, ${WARM.g.toFixed(3)}, ${WARM.b.toFixed(3)}) * uLit * row * col * on * vSide * 1.1 * warmth;`);
    };
    const mesh = new THREE.Mesh(w.city, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }, [w, reach]);
  (mesh.material as THREE.MeshStandardMaterial).color.set(color);
  uniforms.uGrow.value = grow;
  uniforms.uLit.value = lit;
  return <primitive object={mesh} />;
};

export const Terrain: React.FC<{ color: string }> = ({ color }) => {
  const w = useWorld();
  const mesh = useMemo(() => { const m = new THREE.Mesh(w.terrain, new THREE.MeshStandardMaterial({ roughness: 1 })); m.receiveShadow = true; return m; }, [w]);
  (mesh.material as THREE.MeshStandardMaterial).color.set(color);
  return <primitive object={mesh} />;
};

/** 汾河和内河。reveal：内河从东北口沿 C 形流到东南口（0–1） */
export const Water: React.FC<{ color: string; reveal?: number; fen?: boolean; emissive?: number }> = ({ color, reveal = 1, fen = true, emissive = 0 }) => {
  const w = useWorld();
  const { fenM, innerM, u } = useMemo(() => {
    const u = { uReveal: { value: 1 }, uC: { value: new THREE.Vector2(w.islandC[0], w.islandC[1]) } };
    const mk = () => new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, emissive: color });
    const im = mk();
    im.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, u);
      s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW2;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW2 = (modelMatrix * vec4(transformed,1.0)).xyz;");
      s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW2; uniform float uReveal; uniform vec2 uC;")
        .replace("void main() {", `void main() {
          float a = degrees(atan(vW2.z - uC.y, vW2.x - uC.x));
          float p = mod(-71.0 - a + 720.0, 360.0) / 218.0;
          if (p > uReveal) discard;`);
    };
    return { fenM: new THREE.Mesh(w.fen, mk()), innerM: new THREE.Mesh(w.inner, im), u };
  }, [w]);
  u.uReveal.value = reveal;
  [fenM, innerM].forEach((m) => { const mat = m.material as THREE.MeshStandardMaterial; mat.color.set(color); mat.emissive.set(color); mat.emissiveIntensity = emissive; });
  return <group>{fen ? <primitive object={fenM} /> : null}<primitive object={innerM} /></group>;
};

export const Parks: React.FC<{ color: string; only?: string[]; opacity?: number; emissive?: number }> = ({ color, only, opacity = 1, emissive = 0 }) => {
  const w = useWorld();
  const meshes = useMemo(() => w.parks.filter((p) => !only || only.includes(p.id)).map((p) => {
    const m = new THREE.Mesh(p.geo, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, emissive: color, depthWrite: false }));
    m.receiveShadow = true; return m;
  }), [w, only?.join()]);
  meshes.forEach((m) => { const mat = m.material as THREE.MeshStandardMaterial; mat.color.set(color); mat.emissive.set(color); mat.opacity = opacity; mat.emissiveIntensity = emissive; });
  return <group>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>;
};

/** 文化岛平台：rise 0–1 抬升到 PLATFORM_H */
export const Platform: React.FC<{ rise: number; color: string; opacity?: number }> = ({ rise, color, opacity = 1 }) => {
  const w = useWorld();
  const mesh = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapeOf(w.island), { depth: 1, bevelEnabled: false });
    g.applyMatrix4(flatToWorld);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, transparent: true }));
    m.castShadow = m.receiveShadow = true;
    return m;
  }, [w]);
  (mesh.material as THREE.MeshStandardMaterial).color.set(color);
  mesh.scale.y = Math.max(0.001, GROUND_Y * -1 + PLATFORM_H * rise);
  mesh.position.y = GROUND_Y;
  (mesh.material as THREE.MeshStandardMaterial).opacity = opacity;
  return <primitive object={mesh} />;
};

/** 五馆：grow[i] 0–1 升起；platform 抬升量随平台 */
export const Venues: React.FC<{ grow?: number[]; color: string; emissive?: number; rise?: number }> = ({ grow = [1, 1, 1, 1, 1], color, emissive = 0, rise = 1 }) => {
  const w = useWorld();
  const groups = useMemo(() => w.venues.map((v) => {
    const g = v.scene.clone(true);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      const glass = (m.material as THREE.Material).name === "glass";
      m.material = glass ? new THREE.MeshStandardMaterial({ color: "#9fc3d4", roughness: 0.1, transparent: true, opacity: 0.55 }) : new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive: "#ffcf8a" });
    });
    g.position.set(v.anchor[0], 0, v.anchor[1]);
    return g;
  }), [w]);
  groups.forEach((g, i) => {
    const k = grow[i] ?? 1;
    g.visible = k > 0.005;
    g.scale.y = Math.max(0.001, k);
    g.position.y = GROUND_Y + (-GROUND_Y + PLATFORM_H) * rise;
    g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.emissive && m.opacity === 1) { m.emissiveIntensity = emissive; m.color.set(color); } });
  });
  return <group>{groups.map((g, i) => <primitive key={i} object={g} />)}</group>;
};

/** 瑞府：grow(i) 每栋升起；turn 0–1：1号、2号楼从正南正北转到最终角度；hero 1号2号楼的颜色和发光 */
export const Ruifu: React.FC<{ grow?: (i: number, name: string) => number; turn: number; color: string; hero?: string; heroGlow?: number; othersOpacity?: number }> = ({
  grow = () => 1, turn, color, hero, heroGlow = 0, othersOpacity = 1,
}) => {
  const w = useWorld();
  const { root, items } = useMemo(() => {
    const root = w.ruifu.clone(true);
    type M = { mat: THREE.MeshStandardMaterial; glass: boolean };
    const items: { o: THREE.Object3D; q: THREE.Quaternion; hero: boolean; mats: M[] }[] = [];
    root.traverse((o) => {
      if (!/^ruifu_(b\d+|t\d|s1)$/.test(o.name)) return;
      const isHero = o.name === "ruifu_b01" || o.name === "ruifu_b02";
      const mats: M[] = [];
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        const glass = (m.material as THREE.Material).name === "glass";
        const mat = new THREE.MeshStandardMaterial({ color: glass ? "#cfe3ea" : color, roughness: glass ? 0.2 : 0.85, transparent: true, emissive: "#f0b860", emissiveIntensity: 0 });
        m.material = mat; mats.push({ mat, glass });
      });
      items.push({ o, q: o.quaternion.clone(), hero: isHero, mats });
    });
    return { root, items };
  }, [w]);
  const ident = new THREE.Quaternion();
  items.forEach(({ o, q, hero: isHero, mats }, i) => {
    const k = grow(i, o.name);
    o.visible = k > 0.005;
    o.scale.y = Math.max(0.001, k);
    if (isHero) o.quaternion.copy(ident).slerp(q, turn);
    mats.forEach(({ mat, glass }) => {
      if (!glass) mat.color.set(isHero && hero ? hero : color);
      mat.emissiveIntensity = isHero ? heroGlow : 0;
      mat.opacity = isHero ? 1 : othersOpacity;
      mat.depthWrite = isHero || othersOpacity > 0.99;
    });
  });
  return <primitive object={root} />;
};

/** 户型沙盘（白模分析风格），坐标为户型局部米制 */
export const Unit: React.FC<{ color?: string }> = ({ color = "#f4f1ea" }) => {
  const w = useWorld();
  const root = useMemo(() => {
    const r = w.unit.clone(true);
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      const old = m.material as THREE.Material;
      m.material = old.name === "glass"
        ? Object.assign(new THREE.MeshStandardMaterial({ color: "#dfeef2", transparent: true, opacity: 0.2, roughness: 0.05 }), { clippingPlanes: old.clippingPlanes })
        : new THREE.MeshStandardMaterial({ color: /^floor_/.test(m.name) ? "#ebe6dc" : color, roughness: 0.9 });
    });
    return r;
  }, [w, color]);
  return <primitive object={root} />;
};

/** 地面金色发光线（米制），k 画到多少 */
export const Line: React.FC<{ pts: XZ[]; k: number; color: string; width: number; y?: number; opacity?: number }> = ({ pts, k, color, width, y = 0.2, opacity = 1 }) => {
  const seg = useMemo(() => { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return s; }, [pts]);
  if (k <= 0) return null;
  const upto = seg[seg.length - 1] * Math.min(1, k);
  const out: XZ[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (seg[i] <= upto) out.push(pts[i]);
    else { const f = (upto - seg[i - 1]) / (seg[i] - seg[i - 1] || 1); out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]); break; }
  }
  return (
    <group>
      {out.slice(1).map((p, i) => {
        const a = out[i], len = Math.hypot(p[0] - a[0], p[1] - a[1]);
        if (len < 0.01) return null;
        return (
          <mesh key={i} position={[(a[0] + p[0]) / 2, y, (a[1] + p[1]) / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(p[1] - a[1], p[0] - a[0])]}>
            <planeGeometry args={[len + width * 0.6, width]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
};

/** 总平面贴图按配准参数精确落到地块上（镜11） */
export const SitePlan: React.FC<{ lift: number; spin: number; opacity: number }> = ({ lift, spin, opacity }) => {
  const tex = useWorld().planTex;
  const geo = useMemo(() => {
    const W = 2362, H = 3071, a = 0.347281292085, b = -0.00161521608, tx = -296.200168625, tz = 554.102675583;
    const P = (u: number, v: number) => [a * u - b * v + tx, b * u + a * v + tz];
    const c = [P(0, 0), P(W, 0), P(W, H), P(0, H)];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([c[0][0], 0, c[0][1], c[1][0], 0, c[1][1], c[2][0], 0, c[2][1], c[3][0], 0, c[3][1]], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, []);
  const ctr = useMemo(() => { geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox!.getCenter(c); return c; }, [geo]);
  return (
    <group position={[ctr.x, lift, ctr.z]} rotation={[0, spin, 0]}>
      <mesh geometry={geo} position={[-ctr.x, 0.3, -ctr.z]}>
        <meshBasicMaterial map={tex} transparent opacity={opacity} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
};
