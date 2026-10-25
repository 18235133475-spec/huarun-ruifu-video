// v2 数据预载：世界（world.tsx）和道路一起读完再渲染，否则会赶不上截帧。
import { useEffect, useState } from "react";
import { continueRender, delayRender, getInputProps, staticFile } from "remotion";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadWorld, waitForWorld, worldReady } from "../world";
import { XZ } from "./geo";

/** 道路：按等级给宽度，合并成一张带状网格。和城市数据一起预先读好，否则会赶不上截帧 */
export let roadsGeo: THREE.BufferGeometry | null = null;
export let roadsP: Promise<THREE.BufferGeometry> | null = null;
/** 道路原始要素（场景米制折线 + 等级），近景路面细节和车流用 */
export let roadFeat: { properties: { class: string; source_id: string }; geometry: { coordinates: XZ[] } }[] | null = null;
export const loadRoads = () => (roadsP ??= fetch(staticFile("city/roads.json")).then((r) => r.json()).then((j) => {
  roadFeat = j.features;
  const W: Record<string, number> = { trunk: 26, primary: 20, secondary: 14, tertiary: 8 };
  const parts: THREE.BufferGeometry[] = [];
  for (const f of j.features) {
    const w = W[f.properties.class]; if (!w) continue;
    const pts: XZ[] = f.geometry.coordinates;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
      const g = new THREE.PlaneGeometry(len + w * 0.5, w);
      g.rotateX(-Math.PI / 2); g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, -1.0, (az + bz) / 2);
      parts.push(g);
    }
  }
  return (roadsGeo = mergeGeometries(parts));
}));
export const useRoads = () => roadsGeo;

/** 全片模型精细化（HR-VIDEO-TASK-007，建模交付 视频/模型/refine_v1/）：渲染时 --props='{"refine":true}' 打开；不传则是 v9 原样 */
export const REFINE = (getInputProps() as { refine?: boolean }).refine === true;
/** 户型室内（F 包）单独一个开关：验收结论是保留片中现状，--props 里 "refineUnit":true 才换上 */
export const REFINE_UNIT = REFINE && (getInputProps() as { refineUnit?: boolean }).refineUnit === true;
export type Inst = [string, number, number, number, number, number];
export type Refine = { ruifu: THREE.Object3D; site: THREE.Object3D; siteProtos: THREE.Object3D; siteInst: Inst[]; siteTrees: number[][]; street: THREE.Object3D; riverside: THREE.Object3D; streetProtos: THREE.Object3D; streetInst: Inst[]; streetTrees: number[][];
  cbd: THREE.Object3D; island: THREE.Object3D; islandProtos: THREE.Object3D; islandInst: Inst[]; islandTrees: number[][]; unit: THREE.Object3D; furnish: THREE.Object3D; city: THREE.Object3D };

/** 区域底图的烘焙地面（白天、夜景两张）和树的分布，由 tools/v2/build_ground.py 生成 */
export type Bake = { refine: Refine | null; pilot: { towers: THREE.Object3D; street: THREE.Object3D; park: THREE.Object3D }; site: { day: THREE.Texture; night: THREE.Texture; bounds: [number, number, number, number]; trees: [number, number, number][]; shrubs: [number, number, number][] }; heyuan: { scene: THREE.Object3D; protos: THREE.Object3D; trees: number[][]; ty: number[] }; bridges: THREE.Object3D[]; far: { day: THREE.Texture; night: THREE.Texture; bounds: [number, number, number]; city: THREE.BufferGeometry; lake: { outer: number[][][]; inner: number[][][] } }; day: THREE.Texture; night: THREE.Texture; trees: [number, number, number, number][]; bounds: [number, number, number]; old: THREE.Texture; landmarks: { ruifuRects: { n: string; c: [number, number]; w: number; d: number; a: number; h: number }[]; fenCenter: [number, number][]; wanxiang: { name: string; height: number; poly: number[][] }; supplement: { poly: number[][]; height: number }[]; round: { c: [number, number]; r: number; h: number; podium: number } } };
export let bake: Bake | null = null;
let bakeP: Promise<Bake> | null = null;
const loadBake = () => (bakeP ??= (async () => {
  const tl = new THREE.TextureLoader();
  const tex = async (f: string) => { const t = await tl.loadAsync(staticFile(f)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.generateMipmaps = true; return t; };
  const js = (f: string) => fetch(staticFile(f)).then((r) => r.json());
  const bin = (f: string) => fetch(staticFile(f)).then((r) => r.arrayBuffer());
  const [day, night, tj, lm, fday, fnight, fpos, fnor, fm, old] = await Promise.all([tex("v2/ground_day.png"), tex("v2/ground_night.png"), js("v2/trees.json"), js("v2/landmarks.json"),
    tex("v2/far_day.png"), tex("v2/far_night.png"), bin("v2/far_city_pos.bin"), bin("v2/far_city_nor.bin"), js("v2/far_meta.json"), tex("v2/ground_old.png")]);
  // 远景建筑（近景城市数据以外，北到汾河上游、东到河东老城、西南到晋阳湖）：build_far.py 已合并成三角网
  const city = new THREE.BufferGeometry();
  city.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fpos), 3));
  city.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(fnor), 3));
  // 汾河上的三座桥（建模交付 视频/模型/bridges/，顶点已是场景坐标）
  const gl = new GLTFLoader();
  const bridges = await Promise.all(["changfeng", "jifen", "nanzhonghuan"].map(async (id) => { const g = (await gl.loadAsync(staticFile(`v2/bridges/bridge_${id}.glb`))).scene; g.userData.id = id; return g; }));
  // 和园精细模型（建模交付 视频/模型/heyuan/）
  const [hs, hp, htr, hty] = await Promise.all([gl.loadAsync(staticFile("v2/heyuan/heyuan.glb")), gl.loadAsync(staticFile("v2/heyuan/heyuan_tree_prototypes.glb")), js("v2/heyuan/trees.json"), js("v2/heyuan/trees_ground_y.json")]);
  const heyuan = { scene: hs.scene, protos: hp.scene, trees: htr, ty: hty };
  // 瑞府小区园林地面和树（build_site.py 按甲方总平面大致分出草坪、铺装、园路后自绘）
  const [sday, snight, smeta, strees, sshrub] = await Promise.all([tex("v2/site_day.png"), tex("v2/site_night.png"), js("v2/site_meta.json"), js("v2/site_trees.json"), js("v2/site_shrubs.json")]);
  const site = { day: sday, night: snight, bounds: smeta.bounds, trees: strees, shrubs: sshrub };
  // 精细化试点（建模交付 视频/模型/pilot_o1/，HR-VIDEO-TASK-006 节点1）：2号楼、T1 精细楼栋，滨河西路 z700–900 及同段滨河绿带
  const [ptw, pst, ppk] = await Promise.all(["ruifu_detail", "binhe_street", "binhe_park"].map((n) => gl.loadAsync(staticFile(`v2/pilot/${n}.glb`))));
  const pilot = { towers: ptw.scene, street: pst.scene, park: ppk.scene };
  // 全片精细化模型（只在 REFINE 时读）
  const refine: Refine | null = REFINE ? await (async () => {
    const g = (n: string) => gl.loadAsync(staticFile(`v2/refine/${n}.glb`)).then((x) => x.scene);
    const r = "v2/refine/";
    const [ruifu, site, siteProtos, siteInst, siteTrees, street, riverside, streetProtos, streetInst, streetTrees, cbd, island, islandProtos, islandInst, islandTrees, unit, furnish, city] = await Promise.all([
      g("ruifu_detail"), g("site"), g("site_protos"), js(r + "site_instances.json"), js(r + "trees_site.json"), g("street"), g("riverside"), g("street_protos"), js(r + "street_instances.json"), js(r + "trees_street.json"),
      g("cbd"), g("island"), g("island_protos"), js(r + "island_instances.json"), js(r + "trees_island.json"), g("unit_b02_detail"), g("unit_furnish"), g("city_near")]);
    return { ruifu, site, siteProtos, siteInst, siteTrees, street, riverside, streetProtos, streetInst, streetTrees, cbd, island, islandProtos, islandInst, islandTrees, unit, furnish, city };
  })() : null;
  return (bake = { refine, pilot, site, heyuan, bridges, old, day, night, trees: tj.trees, bounds: tj.bounds, landmarks: lm, far: { day: fday, night: fnight, bounds: fm.bounds, city, lake: fm.lake } });
})());

export const useReady = () => {
  const [ready, setReady] = useState(worldReady() && roadsGeo !== null && bake !== null);
  const [h] = useState(() => (ready ? null : delayRender("style-data", { timeoutInMilliseconds: 240000 })));
  useEffect(() => { waitForWorld(); if (!ready) Promise.all([loadWorld(), loadRoads(), loadBake()]).then(() => { setReady(true); if (h !== null) continueRender(h); }); }, [ready, h]);
  return ready;
};
