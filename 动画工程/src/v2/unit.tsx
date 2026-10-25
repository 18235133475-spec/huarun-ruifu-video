// v2 立体户型：剖切模型 + 新软装 + 剪影小人；聚焦着色见 unitdress.ts。
import React, { useEffect, useMemo, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import * as THREE from "three";
import { useWorld } from "../world";
import { FocusU, dressUnit, patchFocus } from "../unitdress";
import { CamFrom } from "./geo";
import { REFINE_UNIT, bake } from "./data";
import { P, SANS } from "./theme";

export type Plan = { width: number; depth: number; rooms: { id: string; name: string; category: string; polygon: number[][] }[] };
export const usePlan = () => {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [h] = useState(() => delayRender("plan"));
  useEffect(() => { fetch(staticFile("style/unit_plan.json")).then((r) => r.json()).then((j) => { setPlan(j); continueRender(h); }); }, [h]);
  return plan;
};
export const cen = (poly: number[][]) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
};
export const ZONE: Record<string, { fill: string; ink: string; n: number; time: string; text: string }> = {
  living: { fill: "#B9D29C", ink: P.greenInk, n: 1, time: "下午 · 客厅", text: "面向和园，园子在抬眼的方向" },
  dining: { fill: "#EDC3A4", ink: P.hero, n: 2, time: "傍晚 · 餐厅", text: "一张圆桌，看着同一个太原的两面" },
  tea: { fill: "#B5D2DF", ink: P.waterInk, n: 3, time: "入夜 · 茶区", text: "窗外换成城市的灯和汾河" },
};
export const ROOM_LABEL: Record<string, string> = { master: "主卧", wardrobe: "衣帽间", master_bath: "主卫", entry: "玄关", bed_center: "主卧", bed_west: "卧室", kitchen: "厨房", multi: "多功能区", core: "公共交通核" };
export const U_SCALE = 0.75, U_CUT = 1.5 * U_SCALE; // 墙顶高度（米）
export const U_X = 14.4; // 纵线：贯穿客厅、餐厅、茶区，略偏西，避开餐桌和茶桌（户型东向坐标）
export const uz = (yFromNorth: number) => yFromNorth - 17.9; // 平面“距北边”坐标 → 户型 z（北为负）

/** 房间地面的中性底色（不讲解时） */
export const floorBase = (id: string) => (id === "core" ? "#E4DED4" : /^ledge/.test(id) ? "#E7E1D6" : /bath|kitchen|housekeeping|storage/.test(id) ? "#EEE8DE" : "#F3EDE3"); // 阳台已和多功能区打通，按室内铺
export const HIDE_FURN = /^(furn_(living_|dining_|tea_|multi_|core_|master_bed$|bed_(east|west|center)_bed$|wardrobe_|bed_east_wardrobe$|housekeeping_)|wall_partition_w(0[89]|15)_01$)/; // 换成新软装的旧家具、楼梯电梯体块，以及多功能区和阳台之间的隔墙（实际可打通成一整间）
/** 精细化户型（refine_v1 F 包）：材质名 → 本片室内色（取自 unitdress.ts 的软装色） */
const FC: Record<string, string> = { unit_wall: "#FBF9F4", floor_wood: "#E9DCC6", floor_stone: "#EEE8DE", wood: "#C8A27E", wood_dark: "#94735A", oak: "#CDAA80", fabric_oat: "#E8DECF", linen: "#F4EEE4", fabric_sage: "#B7C4A5", fabric_blue: "#A9BDC8", fabric_clay: "#D9A383",
  rug: "#E4D5BE", white: "#FBF9F4", counter: "#D9D3C9", metal_gold: "#D8B77A", ink: "#3E3A36", mirror: "#C9D8DE", window_glass: "#CFE3EA", leaf: "#7FA06A", pot: "#CDB79C", stone: "#D9D3C9", bench: "#B98D62", lamp: "#6F665C", light: "#FFE6B8", glass: "#CFE3EA" };
const buildRefined = (u: FocusU) => {
  const R = bake!.refine!;
  const root = R.unit.clone(true), furn = R.furnish.clone(true);
  const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), U_CUT + 0.01)];
  const mats = new Map<string, THREE.Material>();
  const matOf = (n: string, cut = false) => { const k = n + (cut ? "|cut" : ""); if (!mats.has(k)) mats.set(k, patchFocus(new THREE.MeshLambertMaterial({ color: FC[n] ?? "#FFFFFF" }), u, cut)); return mats.get(k)!; };
  const floors: Record<string, THREE.MeshLambertMaterial> = {};
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const nm = (m.material as THREE.Material).name; m.castShadow = m.receiveShadow = true;
    if (nm !== "window_glass" && nm !== "glass") { // 墙、门、窗框、电梯按真实 2.9m 建：在 1.5m（压缩前）处压平，墙顶仍是封闭的深色剖切面
      m.geometry = m.geometry.clone(); const pa = m.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) > 1.5) pa.setY(i, 1.5);
      pa.needsUpdate = true; m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
    }
    if (nm === "window_glass" || nm === "glass") { const g = patchFocus(new THREE.MeshLambertMaterial({ color: "#CFE3EA", transparent: true, opacity: 0.45 }), u); g.clippingPlanes = clip; m.material = g; m.castShadow = false; return; }
    if (m.name.startsWith("floor_")) { const id = m.name.slice(6); floors[id] ??= patchFocus(new THREE.MeshLambertMaterial({ color: ZONE[id]?.fill ?? floorBase(id) }), u) as THREE.MeshLambertMaterial; m.material = floors[id]; return; }
    m.material = matOf(nm, nm === "unit_wall");
  });
  furn.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.material = matOf((m.material as THREE.Material).name); m.castShadow = m.receiveShadow = true; });
  const g = new THREE.Group(); g.add(root); g.scale.y = U_SCALE; g.updateMatrixWorld(true);
  let floorY = 0;
  root.traverse((o) => { if (o.name === "floor_living") floorY = new THREE.Box3().setFromObject(o).max.y; });
  const fg = new THREE.Group(); fg.add(furn); fg.scale.y = U_SCALE; // 软装和户型同一套坐标（y=0 为地面）
  const all = new THREE.Group();
  const lifts = dressUnit(floorY, u).getObjectByName("lift_doors"); // 电梯门仍由动画端控制开合
  all.add(g, fg); if (lifts) all.add(lifts);
  return { group: all, floorY, floors };
};
export const buildUnit = (src: THREE.Object3D, u: FocusU) => {
  if (REFINE_UNIT && bake?.refine) return buildRefined(u);
  const root = src.clone(true);
  const clip = [new THREE.Plane(new THREE.Vector3(0, -1, 0), U_CUT + 0.01)];
  const lam = (c: string, cut = false) => patchFocus(new THREE.MeshLambertMaterial({ color: c }), u, cut);
  const wallMat = lam("#FBF9F4", true), furnMat = lam("#FFFFFF"), baseMat = lam("#E2DACD");
  const floors: Record<string, THREE.MeshLambertMaterial> = {}; // 每间房一份地面材质，镜头里按讲解改颜色
  const hide: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (HIDE_FURN.test(o.name)) hide.push(o);
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    let p: THREE.Object3D | null = m; while (p && !/^(floor_|room_|wall_|furn_|window_|enclosure|unit_baseplate)/.test(p.name)) p = p.parent;
    const n = p?.name ?? "";
    const old = m.material as THREE.Material;
    m.castShadow = m.receiveShadow = true;
    if (old.name === "glass") { const g = patchFocus(new THREE.MeshLambertMaterial({ color: "#CFE3EA", transparent: true, opacity: 0.45 }), u); g.clippingPlanes = clip; m.material = g; m.castShadow = false; return; }
    if (n.startsWith("floor_")) {
      const id = n.slice(6);
      const c = ZONE[id]?.fill ?? floorBase(id);
      floors[id] ??= lam(c) as THREE.MeshLambertMaterial;
      m.material = floors[id];
      return;
    }
    if (n.startsWith("furn_")) { m.material = furnMat; return; }
    if (n === "unit_baseplate") { m.material = baseMat; return; }
    m.material = wallMat;
  });
  hide.forEach((o) => (o.visible = false));
  const g = new THREE.Group(); g.add(root); g.scale.y = U_SCALE;
  g.updateMatrixWorld(true);
  let floorY = 0;
  root.traverse((o) => { if (o.name === "floor_living") floorY = new THREE.Box3().setFromObject(o).max.y; });
  const all = new THREE.Group();
  // 多功能区和阳台之间拆掉隔墙后留下的一条地面缝：补一条地面，用多功能区的地面材质（铺色时一起变）
  if (floors.multi) { const strip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 3.5), floors.multi); strip.position.set(20.62, floorY - 0.008, uz(3.55)); strip.receiveShadow = true; all.add(strip); }
  all.add(g, dressUnit(floorY, u));
  return { group: all, floorY, floors };
};

export const UnitScene: React.FC<{ cam: THREE.PerspectiveCamera; unit: THREE.Object3D; people: THREE.Object3D[] }> = ({ cam, unit, people }) => (
  <>
    <CamFrom cam={cam} />
    <color attach="background" args={[P.paper]} />
    <ambientLight intensity={1.5} />
    <directionalLight position={[2, 30, 14]} intensity={1.45} color="#fff6ea" castShadow shadow-mapSize={[4096, 4096]}
      shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-near={1} shadow-camera-far={80} shadow-bias={-0.0003} shadow-normalBias={0.02}>
      <object3D attach="target" position={[11.4, 0, -9]} />
    </directionalLight>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[11.4, -0.06, -9]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <shadowMaterial opacity={0.12} />
    </mesh>
    <primitive object={unit} />
    {people.map((p, i) => <primitive key={i} object={p} />)}
  </>
);

/** 角落的小总图：瑞府地块 + 1、2号楼（和区域底图同色，提示“我们在哪”） */
export const KeyMap: React.FC<{ x: number; y: number; size: number }> = ({ x, y, size }) => {
  const w = useWorld();
  const [fp, setFp] = useState<any[] | null>(null);
  const [h] = useState(() => delayRender("fp"));
  useEffect(() => { fetch(staticFile("style/ruifu_footprints.json")).then((r) => r.json()).then((j) => { setFp(j.features); continueRender(h); }); }, [h]);
  if (!fp) return null;
  // 只取地块北段（1、2号楼一带），放大到能看清楼栋
  const box = { x0: 40, x1: 330, z0: 610, z1: 900 };
  const k = size / (box.x1 - box.x0);
  const pth = (poly: number[][]) => poly.map(([px, pz], i) => `${i ? "L" : "M"}${((px - box.x0) * k).toFixed(1)},${((pz - box.z0) * k).toFixed(1)}`).join(" ") + " Z";
  return (
    <div style={{ position: "absolute", left: x, top: y, fontFamily: SANS, fontSize: 17, color: P.ink2 }}>
      <svg width={size} height={(box.z1 - box.z0) * k} style={{ display: "block", overflow: "hidden", borderRadius: 4 }}>
        <rect width="100%" height="100%" fill={P.ground} />
        <path d={pth(w.site)} fill={P.site} stroke={P.line} strokeWidth={1.5} />
        {fp.map((f) => {
          const ring = f.geometry.coordinates[0].map((c: number[]) => [c[0], c.length > 2 ? c[2] : c[1]]);
          const id = f.properties.node_name;
          return <path key={id} d={pth(ring)} fill={id === "ruifu_b01" || id === "ruifu_b02" ? P.hero : "#D2CABD"} />;
        })}
      </svg>
      <div style={{ marginTop: 10 }}><span style={{ color: P.hero, fontWeight: 600 }}>1号、2号楼</span> · 同一户型</div>
    </div>
  );
};

// 讲到哪里亮哪里：聚焦框在“纵线三段 → 客厅 → 餐厅 → 茶区 → 纵线三段”之间切换，框外向纸色褪去

// 聚焦框（平面坐标 x0, y0, x1, y1）和对应的推近机位
export const PY = { all: [11.5, 1.9, 18.8, 15.83], living: [11.5, 9.18, 18.8, 15.83], dining: [11.5, 5.2, 18.8, 9.18], tea: [13.45, 1.9, 18.8, 5.2] } as const;
export type FocusKey = keyof typeof PY;
