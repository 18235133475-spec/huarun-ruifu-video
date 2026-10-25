// 户型沙盘的软装和剪影小人（风格样帧第三版）。
// 软装按脚本场景重新布置，不沿用描摹平面里的方块家具；只保证功能区属性不变（卧室放床、餐厅放餐桌……）。
// 坐标用户型平面坐标：x 向东、y 为“距北边”的米数；换到三维时 z = y - 17.9。
// 所有材质都挂上“聚焦”着色：聚焦框以外的部分向纸色褪去；公共交通核始终褪色。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export const DEPTH = 17.9;
const Z = (y: number) => y - DEPTH;

// ---------- 聚焦着色 ----------
export type FocusU = { uFocus: { value: THREE.Vector4 }; uDim: { value: number } };
export const makeFocus = (): FocusU => ({ uFocus: { value: new THREE.Vector4(-99, -99, 99, 99) }, uDim: { value: 0 } });
/** 公共交通核（平面坐标两块矩形）：楼梯和电梯，始终弱化 */
const CORE = [[0.36, 0, 10.97, 4.85]]; // 只压暗楼梯间；两部电梯和电梯厅按户内一样完整表现
const coreGlsl = CORE.map(([x0, y0, x1, y1]) => `inR(vWP.xz, vec4(${x0.toFixed(2)}, ${Z(y0).toFixed(2)}, ${x1.toFixed(2)}, ${Z(y1).toFixed(2)}))`).join(" + ");
export const patchFocus = (m: THREE.Material, u: FocusU, cutTop = false) => {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWP; varying vec3 vWN;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vWP; varying vec3 vWN; uniform vec4 uFocus; uniform float uDim;
        float inR(vec2 p, vec4 r) { vec2 lo = min(r.xy, r.zw), hi = max(r.xy, r.zw); vec2 d = max(lo - p, p - hi); return 1.0 - smoothstep(-0.05, 0.25, max(d.x, d.y)); }`)
      .replace("#include <color_fragment>", cutTop ? "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.21, 0.19, 0.17), step(0.85, normalize(vWN).y));" : "#include <color_fragment>")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        float core = clamp(${coreGlsl}, 0.0, 1.0);
        float fade = max(uDim * (1.0 - inR(vWP.xz, uFocus)) * 0.62, core * 0.68);
        float g = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = mix(mix(gl_FragColor.rgb, vec3(g), fade * 0.7), vec3(0.949, 0.929, 0.894), fade);`);
  };
  m.customProgramCacheKey = () => (cutTop ? "focus-cut" : "focus");
  return m;
};

// ---------- 软装 ----------
const C = {
  oat: "#E8DECF", linen: "#F4EEE4", sage: "#B7C4A5", clay: "#D9A383", blue: "#A9BDC8",
  wood: "#C8A27E", woodD: "#94735A", white: "#FBF9F4", stone: "#D9D3C9", ink: "#6F665C",
  rugL: "#E4D5BE", rugD: "#D6DCC9", rugT: "#D9C3B0", leaf: "#7FA06A", leaf2: "#98B882", pot: "#CDB79C", gold: "#D8B77A",
};

export const dressUnit = (floorY: number, u: FocusU) => {
  const g = new THREE.Group();
  const mats = new Map<string, THREE.Material>();
  const mat = (c: string) => { if (!mats.has(c)) mats.set(c, patchFocus(new THREE.MeshLambertMaterial({ color: c }), u)); return mats.get(c)!; };
  const add = (geo: THREE.BufferGeometry, c: string, x: number, y: number, h0: number, rot = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(x, floorY + h0, Z(y)); m.rotation.y = (rot * Math.PI) / 180;
    m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m;
  };
  const rbox = (w: number, h: number, d: number, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
  /** 局部坐标（相对家具中心、按 rot 旋转）放一个圆角块；lx 沿家具宽度，ly 沿进深（正为“前方”） */
  const part = (cx: number, cy: number, rot: number, lx: number, ly: number, w: number, d: number, h: number, h0: number, c: string, r = 0.06) => {
    const a = (rot * Math.PI) / 180;
    // 与 rotation.y 同向旋转局部偏移：rot=0 面朝南（+y），90 面朝东，-90 面朝西，180 面朝北
    const x = cx + lx * Math.cos(a) + ly * Math.sin(a);
    const y = cy - lx * Math.sin(a) + ly * Math.cos(a);
    return add(rbox(w, h, d, r), c, x, y, h0 + h / 2, rot);
  };
  const rug = (x: number, y: number, w: number, d: number, c: string, rot = 0) => add(rbox(w, 0.02, d, 0.01), c, x, y, 0.01, rot, false);
  const sofa = (x: number, y: number, len: number, rot: number, c = C.oat, depth = 0.95) => {
    part(x, y, rot, 0, 0, len, depth, 0.42, 0, c, 0.08);
    part(x, y, rot, 0, -depth / 2 + 0.11, len, 0.22, 0.4, 0.42, c, 0.08);
    part(x, y, rot, -len / 2 + 0.1, 0.02, 0.2, depth - 0.04, 0.2, 0.42, c, 0.07);
    part(x, y, rot, len / 2 - 0.1, 0.02, 0.2, depth - 0.04, 0.2, 0.42, c, 0.07);
    const n = Math.max(1, Math.round((len - 0.4) / 0.9)), cw = (len - 0.44) / n;
    for (let i = 0; i < n; i++) part(x, y, rot, -len / 2 + 0.22 + cw * (i + 0.5), 0.08, cw - 0.05, depth - 0.3, 0.1, 0.42, C.linen, 0.05);
    part(x, y, rot, -len / 2 + 0.45, -0.18, 0.4, 0.14, 0.34, 0.5, C.clay, 0.06); // 靠枕
  };
  const lounge = (x: number, y: number, rot: number, c = C.sage) => {
    part(x, y, rot, 0, 0, 0.82, 0.82, 0.38, 0, c, 0.12);
    part(x, y, rot, 0, -0.32, 0.82, 0.18, 0.42, 0.38, c, 0.08);
    part(x, y, rot, 0, 0.05, 0.62, 0.55, 0.08, 0.38, C.linen, 0.04);
  };
  const chair = (x: number, y: number, rot: number, c = C.wood) => {
    part(x, y, rot, 0, 0, 0.46, 0.46, 0.06, 0.42, c, 0.03);
    part(x, y, rot, 0, -0.2, 0.44, 0.06, 0.42, 0.48, c, 0.03);
    for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) part(x, y, rot, a, b, 0.04, 0.04, 0.42, 0, C.woodD, 0.01);
  };
  const table = (x: number, y: number, w: number, d: number, h: number, rot = 0, c = C.wood) => {
    part(x, y, rot, 0, 0, w, d, 0.05, h - 0.05, c, 0.02);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(x, y, rot, a * (w / 2 - 0.08), b * (d / 2 - 0.08), 0.05, 0.05, h - 0.05, 0, C.woodD, 0.01);
  };
  const roundTable = (x: number, y: number, dia: number, h = 0.75) => {
    add(new THREE.CylinderGeometry(dia / 2, dia / 2, 0.05, 48), C.wood, x, y, h - 0.025);
    add(new THREE.CylinderGeometry(0.12, 0.22, h - 0.05, 20), C.woodD, x, y, (h - 0.05) / 2);
    add(new THREE.CylinderGeometry(dia * 0.22, dia * 0.22, 0.02, 32), C.linen, x, y, h + 0.01); // 转盘
  };
  const bed = (x: number, y: number, w: number, l: number, rot: number, duvet = C.linen, throwC = C.clay) => {
    part(x, y, rot, 0, 0, w, l, 0.3, 0, C.woodD, 0.04);
    part(x, y, rot, 0, 0.02, w - 0.08, l - 0.12, 0.22, 0.3, C.white, 0.08);
    part(x, y, rot, 0, 0.22, w - 0.04, l * 0.68, 0.06, 0.5, duvet, 0.04);
    part(x, y, rot, 0, l * 0.36, w - 0.02, 0.4, 0.07, 0.52, throwC, 0.03);
    part(x, y, rot, -w / 4, -l / 2 + 0.3, w / 2 - 0.12, 0.34, 0.14, 0.52, C.white, 0.07);
    part(x, y, rot, w / 4, -l / 2 + 0.3, w / 2 - 0.12, 0.34, 0.14, 0.52, C.white, 0.07);
    part(x, y, rot, 0, -l / 2 - 0.04, w + 0.1, 0.1, 0.95, 0, C.oat, 0.05); // 床头板
    for (const sd of [-1, 1]) { // 床头柜：两层抽屉 + 台灯
      part(x, y, rot, sd * (w / 2 + 0.36), -l / 2 + 0.26, 0.56, 0.44, 0.55, 0, C.wood, 0.03);
      part(x, y, rot, sd * (w / 2 + 0.36), -l / 2 + 0.49, 0.5, 0.02, 0.02, 0.27, C.woodD, 0.005);
      part(x, y, rot, sd * (w / 2 + 0.36), -l / 2 + 0.2, 0.08, 0.08, 0.2, 0.55, C.gold, 0.02);
      part(x, y, rot, sd * (w / 2 + 0.36), -l / 2 + 0.2, 0.26, 0.26, 0.16, 0.75, C.linen, 0.08);
    }
  };
  const plant = (x: number, y: number, s = 1) => {
    add(new THREE.CylinderGeometry(0.18 * s, 0.14 * s, 0.32 * s, 16), C.pot, x, y, 0.16 * s);
    add(new THREE.IcosahedronGeometry(0.34 * s, 1), C.leaf, x, y, 0.62 * s);
    add(new THREE.IcosahedronGeometry(0.24 * s, 1), C.leaf2, x + 0.14 * s, y + 0.08 * s, 0.86 * s);
  };
  const lamp = (x: number, y: number) => {
    add(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 8), C.ink, x, y, 0.5);
    add(new THREE.CylinderGeometry(0.12, 0.2, 0.24, 20, 1, true), C.gold, x, y, 1.02);
  };
  const cabinet = (x: number, y: number, w: number, d: number, h: number, rot = 0, c = C.wood) => part(x, y, rot, 0, 0, w, d, h, 0, c, 0.03);

  /** 按平面矩形放一块（x0..x1 东西、y0..y1 南北，h0..h1 高度） */
  const blk = (x0: number, y0: number, x1: number, y1: number, h0: number, h1: number, c: string, shadow = true) =>
    add(new THREE.BoxGeometry(x1 - x0, h1 - h0, y1 - y0), c, (x0 + x1) / 2, (y0 + y1) / 2, (h0 + h1) / 2, 0, shadow);
  const sideTable = (x: number, y: number, c = C.wood) => { add(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 24), c, x, y, 0.5); add(new THREE.CylinderGeometry(0.03, 0.05, 0.48, 10), C.woodD, x, y, 0.24); };
  const tableLamp = (x: number, y: number, h0: number) => { add(new THREE.CylinderGeometry(0.03, 0.06, 0.2, 12), C.gold, x, y, h0 + 0.1); add(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 18, 1, true), C.linen, x, y, h0 + 0.28); };
  const books = (x: number, y: number, h0: number, rot = 0) => { [[0, C.clay], [0.05, C.blue], [0.1, C.oat]].forEach(([d, c], i) => add(new THREE.BoxGeometry(0.32 - i * 0.03, 0.04, 0.22), c as string, x, y, h0 + 0.02 + (d as number) * 0.8, rot + i * 8)); };
  const MIRROR = "#C9D8DE";

  // ===== 客厅（R1、R4“午后看和园的树影”、R6 站在窗前 / 坐回厅里）：大宽厅——三人沙发背北面南看和园，沙发后一张长书桌，东墙一张短沙发，南窗前两把休闲椅 =====
  rug(15.0, 13.0, 4.8, 3.6, C.rugL);
  sofa(15.0, 11.75, 3.4, 0); // 主沙发面朝南（和园）
  sofa(17.85, 12.5, 2.2, -90, C.oat, 0.9); // 东墙短沙发
  sideTable(16.95, 11.6); sideTable(13.05, 11.6, C.oat);
  // 书桌放在东南角窗前（不占北侧过道）：人坐着面朝南窗看和园
  table(17.75, 15.3, 1.3, 0.6, 0.75, 0, C.woodD); chair(17.75, 14.72, 0, C.wood);
  books(17.35, 15.3, 0.75); tableLamp(18.25, 15.35, 0.75); add(new THREE.BoxGeometry(0.42, 0.02, 0.3), C.white, 17.8, 15.25, 0.77);
  table(15.0, 13.15, 1.5, 0.8, 0.38, 0, C.wood); books(14.7, 13.1, 0.38); add(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 20), C.gold, 15.4, 13.2, 0.4);
  lounge(13.5, 14.7, 0); lounge(14.8, 14.8, 0, C.blue);
  sideTable(14.15, 15.35, C.oat); add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), C.white, 14.1, 15.35, 0.56);
  cabinet(11.75, 12.7, 3.6, 0.4, 1.05, 90, C.oat); // 西墙整面书柜
  for (const [y, c] of [[11.3, C.clay], [11.9, C.blue], [12.5, C.oat], [13.1, C.sage], [13.7, C.clay], [14.3, C.white]] as const) add(new THREE.BoxGeometry(0.3, 0.06, 0.4), c, 11.78, y, 1.08);
  plant(12.0, 15.3, 1.15); plant(18.4, 13.95, 0.9); lamp(18.25, 11.4); lamp(12.9, 15.45);
  // ===== 餐厅（R4“傍晚一家人围坐圆桌”）：圆桌挪近开放厨房；西侧一张岛台（西厨，配两把吧凳），西墙一排高柜做餐边柜 =====
  roundTable(16.9, 7.15, 1.8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; chair(16.9 + Math.sin(a) * 1.22, 7.15 + Math.cos(a) * 1.22, (a * 180) / Math.PI + 180);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 20), C.white, 16.9 + Math.sin(a) * 0.68, 7.15 + Math.cos(a) * 0.68, 0.76); }
  add(new THREE.CylinderGeometry(0.07, 0.05, 0.22, 14), C.gold, 16.9, 7.15, 0.88); add(new THREE.IcosahedronGeometry(0.13, 1), C.leaf2, 16.9, 7.15, 1.02);
  part(13.55, 7.15, 90, 0, 0, 2.2, 0.75, 0.92, 0, C.white, 0.03); part(13.55, 7.15, 90, 0, 0, 2.24, 0.79, 0.04, 0.92, C.stone, 0.02); // 西厨岛台
  for (const y of [6.6, 7.7]) { add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), C.woodD, 14.25, y, 0.66); add(new THREE.CylinderGeometry(0.03, 0.06, 0.64, 8), C.ink, 14.25, y, 0.32); }
  add(new THREE.SphereGeometry(0.12, 14, 10), C.clay, 13.5, 6.6, 0.98); add(new THREE.CylinderGeometry(0.06, 0.05, 0.22, 12), C.white, 13.55, 7.6, 1.05);
  cabinet(11.75, 7.15, 3.0, 0.42, 1.05, 90, C.oat); // 西墙餐边高柜
  for (const y of [6.0, 6.75, 7.5, 8.25]) add(new THREE.BoxGeometry(0.03, 0.9, 0.02), C.woodD, 11.97, y, 0.52);
  plant(18.35, 5.65, 0.9); plant(12.0, 9.0, 0.8);
  // ===== 茶区（R4“入夜在茶区泡一壶茶，窗外是汾河和城市的灯火”）：长茶桌，人坐南侧面朝北窗；西侧茶柜 =====
  rug(16.2, 3.6, 3.6, 2.4, C.rugD);
  table(16.2, 3.4, 2.4, 0.8, 0.72, 0, C.woodD);
  blk(15.75, 3.2, 16.65, 3.55, 0.72, 0.75, C.ink); // 茶盘
  for (const [dx, dy] of [[-0.22, 0], [0, 0.05], [0.25, -0.05]]) add(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 12), C.white, 16.2 + dx, 3.35 + dy, 0.79);
  add(new THREE.SphereGeometry(0.08, 16, 12), C.clay, 15.85, 3.45, 0.82);
  chair(15.6, 4.25, 180, C.wood); chair(16.8, 4.25, 180, C.wood); chair(16.2, 2.55, 0, C.wood);
  cabinet(13.75, 3.55, 2.6, 0.38, 0.9, 90, C.wood);
  for (const [y, c] of [[2.7, C.clay], [3.3, C.white], [3.9, C.blue], [4.4, C.gold]] as const) add(new THREE.CylinderGeometry(0.07, 0.06, 0.16, 12), c, 13.75, y, 0.98);
  plant(18.4, 2.3, 0.95); lamp(14.4, 2.3);
  // ===== 多功能区（R5“可以是孩子的乐园，也可以是一间琴房”）：靠东墙立式钢琴，靠北窗矮书架，中间游戏毯和小桌 =====
  part(21.92, 2.75, -90, 0, 0, 1.5, 0.62, 1.05, 0, "#3A3430", 0.03); // 立式钢琴贴东墙
  part(21.92, 2.75, -90, 0, 0.42, 1.2, 0.24, 0.06, 0.72, C.white, 0.01); // 琴键
  part(21.25, 2.75, -90, 0, 0, 0.75, 0.38, 0.45, 0, C.wood, 0.04); // 琴凳
  blk(19.0, 2.0, 20.4, 2.3, 0, 0.5, C.white); books(19.4, 2.15, 0.5); books(20.0, 2.15, 0.5, 6);
  rug(20.1, 4.2, 2.2, 1.6, "#E8D6B8");
  table(19.6, 4.3, 0.7, 0.55, 0.45, 0, C.white);
  for (const [dx, dy, c] of [[0.55, -0.35, C.clay], [0.9, 0.25, C.blue], [1.15, -0.3, C.sage]] as const) add(new THREE.BoxGeometry(0.24, 0.24, 0.24), c, 19.6 + dx, 4.3 + dy, 0.13);
  add(new THREE.SphereGeometry(0.32, 18, 14), C.oat, 21.5, 4.55, 0.24); // 懒人沙发
  plant(19.2, 2.3, 0.85);
  // ===== 厨房（R5“厨房的窗外，汾河缓缓流过”）：岛台 + 两把吧凳，台面上砧板、果盘 =====
  part(20.6, 7.1, 0, 0, 0, 1.6, 0.8, 0.9, 0, C.white, 0.03);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 16), C.ink, 20.3, 7.0, 0.95);
  blk(20.75, 6.9, 21.15, 7.15, 0.9, 0.93, C.wood); add(new THREE.SphereGeometry(0.05, 10, 8), C.clay, 20.9, 7.3, 0.95); add(new THREE.SphereGeometry(0.05, 10, 8), C.leaf2, 21.0, 7.35, 0.95);
  for (const y of [6.85, 7.35]) { add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), C.woodD, 19.55, y, 0.66); add(new THREE.CylinderGeometry(0.03, 0.06, 0.64, 8), C.ink, 19.55, y, 0.32); }

  // ===== 主卧套房（R8 女主人的一天：起床 → 沐浴 → 选衣 → 着装；夜里在南窗前坐一会儿） =====
  rug(2.1, 13.3, 3.1, 3.2, C.rugT);
  bed(1.6, 13.3, 2.0, 2.2, 90, C.linen, C.sage); // 床头靠西墙
  part(2.95, 13.3, 90, 0, 0, 1.5, 0.42, 0.44, 0, C.oat, 0.06); // 床尾凳
  cabinet(4.85, 13.3, 1.8, 0.45, 0.72, -90, C.wood); books(4.85, 13.0, 0.72, 90); // 东墙矮柜
  lounge(3.6, 15.05, 0, C.oat); sideTable(4.45, 15.3, C.wood); add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12), C.white, 4.42, 15.3, 0.56); // 窗前一把椅、一杯茶
  lamp(2.75, 15.45); plant(0.85, 15.35, 0.9);
  // 衣帽间（R8 选衣）：U 形木衣柜——北墙两段（中间留主卫门）、西墙一段开放挂衣（看得见衣服）、东墙一段抽屉柜；中间一只软凳
  {
    const WD = "#B98D62", OAK = "#CDAA80";
    const hang = (x0: number, y0: number, x1: number, y1: number, alongX: boolean) => { // 开放挂衣：背板、两侧板、挂杆、一排衣服
      blk(x0, y0, x1, y1, 0, 0.04, WD); // 不做顶板：从上往下看要看得见衣服
      if (alongX) { blk(x0, y0, x1, y0 + 0.05, 0, 1.06, OAK); blk(x0, y0, x0 + 0.04, y1, 0, 1.06, WD); blk(x1 - 0.04, y0, x1, y1, 0, 1.06, WD); }
      else { blk(x0, y0, x0 + 0.05, y1, 0, 1.06, OAK); blk(x0, y0, x1, y0 + 0.04, 0, 1.06, WD); blk(x0, y1 - 0.04, x1, y1, 0, 1.06, WD); }
      const cs = ["#E9E2D6", "#5B6B7A", "#B4652F", "#D9CBB5", "#7A8C74", "#3E3A36", "#C9A27A", "#A9BDC8"];
      const n = Math.floor(((alongX ? x1 - x0 : y1 - y0) - 0.1) / 0.11);
      for (let k = 0; k < n; k++) { const c = cs[(k * 3) % cs.length], hgt = k % 4 === 1 ? 0.45 : 0.62;
        if (alongX) blk(x0 + 0.07 + k * 0.11, y0 + 0.1, x0 + 0.07 + k * 0.11 + 0.08, y1 - 0.06, 0.9 - hgt, 0.9, c);
        else blk(x0 + 0.1, y0 + 0.07 + k * 0.11, x1 - 0.06, y0 + 0.07 + k * 0.11 + 0.08, 0.9 - hgt, 0.9, c); }
    };
    const doors = (x0: number, y0: number, x1: number, y1: number, alongX: boolean) => { // 关门的柜子：木门 + 门缝 + 拉手
      blk(x0, y0, x1, y1, 0, 1.06, OAK);
      const L = alongX ? x1 - x0 : y1 - y0, n = Math.max(1, Math.round(L / 0.5));
      for (let k = 1; k < n; k++) { const p = (alongX ? x0 : y0) + (L * k) / n; if (alongX) blk(p - 0.008, y0, p + 0.008, y1 + 0.005, 0.02, 1.065, WD); else blk(x0, p - 0.008, x1 + 0.005, p + 0.008, 0.02, 1.065, WD); }
    };
    hang(0.4, 7.86, 2.36, 8.42, true); // 北墙西段：开放挂衣
    doors(4.0, 7.86, 5.64, 8.42, true); // 北墙东段：柜门
    hang(0.4, 8.42, 0.96, 9.9, false); // 西墙：开放挂衣
    doors(5.08, 8.42, 5.64, 9.9, false); for (const y of [8.6, 8.95, 9.3, 9.65]) blk(5.06, y - 0.01, 5.08, y + 0.01, 0.4, 0.42, C.gold); // 东墙抽屉柜
    add(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 24), C.sage, 4.3, 9.15, 0.2); // 软凳
    rug(2.9, 9.15, 1.6, 1.0, C.rugT);
  }
  // 主人过厅：北墙一面落地镜 + 一只梳妆凳（着装）
  blk(4.45, 10.06, 5.25, 10.12, 0, 1.05, MIRROR); blk(4.43, 10.04, 5.27, 10.07, 0, 1.06, C.gold);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 20), C.clay, 4.85, 10.62, 0.21);
  // ===== 第二间南向主卧（R9 应酬晚归）：床头靠西墙，南窗前书桌，独立卫生间在东侧 =====
  rug(6.8, 13.6, 2.6, 2.8, C.rugD);
  bed(6.4, 13.6, 1.8, 2.1, 90, C.linen, C.blue);
  part(7.75, 13.6, 90, 0, 0, 1.3, 0.4, 0.44, 0, C.oat, 0.06);
  table(7.5, 15.45, 1.2, 0.5, 0.74, 0, C.wood); chair(7.5, 14.95, 0, C.wood); tableLamp(7.95, 15.45, 0.74);
  plant(5.75, 15.4, 0.85);
  // ===== 东南角卧室（按官方户型图）：床头靠东墙，东北角一组衣柜，北墙书桌 =====
  rug(20.9, 14.2, 2.7, 2.6, C.rugL);
  bed(21.1, 14.29, 1.6, 2.1, -90, C.linen, C.clay);
  { const OAK = "#CDAA80"; blk(21.62, 12.06, 22.2, 12.75, 0, 1.06, OAK); blk(21.6, 12.39, 21.62, 12.42, 0.02, 1.06, "#94735A"); }
  table(20.35, 12.35, 1.2, 0.5, 0.74, 0, C.wood); chair(20.35, 12.85, 180, C.wood); tableLamp(20.8, 12.3, 0.74); books(20.0, 12.35, 0.74);
  plant(19.6, 15.45, 0.8);
  // ===== 玄关厅（Q3 两梯一户、专属玄关厅；R7 横轴的中心）：东墙一整面收纳 =====
  {
    const XW = 10.95, XC = 10.52;
    for (const [y0, y1] of [[5.15, 6.05], [6.08, 6.98], [9.62, 10.0]]) { blk(XC, y0, XW, y1, 0, 1.05, "#CDAA80"); blk(XC, y0, XW, y1, 1.05, 1.07, C.wood); blk(XC - 0.01, (y0 + y1) / 2 - 0.012, XW, (y0 + y1) / 2 + 0.012, 0.05, 1.075, C.ink); }
    // 挂衣格：背板、两侧板、挂杆、三件大衣
    blk(XW - 0.06, 7.02, XW, 8.15, 0, 1.05, C.wood); blk(XC, 6.99, XW, 7.03, 0, 1.05, C.wood); blk(XC, 8.14, XW, 8.18, 0, 1.05, C.wood);
    blk(XC + 0.18, 7.05, XC + 0.21, 8.12, 0.84, 0.86, C.gold);
    ([["#5B6B7A", 7.25], ["#B4652F", 7.6], ["#D9CBB5", 7.92]] as const).forEach(([c, y]) => blk(XC + 0.08, y - 0.12, XC + 0.3, y + 0.12, 0.28, 0.84, c));
    // 换鞋凳 + 下方鞋格 + 上方开放壁龛和灯带
    blk(XC, 8.2, XW, 9.58, 0, 0.12, C.ink); blk(XC - 0.05, 8.2, XW, 9.58, 0.12, 0.44, C.wood); blk(XC + 0.02, 8.3, XW - 0.04, 9.48, 0.44, 0.5, "#7A8C74");
    blk(XW - 0.06, 8.2, XW, 9.58, 0.5, 1.05, C.wood); blk(XC, 9.56, XW, 9.6, 0, 1.05, C.wood); blk(XW - 0.1, 8.25, XW - 0.06, 9.53, 0.5, 1.0, "#FFE2A6", false);
    blk(XC + 0.1, 8.5, XC + 0.3, 8.7, 0.5, 0.62, "#8C7B62");
    // 西侧：两部电梯之间的边几、镜面、花瓶；地垫
    blk(8.6, 7.38, 8.92, 8.08, 0, 0.78, C.wood); blk(8.58, 7.4, 8.6, 8.06, 0.8, 1.05, MIRROR);
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.2, 14), C.gold, 8.76, 7.55, 0.88); add(new THREE.IcosahedronGeometry(0.12, 1), C.leaf2, 8.76, 7.55, 1.02);
    blk(9.1, 8.45, 10.1, 9.25, 0, 0.012, "#D9C7A8", false);
    plant(9.2, 5.4, 0.8);
    // 电梯厅地面：石材拼花——一圈深色边带 + 中间两块浅色石材，正对两部电梯各一块
    blk(8.6, 5.0, 10.5, 10.0, 0, 0.006, "#E9E2D6", false);
    for (const [y0, y1] of [[5.6, 7.55], [7.9, 9.85]]) { blk(8.75, y0, 10.4, y1, 0.006, 0.01, "#B9A68A", false); blk(8.85, y0 + 0.1, 10.3, y1 - 0.1, 0.01, 0.014, "#F1ECE3", false); }
    // 墙面：两部电梯之间一幅画（挂在边几上方）
    blk(8.58, 7.45, 8.62, 8.0, 0.55, 0.95, "#B4652F"); blk(8.57, 7.5, 8.6, 7.95, 0.6, 0.9, "#E3C9A0");
    // 玄关库：沿墙置物架、收纳箱、行李箱
    blk(8.85, 11.68, 11.07, 11.98, 0, 0.95, C.white); blk(10.78, 11.98, 11.07, 12.85, 0, 0.95, C.white);
    ([[9.0, "#D6BE8E"], [9.5, "#A9B8C2"], [10.0, "#C9A27A"], [10.5, "#D6BE8E"]] as const).forEach(([x, c]) => blk(x, 11.72, x + 0.38, 11.95, 0.55, 0.85, c));
    blk(9.2, 12.3, 9.65, 12.75, 0, 0.62, "#5B6B7A"); blk(9.75, 12.35, 10.1, 12.75, 0, 0.5, "#B4652F");
    // 两部电梯的香槟金轿厢门 + 深色门套（Q3 里换成会开合的门，镜头按名字 lift_doors 把这组藏起来）
    const lg = new THREE.Group(); lg.name = "lift_doors"; g.add(lg);
    for (const y of [6.58, 8.86]) {
      const d = blk(8.5, y - 0.6, 8.62, y + 0.6, 0, 1.08, "#3A3430"); g.remove(d); lg.add(d);
      const p1 = blk(8.6, y - 0.55, 8.66, y - 0.005, 0, 1.0, "#D6BE8E"); g.remove(p1); lg.add(p1);
      const p2 = blk(8.6, y + 0.005, 8.66, y + 0.55, 0, 1.0, "#D6BE8E"); g.remove(p2); lg.add(p2);
    }
  }
  // ===== 按官方户型图补墙、修正 =====
  const wallM = patchFocus(new THREE.MeshLambertMaterial({ color: "#FBF9F4" }), u, true);
  const wall = (x0: number, y0: number, x1: number, y1: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.12, y1 - y0), wallM); m.position.set((x0 + x1) / 2, floorY + 0.56, Z((y0 + y1) / 2)); m.castShadow = m.receiveShadow = true; g.add(m); };
  const doorLeaf = (hx: number, hy: number, len: number, deg: number) => { const m = add(new THREE.BoxGeometry(len, 1.0, 0.05), C.woodD, hx + (Math.cos((deg * Math.PI) / 180) * len) / 2, hy + (Math.sin((deg * Math.PI) / 180) * len) / 2, 0.5); m.rotation.y = (-deg * Math.PI) / 180; };
  // 东南角卧室套房：西侧过道朝客厅这一段原来少画了墙（从客厅能直接走进去），补上；入口门在过道北端（朝餐厅）
  wall(19.07, 10.61, 19.2, 11.98);
  doorLeaf(19.13, 9.05, 0.95, 62);
  // 家政间：东墙按官方图——北段一小截、门洞（y 2.55–3.5）、南段到底；原来那截短墙位置不对，已隐藏
  wall(13.32, 2.36, 13.45, 2.55); wall(13.32, 3.5, 13.45, 4.8);
  doorLeaf(13.39, 3.5, 0.9, -110);
  // 家政间内：西墙一排台面（洗衣机、烘干机、洗衣池），西南角高柜，南墙矮柜；台面上收纳篮
  blk(11.6, 2.45, 12.2, 4.15, 0, 0.88, C.white); blk(11.6, 2.45, 12.22, 4.15, 0.88, 0.92, C.stone);
  for (const y of [2.75, 3.4]) { add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20), "#9DB3C2", 11.92, y, 0.935); add(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 20), C.ink, 11.92, y, 0.94); }
  blk(11.72, 3.8, 12.1, 4.08, 0.9, 0.94, "#DCE7EC");
  blk(11.6, 4.18, 12.2, 4.75, 0, 1.05, "#CDAA80"); blk(11.6, 4.45, 12.22, 4.47, 0.02, 1.05, C.woodD);
  blk(12.25, 4.3, 13.25, 4.75, 0, 0.85, "#CDAA80"); blk(12.25, 4.3, 13.27, 4.75, 0.85, 0.88, C.stone);
  add(new THREE.BoxGeometry(0.3, 0.16, 0.24), C.clay, 12.55, 4.52, 0.96); add(new THREE.BoxGeometry(0.28, 0.14, 0.22), C.blue, 12.95, 4.52, 0.95);
  add(new THREE.BoxGeometry(0.95, 0.04, 0.32), C.white, 12.75, 3.3, 0.85, 90); // 熨衣板
  // 主卫西墙：这是外墙（官方图在浴缸处开窗）；墙外那条地面其实在户外，铺成户外的颜色，墙上画出窗
  blk(0.22, 4.95, 0.62, 7.72, 0.0, 0.02, "#E7E1D6", false);
  blk(0.6, 5.45, 0.98, 6.45, 0.0, 1.13, "#BFD6E2", false);
  // 两部电梯轿厢：石材地面 + 一圈深色边、木饰面三面墙、扶手（电梯不再弱化）
  for (const [y0, y1] of [[5.05, 7.3], [7.55, 9.85]]) {
    blk(6.05, y0, 8.45, y1, 0, 0.008, "#3A3430", false); blk(6.15, y0 + 0.1, 8.35, y1 - 0.1, 0.008, 0.012, "#E9DFCF", false);
    blk(6.2, y0 + 0.4, 8.3, y1 - 0.4, 0.012, 0.016, "#D6C5AA", false);
    blk(6.05, y0, 6.18, y1, 0, 1.08, "#B98D62"); blk(6.05, y0, 8.45, y0 + 0.12, 0, 1.08, "#B98D62"); blk(6.05, y1 - 0.12, 8.45, y1, 0, 1.08, "#B98D62");
    blk(6.2, y0 + 0.2, 6.26, y1 - 0.2, 0.42, 0.46, C.gold); blk(6.3, y0 + 0.14, 8.2, y0 + 0.19, 0.42, 0.46, C.gold); blk(6.3, y1 - 0.19, 8.2, y1 - 0.14, 0.42, 0.46, C.gold);
  }
  return g;
};

// ---------- 剪影小人（扁平立牌，永远正对镜头） ----------
export type Pose = "stand" | "walk" | "sit" | "child" | "pour" | "look";
const SKIN = "#EFCFB4", LINE = "#5E5750";
const OUTFIT = [
  { top: "#D9A383", bottom: "#5E5750", hair: "#2E2622" },
  { top: "#B7C4A5", bottom: "#8C7B6B", hair: "#4A3A2E" },
  { top: "#F4EEE4", bottom: "#3F4A55", hair: "#2E2622" },
  { top: "#A9BDC8", bottom: "#6F665C", hair: "#5A4636" },
  { top: "#E2C58E", bottom: "#5E5750", hair: "#2E2622" },
];
const personCanvas = (pose: Pose, o: number) => {
  const W = 200, H = pose === "sit" ? 300 : 400;
  const cv = document.createElement("canvas"); cv.width = W * 2; cv.height = H * 2;
  const c = cv.getContext("2d")!; c.scale(2, 2);
  const f = OUTFIT[o % OUTFIT.length];
  c.lineWidth = 3; c.strokeStyle = LINE; c.lineJoin = "round";
  const rr = (x: number, y: number, w: number, h: number, r: number, fill: string, rot = 0, ox = x + w / 2, oy = y) => {
    c.save(); c.translate(ox, oy); c.rotate((rot * Math.PI) / 180); c.translate(-ox, -oy);
    c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); c.stroke(); c.restore();
  };
  const head = (x: number, y: number, r: number) => {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = SKIN; c.fill(); c.stroke();
    c.beginPath(); c.arc(x, y - 2, r + 1, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(x + r * 0.6, y - r * 0.35); c.quadraticCurveTo(x, y - r * 0.6, x - r, y - r * 0.1); c.closePath();
    c.fillStyle = f.hair; c.fill(); c.stroke();
  };
  if (pose === "sit") {
    rr(72, 150, 26, 118, 10, f.bottom, 0); rr(102, 150, 26, 118, 10, f.bottom, 0); // 小腿
    rr(64, 134, 72, 40, 16, f.bottom); // 大腿（正面透视，短）
    rr(62, 52, 76, 100, 22, f.top);
    rr(46, 60, 18, 84, 9, f.top, 10); rr(136, 60, 18, 84, 9, f.top, -10);
    head(100, 30, 25);
    c.fillStyle = LINE; c.fillRect(68, 266, 30, 8); c.fillRect(102, 266, 30, 8);
  } else {
    const kid = pose === "child";
    const s = kid ? 0.68 : 1;
    c.translate(W / 2, H); c.scale(s, s); c.translate(-W / 2, -H);
    const legA = pose === "walk" ? 12 : 0;
    rr(72, 210, 26, 176, 11, f.bottom, legA, 85, 210); rr(102, 210, 26, 176, 11, f.bottom, -legA, 115, 210);
    rr(62, 92, 76, 132, 24, f.top);
    if (pose === "pour") {
      rr(136, 104, 72, 18, 9, f.top, 0, 136, 104); // 前伸的手臂
      c.beginPath(); c.ellipse(198, 128, 16, 13, 0, 0, Math.PI * 2); c.fillStyle = "#F4EEE4"; c.fill(); c.stroke();
      rr(46, 100, 18, 104, 9, f.top, 6, 55, 100);
    } else if (pose === "look") {
      rr(46, 100, 18, 104, 9, f.top, 4, 55, 100); rr(136, 100, 18, 96, 9, f.top, -35, 145, 100); // 一手扶窗
    } else {
      const armA = pose === "walk" ? 16 : kid ? 25 : 5;
      rr(46, 100, 18, 104, 9, f.top, armA, 55, 100); rr(136, 100, 18, 104, 9, f.top, -armA, 145, 100);
    }
    head(100, 64, kid ? 32 : 27);
  }
  return cv;
};

export type PersonSpec = { pose: Pose; x: number; y: number; outfit: number; zone: string; seat?: number };
/** 生成一个立牌：返回 sprite 和脚下阴影；高度按机位仰角压缩，和墙、家具的透视比例一致 */
export const makePerson = (p: PersonSpec, floorY: number, el: number) => {
  const cv = personCanvas(p.pose, p.outfit);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(m);
  const realH = p.pose === "sit" ? 1.3 : p.pose === "child" ? 1.72 : 1.72; // 画布里小孩已按比例缩小
  const h = realH * Math.cos((el * Math.PI) / 180) * 1.7; // 比真实比例放大，保证整户视角下看得清
  sp.scale.set((h * cv.width) / cv.height, h, 1);
  sp.center.set(0.5, 0);
  sp.position.set(p.x, floorY + (p.seat ?? 0), Z(p.y));
  sp.renderOrder = 5;
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color: "#3A2F25", transparent: true, opacity: 0.16, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.scale.set(1, 0.6, 1); sh.position.set(p.x, floorY + 0.015, Z(p.y));
  return { sprite: sp, shadow: sh, spec: p };
};

/** 按脚本场景放的人：下午客厅看园，傍晚一家人围桌，入夜茶区喝茶看城 */
export const PEOPLE: PersonSpec[] = [
  { pose: "sit", x: 13.5, y: 14.75, outfit: 2, zone: "living", seat: 0.05 },
  { pose: "child", x: 14.3, y: 12.75, outfit: 4, zone: "living" },
  { pose: "look", x: 16.9, y: 15.25, outfit: 1, zone: "living" },
  { pose: "sit", x: 15.9, y: 6.4, outfit: 0, zone: "dining" },
  { pose: "sit", x: 17.9, y: 6.4, outfit: 3, zone: "dining" },
  { pose: "sit", x: 16.9, y: 5.95, outfit: 1, zone: "dining" },
  { pose: "child", x: 18.3, y: 8.6, outfit: 2, zone: "dining" },
  { pose: "pour", x: 16.0, y: 2.6, outfit: 3, zone: "tea" },
  { pose: "sit", x: 16.8, y: 4.3, outfit: 4, zone: "tea" },
  { pose: "walk", x: 9.8, y: 7.6, outfit: 0, zone: "entry" },
  { pose: "sit", x: 20.95, y: 2.55, outfit: 4, zone: "multi", seat: 0.1 },
  { pose: "child", x: 19.8, y: 4.5, outfit: 2, zone: "multi" },
  { pose: "pour", x: 20.6, y: 7.9, outfit: 1, zone: "kitchen" },
  { pose: "sit", x: 3.6, y: 15.1, outfit: 0, zone: "masterA", seat: 0.05 },
  { pose: "look", x: 6.3, y: 15.3, outfit: 3, zone: "masterB" },
];
