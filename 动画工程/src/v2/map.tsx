// v2 区域场景：日、夜两种配色；1、2号楼可切换成立面近景画法。
import React, { useMemo } from "react";
import * as THREE from "three";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useWorld } from "../world";
import { REFINE, bake, roadFeat } from "./data";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CamFrom, LOOK, PAIR, V3, at, dirOf, inPoly, shape } from "./geo";
import { LANDMARK, N, P } from "./theme";

/** 扇形视线：中心浓、外缘淡 */
export const fanGeo = (from: number, to: number, r: number, a0: number) => {
  const pos: number[] = [], col: number[] = [];
  const N = 48, R = 12;
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
    const b0 = from + ((to - from) * i) / N, b1 = from + ((to - from) * (i + 1)) / N;
    const r0 = (r * j) / R, r1 = (r * (j + 1)) / R;
    const q = (b: number, rr: number) => { const d = dirOf(b); return [PAIR[0] + d[0] * rr, 6, PAIR[1] + d[1] * rr]; };
    const al = (rr: number) => a0 * Math.pow(1 - rr / r, 1.4);
    const v = [q(b0, r0), q(b1, r0), q(b1, r1), q(b0, r1)], a = [al(r0), al(r0), al(r1), al(r1)];
    [0, 1, 2, 0, 2, 3].forEach((k) => { pos.push(...v[k]); col.push(1, 1, 1, a[k]); });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  return g;
};

/** 侧面画窗格并按随机亮灯；facade 时把1、2号楼画成瑞府立面（白色楼板线、深灰蓝玻璃、顶部香槟金冠顶）。
 *  uniform 挂在 m.userData.u 上，镜头里按帧改：uFacade 0–1 从赤陶体块渐变到立面，uLit 亮灯强度，uWarm 整栋暖光（2号楼加亮用） */
export const skin = (m: THREE.MeshLambertMaterial, o: { lit?: number; facade?: number; top?: number }) => {
  const u = { uLit: { value: o.lit ?? 0 }, uFacade: { value: o.facade ?? 0 }, uTop: { value: o.top ?? 96 }, uWarm: { value: 0 }, uOld: OLD_U.uOld, uFen: OLD_U.uFen, uHideR: HIDE_U.uHideR };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW3; varying vec3 vN3;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvW3 = (modelMatrix * vec4(transformed, 1.0)).xyz; vN3 = normalize(mat3(modelMatrix) * normal);");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW3; varying vec3 vN3; uniform float uLit; uniform float uFacade; uniform float uTop; uniform float uWarm; uniform float uOld; uniform vec2 uFen[41]; uniform vec4 uHideR[6];\nfloat h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\nfloat fenX(float z) { for (int i = 0; i < 40; i++) { if (z < uFen[i + 1].x) { float t = clamp((z - uFen[i].x) / (uFen[i + 1].x - uFen[i].x), 0.0, 1.0); return mix(uFen[i].y, uFen[i + 1].y, t); } } return uFen[40].y; }")
      .replace("void main() {", "void main() {\n        if (uOld > 0.5 && vW3.x < fenX(vW3.z) + 120.0) discard;\n        for (int i = 0; i < 6; i++) { vec4 r = uHideR[i]; if (vW3.x > r.x && vW3.x < r.z && vW3.z > r.y && vW3.z < r.w) discard; }")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float side = 1.0 - step(0.6, abs(vN3.y));
        float along = dot(vW3.xz, normalize(vec2(-vN3.z, vN3.x) + 1e-5));
        if (uFacade > 0.0) {
          float slab = step(fract((vW3.y + 1.5) / 3.0), 0.1);
          float mull = step(fract(along / 1.6), 0.06);
          vec3 glass = mix(vec3(0.36, 0.45, 0.54), vec3(0.55, 0.64, 0.72), clamp((vW3.y) / uTop, 0.0, 1.0)); // 和其余楼栋一样的深灰蓝玻璃（按实景照片）
          vec3 c = mix(glass, vec3(0.95, 0.94, 0.91), max(slab, mull * 0.35));
          c = mix(c, vec3(0.85, 0.72, 0.48), step(uTop - 6.5, vW3.y) * (1.0 - slab * 0.5));
          c = mix(vec3(0.95, 0.93, 0.89), c, side);
          diffuseColor.rgb = mix(diffuseColor.rgb, c, uFacade);
        }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.95, 0.62, 0.36) * uWarm * (0.35 + 0.65 * (1.0 - step(0.6, abs(vN3.y))));
        if (uLit > 0.0) {
          float sd = 1.0 - step(0.6, abs(vN3.y));
          float al = dot(vW3.xz, normalize(vec2(-vN3.z, vN3.x) + 1e-5));
          // 区域尺度下按“两层一格”的大窗块亮灯，避免细窗格在远景里变成噪点
          vec2 cell = vec2(floor(vW3.y / 6.0), floor(al / 9.0));
          float win = step(0.3, fract(vW3.y / 6.0)) * step(0.22, fract(al / 9.0));
          float on = step(0.8, h21(cell + floor(vW3.xz / 60.0) * 7.0));
          // 远处的窗灯按距离淡掉，城市只剩一层暖色光晕，避免满屏白色噪点
          float dist = length(cameraPosition - vW3);
          float near = 1.0 - smoothstep(1200.0, 5200.0, dist) * 0.85;
          totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * uLit * win * on * sd * (0.35 + 0.4 * h21(cell * 1.7)) * near;
          totalEmissiveRadiance += vec3(0.28, 0.2, 0.12) * uLit * sd * (1.0 - near) * 0.35; // 远处整体一层暖光
          totalEmissiveRadiance += vec3(0.10, 0.13, 0.22) * uLit * (0.12 + 0.18 * sd); // 城市整体一层很淡的蓝色夜光（立面比屋顶略亮，楼体不再发灰发平）
        }`);
  };
  m.customProgramCacheKey = () => "skin2";
  return m;
};

/** 瑞府楼栋立面：按实景照片，深灰蓝玻璃（越往上越浅、背光面也映着天空）、顶部5米香槟金冠顶、屋面白。top 为该楼几何的局部最高点 */
const ruifuMat = (top: number) => {
  const m = new THREE.MeshLambertMaterial({ color: "#7088A0" });
  const u = { uTop: { value: top }, uRoof: { value: new THREE.Color(P.ruifuRoof) }, uCrown: { value: new THREE.Color(P.ruifuCrown) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vLY; varying vec3 vN6;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLY = position.y; vN6 = normalize(mat3(modelMatrix) * normal);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vLY; varying vec3 vN6; uniform float uTop; uniform vec3 uRoof; uniform vec3 uCrown;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.rgb *= 0.92 + 0.12 * clamp(vLY / uTop, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uCrown, step(uTop - 5.0, vLY) * (1.0 - step(0.6, vN6.y)));
        diffuseColor.rgb = mix(diffuseColor.rgb, uRoof, smoothstep(0.55, 0.8, vN6.y));`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.08, 0.11, 0.16) * (1.0 - smoothstep(0.55, 0.8, vN6.y)) * (1.0 - step(uTop - 5.0, vLY)) * (0.5 + 0.5 * clamp(vLY / uTop, 0.0, 1.0));");
  };
  m.customProgramCacheKey = () => "ruifu";
  return m;
};

/** 写字楼（T1–T3）：玻璃幕墙。1.5 米一道浅色竖梃、4.2 米一道层间横带，玻璃下深上浅、每块略有明暗；远处按像素宽度淡掉线条防摩尔纹 */
const officeMat = (top: number, white = false) => {
  const m = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  const u = { uTop: { value: top }, uWhite: { value: white ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW7; varying vec3 vN7;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW7 = (modelMatrix * vec4(position, 1.0)).xyz; vN7 = normalize(mat3(modelMatrix) * normal);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW7; varying vec3 vN7; uniform float uTop; uniform float uWhite;\nfloat h7(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float side = 1.0 - smoothstep(0.55, 0.8, abs(vN7.y));
        vec2 tg = normalize(vec2(-vN7.z, vN7.x) + 1e-5);
        float uu = dot(vW7.xz, tg) / mix(1.5, 3.0, uWhite), vv = (vW7.y + 1.5) / mix(4.2, 3.6, uWhite);
        float hy = clamp((vW7.y + 1.5) / uTop, 0.0, 1.0);
        vec3 glass = mix(vec3(0.34, 0.47, 0.60), vec3(0.62, 0.75, 0.86), hy) * (0.93 + 0.14 * h7(floor(vec2(uu * 0.5, vv))));
        float fu = fwidth(uu), fv = fwidth(vv);
        float mull = (1.0 - smoothstep(0.04, 0.04 + fu, abs(fract(uu) - 0.5) * -1.0 + 0.5)) * (1.0 - smoothstep(0.18, 0.45, fu));
        float band = (1.0 - smoothstep(0.05, 0.05 + fv, abs(fract(vv) - 0.5) * -1.0 + 0.5)) * (1.0 - smoothstep(0.18, 0.45, fv));
        vec3 frame = vec3(0.88, 0.90, 0.91);
        glass = mix(glass, mix(vec3(0.55, 0.64, 0.72), vec3(0.72, 0.79, 0.85), hy), uWhite);
        float fw = mix(0.04, 0.14, uWhite), fb = mix(0.05, 0.2, uWhite);
        mull = (1.0 - smoothstep(fw, fw + fu, abs(fract(uu) - 0.5) * -1.0 + 0.5)) * (1.0 - smoothstep(0.18, 0.45, fu));
        band = (1.0 - smoothstep(fb, fb + fv, abs(fract(vv) - 0.5) * -1.0 + 0.5)) * (1.0 - smoothstep(0.18, 0.45, fv));
        frame = mix(frame, vec3(0.96, 0.96, 0.95), uWhite);
        vec3 wall = mix(glass, frame, max(mull * mix(0.6, 1.0, uWhite), band * mix(0.3, 1.0, uWhite)));
        diffuseColor.rgb = mix(vec3(0.85, 0.87, 0.88), wall, side);`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.07, 0.11, 0.17) * side * (0.4 + 0.6 * hy) * (1.0 - max(mull, band) * 0.6); // 玻璃映着天空，背光面也不发灰");
  };
  m.customProgramCacheKey = () => "office" + (white ? "w" : "");
  return m;
};

/** 楼高核对（甲方总平面 00_总平面_楼栋编号层数.jpg）：住宅 1–12、15–22 号楼层数与模型一致（按 3 米层高）；
 *  写字楼和 13、14、23 号楼模型原按 3 米层高估，比总平面标注的建筑高度矮，这里按标注改：T1 30F H=120.75，T2 35F H=140.25，T3 24F H=96.75，
 *  13#/14# 24F H=97.95（标注被编号圈遮住一位，按同为 24F 的 T3 推断），23# 20F H=70.75 */
const REAL_H: Record<string, number> = { ruifu_t1: 120.75, ruifu_t2: 140.25, ruifu_t3: 96.75, ruifu_b13: 97.95, ruifu_b14: 97.95, ruifu_b23: 70.75 };
const H_SCALE: Record<string, number> = {};
const PILOT_TOWERS = ["ruifu_b02", "ruifu_t1"]; // 已换成精细化试点模型的楼栋
const OFFICE = /^ruifu_(t\d|b1[34]|b23)$/; // 写字楼：T1–T3，以及 13、14、23 号（1–2 层商业、上部办公）

/** 精细化时从城市白模里扣掉已由近景城市模型（refine_v1 G 包）重做的楼（world.tsx 打的 aNear 标记） */
const dropNear = (src: THREE.BufferGeometry) => {
  const near = src.getAttribute("aNear"); if (!near) return src;
  const keep: number[] = []; for (let i = 0; i < near.count; i += 3) if (near.getX(i) < 0.5) keep.push(i);
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(src.attributes)) {
    const s = a.itemSize, out = new Float32Array(keep.length * 3 * s);
    keep.forEach((i, j) => out.set((a.array as Float32Array).subarray(i * s, (i + 3) * s), j * 3 * s));
    g.setAttribute(k, new THREE.BufferAttribute(out, s));
  }
  return g;
};

/** 1、2号楼脚下的一团柔光（代替原来的圆环标记）：中间实、四周渐隐 */
const GLOW = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d")!; const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(255,255,255,0.75)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

/** 汾河水面：比底色更深的蓝，远处掠射角映出天色；细碎波纹 + 太阳碎光，避免一整块平涂 */
const waterMat = (deep: string) => {
  const m = new THREE.MeshLambertMaterial({ color: deep });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW8;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW8 = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW8;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 V = normalize(cameraPosition - vW8);
        vec2 q8 = vW8.xz + vec2(sin(vW8.z * 0.031) * 9.0, sin(vW8.x * 0.027) * 9.0); // 先扭一下坐标，波纹不成网格
        float rp = sin(dot(q8, vec2(0.29, 0.17))) * sin(dot(q8, vec2(-0.11, 0.37))) + 0.5 * sin(dot(q8, vec2(1.13, -0.71))) * sin(dot(q8, vec2(0.53, 1.37)));
        float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
        vec3 col = mix(diffuseColor.rgb, vec3(0.80, 0.88, 0.94), fr * 0.7) * (1.0 + 0.025 * rp);
        vec3 nn = normalize(vec3(0.08 * rp, 1.0, 0.08 * sin(vW8.x * 0.9 + vW8.z * 1.4)));
        vec3 L = normalize(vec3(-0.5, 0.83, 0.17));
        float gl = pow(max(dot(reflect(-L, nn), V), 0.0), 90.0);
        diffuseColor.rgb = col;`)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * gl * 0.7 + vec3(0.02, 0.05, 0.08);");
  };
  m.customProgramCacheKey = () => "water";
  return m;
};

/** 立面/屋顶两色：朝上的面用屋顶色，其余用立面色 */
const twoTone = (wall: string, roof: string) => {
  const m = new THREE.MeshLambertMaterial({ color: wall });
  const u = { uRoof: { value: new THREE.Color(roof) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vN5;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvN5 = normalize(mat3(modelMatrix) * normal);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vN5; uniform vec3 uRoof;").replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRoof, smoothstep(0.55, 0.8, vN5.y));");
  };
  m.customProgramCacheKey = () => "twotone";
  return m;
};

/** 和园湖畔被 3D-GloBFP 误识别的碎块（buildings.json 第5868、5871–5875号），和精细和园穿插，裁掉 */
const HIDE_U = { uHideR: { value: [[27, 1071, 52, 1094], [65, 1136, 75, 1146], [73, 1110, 90, 1128], [21, 1089, 69, 1124], [66, 1093, 77, 1103], [49, 1085, 66, 1098]].map((r) => new THREE.Vector4(...r)) } };
const OFF = new THREE.Vector4(1e6, 1e6, 1e6, 1e6);
/** 和园边界：精细和园显示时，烘焙地面在园内挖空 */
const PARK_U = { uPark: { value: Array.from({ length: 32 }, () => new THREE.Vector2()) }, uParkN: { value: 0 }, uParkOn: { value: 0 } };

/** 旧貌模式：二十多年前河西还是田地，城市白模在汾河中心线以西整片隐藏（河东老城保留） */
const OLD_U = { uOld: { value: 0 }, uFen: { value: Array.from({ length: 41 }, () => new THREE.Vector2()) } };
/** 内河从汾河口沿 C 形流进来（0–1），算法同 world.tsx 的 Water */
const innerMat = (c: string, islandC: [number, number]) => {
  const m = new THREE.MeshLambertMaterial({ color: c });
  const u = { uReveal: { value: 1 }, uC: { value: new THREE.Vector2(islandC[0], islandC[1]) } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW7;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW7 = (modelMatrix * vec4(transformed,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW7; uniform float uReveal; uniform vec2 uC;")
      .replace("void main() {", `void main() {
        float a = degrees(atan(vW7.z - uC.y, vW7.x - uC.x));
        float p = mod(-71.0 - a + 720.0, 360.0) / 218.0;
        if (p > uReveal) discard;`);
  };
  m.customProgramCacheKey = () => "inner2";
  return m;
};

/** 夜景场馆亮化：深色立面 + 底部向上的泛光渐变 + 水平灯线 + 竖向线条；屋面暗；不是整块发白
 *  mode 0 文化场馆（暖白），1 万象城（彩色 LED 媒体立面，按位置渐变） */
const nightLit = (base: string, glow: string, y0: number, h: number, mode = 0) => {
  const m = new THREE.MeshLambertMaterial({ color: base });
  const u = { uGlow: { value: new THREE.Color(glow) }, uY0: { value: y0 }, uH: { value: h }, uMode: { value: mode } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW8; varying vec3 vN8;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW8 = (modelMatrix * vec4(transformed, 1.0)).xyz; vN8 = normalize(mat3(modelMatrix) * normal);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW8; varying vec3 vN8; uniform vec3 uGlow; uniform float uY0; uniform float uH; uniform float uMode;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float side = 1.0 - smoothstep(0.5, 0.8, abs(vN8.y));
        float hh = clamp((vW8.y - uY0) / uH, 0.0, 1.0);
        float up = pow(1.0 - hh, 2.2) * 0.9;                                  // 底部泛光，向上衰减
        float along = dot(vW8.xz, normalize(vec2(-vN8.z, vN8.x) + 1e-5));
        float band = smoothstep(0.86, 0.96, fract((vW8.y - uY0) / 4.5));       // 每 4.5 米一道水平灯线
        float pin = smoothstep(0.9, 0.98, fract(along / 3.0)) * 0.35;          // 竖向细线
        float top = smoothstep(uH - 1.5, uH, vW8.y - uY0) * 1.2;               // 檐口一圈亮边
        vec3 g = uGlow;
        if (uMode > 0.5) { float t = fract(along / 220.0); g = mix(mix(vec3(1.0, 0.35, 0.65), vec3(0.55, 0.35, 1.0), smoothstep(0.0, 0.5, t)), vec3(0.25, 0.7, 1.0), smoothstep(0.5, 1.0, t)); }
        totalEmissiveRadiance += g * side * (up + band * 0.7 + pin + top);
        totalEmissiveRadiance += g * (1.0 - side) * 0.06;`);
  };
  m.customProgramCacheKey = () => "nightlit";
  return m;
};

/** 长风商务区公建的夜间灯光秀：深色玻璃底，立面上一层随时间向上流动的彩色渐变（金→品红→蓝），
 *  一道白色扫描光带从下往上走，檐口一圈亮金；每栋楼相位不同（按位置错开），整体有节奏但不同步。时间由 SHOW_U.uTime 驱动 */
export const SHOW_U = { uTime: { value: 0 } };
const showLit = (y0: number, h: number, seed: number) => {
  const m = new THREE.MeshLambertMaterial({ color: "#1E2436" });
  const u = { uY0: { value: y0 }, uH: { value: h }, uSeed: { value: seed } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, SHOW_U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW9; varying vec3 vN9;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW9 = (modelMatrix * vec4(transformed, 1.0)).xyz; vN9 = normalize(mat3(modelMatrix) * normal);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW9; varying vec3 vN9; uniform float uY0; uniform float uH; uniform float uSeed; uniform float uTime;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float side = 1.0 - smoothstep(0.5, 0.8, abs(vN9.y));
        float hh = clamp((vW9.y - uY0) / uH, 0.0, 1.0);
        float along = dot(vW9.xz, normalize(vec2(-vN9.z, vN9.x) + 1e-5));
        float ph = fract(hh * 0.9 - uTime * 0.16 + uSeed);
        vec3 c = mix(vec3(1.0, 0.72, 0.32), vec3(1.0, 0.32, 0.62), smoothstep(0.0, 0.4, ph));
        c = mix(c, vec3(0.32, 0.6, 1.0), smoothstep(0.4, 0.8, ph));
        c = mix(c, vec3(1.0, 0.72, 0.32), smoothstep(0.8, 1.0, ph));
        float mull = 0.55 + 0.45 * smoothstep(0.75, 0.95, fract(along / 3.0));            // 竖向细线：像 LED 竖条
        float floors = 0.6 + 0.4 * smoothstep(0.8, 0.95, fract((vW9.y - uY0) / 4.2));        // 层间线
        float scan = exp(-pow((hh - fract(uTime * 0.22 + uSeed * 1.7)) * 14.0, 2.0));        // 往上走的扫描光带
        float crown = smoothstep(0.93, 1.0, hh);
        float base = 0.35 + 0.65 * hh;
        totalEmissiveRadiance += side * (c * mull * floors * base * 0.75 + vec3(1.0, 0.95, 0.88) * scan * 0.9 + vec3(1.0, 0.82, 0.5) * crown * 1.4);
        totalEmissiveRadiance += (1.0 - side) * vec3(0.9, 0.75, 0.5) * 0.12;`);
  };
  m.customProgramCacheKey = () => "showlit";
  return m;
};

/** 视线扇形材质：按方位角裁切，sweep 时只改 uniform。c 为中心方位，l/r 为向左右张开的度数 */
const fanMat = (color: string) => {
  const u = { uC: { value: 0 }, uL: { value: 0 }, uR: { value: 0 }, uO: { value: new THREE.Vector2(PAIR[0], PAIR[1]) } };
  const m = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW4;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvW4 = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW4; uniform float uC; uniform float uL; uniform float uR; uniform vec2 uO;")
      .replace("void main() {", `void main() {
        float b = degrees(atan(vW4.x - uO.x, -(vW4.z - uO.y)));
        float rel = mod(b - uC + 540.0, 360.0) - 180.0;
        if (rel < -uL || rel > uR) discard;`);
  };
  m.customProgramCacheKey = () => "fan2";
  return m;
};

/** 镜头里可调的状态（全部 0–1） */
export type MapState = {
  night?: boolean;
  facade?: number; // 1、2号楼从赤陶体块渐变到立面
  hero?: number; // 1、2号楼着赤陶色的程度（0 时和其他楼一样白）
  turn?: number; // 1、2号楼从正南转到最终朝向
  hi2?: number; // 2号楼单独加亮
  grow?: (name: string) => number; // 瑞府各楼长出来的高度比例
  front?: number; back?: number; // 视线扇形张开程度
  rays?: Partial<Record<"heyuan" | "xieyuan" | "lake" | "fen" | "venues", number>>;
  ring?: number;
  box?: number; lt?: V3; // 阴影范围（米）和主光对准点；俯冲镜头里随机位连续变化，避免阴影突变
  fog?: [number, number]; // 透视远景的空气感（米）
  old?: boolean; // 二十多年前：河西是田地
  islandRise?: number; venueGrow?: number; innerReveal?: number; // 文化岛平台抬起、五馆长出、内河引水
  dusk?: number; // 黄昏光
  morning?: number; // 清晨光：太阳从东北方低角度照来（讲2号楼背面时用）
  glow?: { id: string; k: number }; // 某座馆亮起暖光
  terrain?: boolean; // 远处地形（西山）
  ringK?: number;
  noBridges?: boolean; noHeyuan?: boolean; // 对比图用：隐藏桥、隐藏新和园
  islandAlpha?: number; // 平台半透明，露出底下的车流
  traffic?: number; time?: number; // 平台下的车流（0–1）和镜头时间（秒）
};
const RAYS = { heyuan: [209, 520, "hero"], xieyuan: [282, 560, "hero"], lake: [218, 980, "hero"], fen: [89, 470, "water"], venues: [352, 720, "water"] } as const;

export const MapScene: React.FC<{ cam: THREE.PerspectiveCamera; st: MapState }> = ({ cam, st }) => {
  const w = useWorld();
  const night = !!st.night;
  const objs = useMemo(() => {
    const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    const edgeMat = new THREE.LineBasicMaterial({ color: night ? "#F3E9D8" : P.edge, transparent: true, opacity: night ? 0.35 : 0.75 });
    const lit = night ? 1 : 0;
    const city = new THREE.Mesh(REFINE ? dropNear(w.city) : w.city, skin(lam(night ? N.city : P.city), { lit })); city.castShadow = city.receiveShadow = true;
    // 瑞府：1、2号楼各用一份材质（2号楼要能单独加亮），其余白
    const ruifu = w.ruifu.clone(true);
    bake!.landmarks.ruifuRects.forEach((r) => { if (REAL_H[r.n] && !H_SCALE[r.n]) { H_SCALE[r.n] = REAL_H[r.n] / r.h; r.h = REAL_H[r.n]; } });
    const heroMats = { ruifu_b01: skin(lam(P.hero), { lit: lit * 1.6, facade: 0 }), ruifu_b02: skin(lam(P.hero), { lit: lit * 1.6, facade: 0 }) };
    if (night) Object.values(heroMats).forEach((m) => { m.emissive.set("#E07A45"); m.emissiveIntensity = 0.6; });
    const otherMat = skin(lam(night ? N.other : P.white), { lit });
    if (night) { otherMat.emissive.set("#B9C8E8"); otherMat.emissiveIntensity = 0.16; }
    const ruifuMats = new Map<number, THREE.Material>();
    const rMat = (top: number) => { const k = Math.round(top); if (!ruifuMats.has(k)) ruifuMats.set(k, night ? otherMat : ruifuMat(k)); return ruifuMats.get(k)!; };
    const oMats = new Map<number, THREE.Material>();
    const oMat = (top: number) => { const k = Math.round(top); if (!oMats.has(k)) oMats.set(k, night ? showLit(-1.5, top + 1.5, (k * 0.137) % 1) : officeMat(k)); return oMats.get(k)!; };
    const nodes: Record<string, { o: THREE.Object3D; q: THREE.Quaternion }> = {};
    ruifu.traverse((o) => {
      if (/^ruifu_(b\d+|t\d|s1)$/.test(o.name)) nodes[o.name] = { o, q: o.quaternion.clone() };
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      let p: THREE.Object3D | null = m; while (p && !/^ruifu_(b\d+|t\d|s1)$/.test(p.name)) p = p.parent;
      const n = p?.name ?? "";
      const glass = (m.material as THREE.Material).name === "glass";
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      m.material = n === "ruifu_b02" || n === "ruifu_b01" ? heroMats[n] : glass ? lam(night ? "#4A5868" : "#CFDCE3") : OFFICE.test(n) ? oMat(m.geometry.boundingBox!.max.y * (H_SCALE[n] ?? 1)) : rMat(m.geometry.boundingBox!.max.y * (H_SCALE[n] ?? 1));
      if ((n === "ruifu_b02" || n === "ruifu_b01") && !glass) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), edgeMat); e.renderOrder = 6; m.add(e); }
      m.castShadow = m.receiveShadow = true;
    });
    const venues = w.venues.map((v) => {
      const g = v.scene.clone(true);
      g.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const glass = (m.material as THREE.Material).name === "glass";
        const lc = LANDMARK[v.id] ?? { wall: P.landmark, roof: P.landmark, glass: "#BFD6E2" };
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const hgt = Math.max(8, m.geometry.boundingBox!.max.y - m.geometry.boundingBox!.min.y);
        const mm = night ? (glass ? lam("#F2C77E") : nightLit(new THREE.Color(lc.wall).multiplyScalar(0.42).getStyle(), "#FFE2B0", 4.5, hgt)) : glass ? lam(lc.glass) : twoTone(lc.wall, lc.roof);
        if (night && glass) { mm.emissive.set("#FFC878"); mm.emissiveIntensity = 1.2; } // 场馆：立面底部泛光 + 灯线，玻璃透出暖光
        m.material = mm; m.castShadow = m.receiveShadow = true;
        // 重点体块勾细墨线，素模底下也能一眼认出
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), edgeMat);
        e.renderOrder = 6; m.add(e);
      });
      g.position.set(v.anchor[0], 4.5, v.anchor[1]);
      g.updateMatrixWorld(true);
      g.userData.id = v.id;
      return g;
    });
    // 万象城：真实轮廓挤出（略放大一点盖住城市白模里的同一体块）
    const wx = bake!.landmarks.wanxiang;
    const wxc = wx.poly.reduce((a, p) => [a[0] + p[0] / wx.poly.length, a[1] + p[1] / wx.poly.length], [0, 0]);
    const wxGeo = new THREE.ExtrudeGeometry(shape(wx.poly.map(([x, z]) => [wxc[0] + (x - wxc[0]) * 1.006, wxc[1] + (z - wxc[1]) * 1.006])), { depth: wx.height + 0.5, bevelEnabled: false });
    wxGeo.rotateX(-Math.PI / 2); wxGeo.translate(0, -1.5, 0);
    const wanxiang = new THREE.Mesh(wxGeo, night ? nightLit("#3A3550", "#FF6FB0", -1.5, wx.height + 0.5, 1) : twoTone(LANDMARK.wanxiang.wall, LANDMARK.wanxiang.roof));
    wanxiang.castShadow = wanxiang.receiveShadow = true;
    { const e = new THREE.LineSegments(new THREE.EdgesGeometry(wxGeo, 28), edgeMat); e.renderOrder = 6; wanxiang.add(e); }
    // 万象城屋顶：中庭白色网壳穹顶、两条采光带、设备房和屋顶绿化（按实景特征示意）
    const wxTop = -1.5 + wx.height + 0.5;
    const roof = new THREE.Group();
    const dome = new THREE.SphereGeometry(34, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1.25, 0.42, 1);
    const shell = new THREE.Mesh(dome, new THREE.MeshLambertMaterial({ color: night ? "#F2D9A8" : "#F6F7F7", transparent: true, opacity: 0.88 }));
    if (night) { (shell.material as THREE.MeshLambertMaterial).emissive.set("#F2C77E"); (shell.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.8; }
    const lattice = new THREE.LineSegments(new THREE.WireframeGeometry(dome), new THREE.LineBasicMaterial({ color: night ? "#FFF3D6" : "#9AA3A8", transparent: true, opacity: 0.8 }));
    shell.position.set(wxc[0] + 10, wxTop, wxc[1] - 6); lattice.position.copy(shell.position); shell.castShadow = true;
    roof.add(shell, lattice);
    const box = (w: number, h: number, d: number, x: number, z: number, c: string, rot = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); b.position.set(x, wxTop + h / 2, z); b.rotation.y = rot; b.castShadow = true; roof.add(b); return b; };
    box(90, 0.6, 9, wxc[0] - 60, wxc[1] + 34, night ? "#E8C98E" : "#D3E2EA", 0.6); box(70, 0.6, 9, wxc[0] + 70, wxc[1] + 40, night ? "#E8C98E" : "#D3E2EA", -0.5);
    [[-95, -40], [-80, -52], [90, -50], [105, 10], [-110, 30]].forEach(([dx, dz]) => box(14, 4, 10, wxc[0] + dx, wxc[1] + dz, night ? N.city : "#D9D6D0"));
    box(46, 0.5, 26, wxc[0] - 30, wxc[1] - 70, night ? N.green : P.green, 0.3); box(34, 0.5, 22, wxc[0] + 60, wxc[1] + 85, night ? N.green : P.green, -0.2);
    // 城市数据里缺的楼（和园、谐园之间）：T1 阳光城·环球金融中心（铜色女儿墙外框）、T6 写字楼、T2–T5 在建四塔（带塔吊）、圆形基坑工地
    const supp = new THREE.Group();
    const LMk = bake!.landmarks as any;
    const ext = (poly: number[][], h: number, y0 = -1.5) => { const g = new THREE.ExtrudeGeometry(shape(poly), { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g; };
    const siteMat = lam(night ? N.city : "#D9D6CF"), crane = lam(night ? "#C9A86E" : "#E3A93B");
    if (LMk.podium) { const m = new THREE.Mesh(ext(LMk.podium, 9), siteMat); m.castShadow = m.receiveShadow = true; supp.add(m); }
    for (const v of LMk.supplement) {
      const m = new THREE.Mesh(ext(v.poly, v.height), night ? showLit(-1.5, v.height, (v.poly[0][0] * 0.013 + v.poly[0][1] * 0.007) % 1) : v.site ? officeMat(-1.5 + v.height) : city.material); m.castShadow = m.receiveShadow = true; supp.add(m);
      const cx = v.poly.reduce((a: number, p: number[]) => a + p[0] / 4, 0), cz = v.poly.reduce((a: number, p: number[]) => a + p[1] / 4, 0);
      if (v.parapet) { // 屋顶外圈铜色女儿墙
        const inner = v.poly.map(([x, z]: number[]) => [cx + (x - cx) * 0.86, cz + (z - cz) * 0.86]);
        const sh = shape(v.poly); sh.holes.push(new THREE.Path(inner.map(([x, z]: number[]) => new THREE.Vector2(x, -z))));
        const g = new THREE.ExtrudeGeometry(sh, { depth: 3.5, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -1.5 + v.height, 0);
        const pm = new THREE.Mesh(g, lam(night ? "#7A5A48" : v.parapet)); pm.castShadow = true; supp.add(pm);
      }
      if (v.site) { // 在建四塔：按甲方效果图画建成后的样子（顶部浅色女儿墙 + 屋顶花园），不再画塔吊
        const top = -1.5 + v.height;
        const g1 = new THREE.ExtrudeGeometry(shape(v.poly), { depth: 1.6, bevelEnabled: false }); g1.rotateX(-Math.PI / 2); g1.translate(0, top, 0);
        const cap = new THREE.Mesh(g1, lam(night ? "#4B525C" : "#EEF0F0")); cap.castShadow = true; supp.add(cap);
        const inner = v.poly.map(([x, z]: number[]) => [cx + (x - cx) * 0.62, cz + (z - cz) * 0.62]);
        const g2 = new THREE.ExtrudeGeometry(shape(inner), { depth: 0.6, bevelEnabled: false }); g2.rotateX(-Math.PI / 2); g2.translate(0, top + 1.6, 0);
        supp.add(new THREE.Mesh(g2, lam(night ? N.green : "#A9C796")));
      }
    }
    { // 四塔里最高的两栋（T3、T5）之间，效果图上有一道顶部连桥
      const a = LMk.supplement.find((v: any) => v.id === "T3"), b = LMk.supplement.find((v: any) => v.id === "T5");
      if (a && b) {
        const c = (v: any) => [v.poly.reduce((s_: number, p: number[]) => s_ + p[0] / 4, 0), v.poly.reduce((s_: number, p: number[]) => s_ + p[1] / 4, 0)];
        const [ax, az] = c(a), [bx, bz] = c(b), len = Math.hypot(bx - ax, bz - az);
        const br = new THREE.Mesh(new THREE.BoxGeometry(len, 9, 16), night ? siteMat : officeMat(96, true));
        br.position.set((ax + bx) / 2, -1.5 + Math.min(a.height, b.height) - 8, (az + bz) / 2); br.rotation.y = -Math.atan2(bz - az, bx - ax); br.castShadow = true; supp.add(br);
      }
    }
    if (false) { const r = LMk.round; // 基坑地块（按效果图画规划建筑的版本，用户回退，不用）：按甲方效果图画规划中的建筑——沿东北侧道路一栋长条楼（蓝色玻璃采光顶）、中间两栋错开的白色方格塔楼、北角一栋矮楼
      const g = new THREE.Group(); g.position.set(r.c[0], 0, r.c[1]); g.rotation.y = 0.873; supp.add(g); // 50°：和西侧那排在建楼（边线 40°）同一方向
      const pad = new THREE.Mesh(new THREE.BoxGeometry(r.podium * 0.9, 0.6, r.podium * 0.9), lam(night ? N.site : "#E9E6DF")); pad.position.y = -1.2; pad.receiveShadow = true; g.add(pad);
      const add = (x: number, z: number, w: number, d: number, h: number, mat: THREE.Material, y0 = -1.5) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y0 + h / 2, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
      const wall = lam(night ? N.city : "#E6E3DC"), glassRoof = lam(night ? "#4A6FA0" : "#7FA6CC"), roofC = lam(night ? "#4B525C" : "#EEF0F0");
      add(50, 0, 20, 104, 30, night ? siteMat : officeMat(28.5, true)); add(50, 0, 9, 96, 1.2, glassRoof, 28.5); // 长条楼 + 采光顶
      add(4, 34, 34, 28, 74, night ? siteMat : officeMat(72.5, true)); add(4, 34, 30, 24, 1.4, roofC, 72.5);
      add(16, -26, 32, 27, 82, night ? siteMat : officeMat(80.5, true)); add(16, -26, 28, 23, 1.4, roofC, 80.5);
      add(30, -60, 40, 18, 22, wall); add(30, -60, 34, 12, 1.2, glassRoof, 20.5); // 北角矮楼，蓝色屋顶
      add(-30, 10, 30, 60, 0.5, lam(night ? N.green : P.green), -1.2); add(-34, -45, 26, 30, 0.5, lam(night ? N.green : P.green), -1.2); // 院子里的草地
    }
    { const r = LMk.round; // 基坑地块：一块不起眼的扁平方体；转到 50°，和西侧那排在建楼（边线 40°）同一方向
      const blk = new THREE.Mesh(new THREE.BoxGeometry(r.podium * 0.92, 9, r.podium * 0.92), lam(night ? N.site : "#E9E6DF"));
      blk.position.set(r.c[0], 3, r.c[1]); blk.rotation.y = 0.873; blk.castShadow = blk.receiveShadow = true; blk.userData.pit = true; supp.add(blk);
      { const e = new THREE.LineSegments(new THREE.EdgesGeometry(blk.geometry), new THREE.LineBasicMaterial({ color: night ? "#5A6380" : "#B8B2A8" })); blk.add(e); } }
    // 瑞府楼栋细部（按甲方效果图：每层白色楼板挑檐、玻璃栏板、香槟金转角竖线、顶部两层金色竖向格栅和出挑薄屋檐）
    // 用实例化方块批量生成；只在近景出现，远景下细线会变成摩尔纹
    const det = (() => {
      const rects = bake!.landmarks.ruifuRects.filter((r) => r.n !== "ruifu_s1" && !PILOT_TOWERS.includes(r.n)); // 试点精细楼栋自带细部
      type Arr = Record<"slabs" | "rails" | "posts" | "fins" | "caps" | "crowns" | "strips", THREE.Matrix4[]>;
      const mkArr = (): Arr => ({ slabs: [], rails: [], posts: [], fins: [], caps: [], crowns: [], strips: [] });
      const other = mkArr(), hero = mkArr(), office = mkArr(); // 1、2号楼单独一组（转身前不显示），写字楼单独一组
      const q = new THREE.Quaternion(), e = new THREE.Euler();
      const put = (arr: THREE.Matrix4[], r: typeof rects[0], lx: number, y: number, lz: number, sx: number, sy: number, sz: number) => {
        const c = Math.cos(r.a), s_ = Math.sin(r.a);
        const x = r.c[0] + lx * c - lz * s_, z = r.c[1] + lx * s_ + lz * c;
        e.set(0, -r.a, 0); q.setFromEuler(e);
        arr.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
      };
      const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const r of rects) {
        const isHero = r.n === "ruifu_b01" || r.n === "ruifu_b02", isOffice = OFFICE.test(r.n);
        const A = isHero ? hero : isOffice ? office : other;
        const top = -1.5 + r.h;
        if (isOffice) { // 写字楼：顶部一圈浅色女儿墙、四角浅色竖框、裙房顶一圈雨棚
          put(A.caps, r, 0, top + 0.7, 0, r.w + 0.5, 1.4, r.d + 0.5);
          for (const [sx, sz] of CORNERS) put(A.posts, r, sx * (r.w / 2), (-1.5 + top) / 2, sz * (r.d / 2), 0.7, top + 1.5, 0.7);
          put(A.slabs, r, 0, -1.5 + 10, 0, r.w + 5, 0.9, r.d + 5);
          continue;
        }
        const crownH = 6.5, body = top - crownH;
        put(A.caps, r, 0, top + 0.35, 0, r.w + 3.2, 0.7, r.d + 3.2);
        put(A.crowns, r, 0, body + crownH / 2, 0, r.w - 1.2, crownH, r.d - 1.2);
        for (let y = -1.5 + 6; y < body - 0.5; y += 3) {
          put(A.slabs, r, 0, y, 0, r.w + 1.6, 0.3, r.d + 1.6);
          put(A.rails, r, 0, y + 0.7, 0, r.w + 1.3, 1.0, r.d + 1.3);
        }
        for (const [sx, sz] of CORNERS) put(A.posts, r, sx * (r.w / 2 + 0.55), (-1.5 + top) / 2, sz * (r.d / 2 + 0.55), 1.0, top + 1.5, 1.0);
        for (const lx of r.w > 40 ? [-r.w / 6, r.w / 6] : [0]) for (const sz of [-1, 1]) put(A.strips, r, lx, (-1.5 + body) / 2 + 2, sz * (r.d / 2 + 0.95), 1.8, body + 1.5 - 4, 0.5); // 单元之间的深色竖向凹槽
        for (let lx = -r.w / 2 + 1; lx < r.w / 2 - 0.5; lx += 1.3) for (const sz of [-1, 1]) put(A.fins, r, lx, body + crownH / 2, sz * (r.d / 2 - 0.3), 0.28, crownH - 0.4, 0.9);
        for (let lz = -r.d / 2 + 1; lz < r.d / 2 - 0.5; lz += 1.3) for (const sx of [-1, 1]) put(A.fins, r, sx * (r.w / 2 - 0.3), body + crownH / 2, lz, 0.9, crownH - 0.4, 0.28);
      }
      const box = new THREE.BoxGeometry(1, 1, 1);
      const mk = (arr: THREE.Matrix4[], c: string, shadow = true, op = 1) => {
        const m = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: c, transparent: op < 1, opacity: op }), arr.length);
        arr.forEach((M, i) => m.setMatrixAt(i, M)); m.castShadow = shadow; m.receiveShadow = true; return m;
      };
      const res = (A: Arr) => [mk(A.slabs, night ? "#59616D" : "#F3F1EC"), mk(A.rails, night ? "#3E4A58" : "#4F677D", false, 0.6), mk(A.posts, "#D2B37A"), mk(A.fins, night ? "#E9C98A" : "#E2C48A"), mk(A.caps, night ? "#4B525C" : "#F7F5F0"), mk(A.crowns, night ? "#F2D49A" : "#D9BA82"), mk(A.strips, night ? "#2E3644" : "#4D5D6E")];
      const gOther = new THREE.Group(), gHero = new THREE.Group(), gOffice = new THREE.Group();
      gOther.add(...res(other));
      const hr = res(hero); gHero.add(...hr);
      gOffice.add(mk(office.caps, night ? "#4B525C" : "#E8ECEE"), mk(office.posts, night ? "#59616D" : "#DCE2E6"), mk(office.slabs, night ? "#59616D" : "#D3D9DD"));
      const g = new THREE.Group(); g.add(gOther, gHero, gOffice);
      g.userData.hero = [hr[0].material, hr[1].material]; g.userData.heroGroup = gHero;
      return g;
    })();
    // 瑞府小区园林地面（草坪、铺装、园路），盖在底图上、近景路面下
    const siteGround = (() => {
      const [sx0, sz0, sx1, sz1] = bake!.site.bounds;
      const g = new THREE.PlaneGeometry(sx1 - sx0, sz1 - sz0); g.rotateX(-Math.PI / 2); g.translate((sx0 + sx1) / 2, -1.5, (sz0 + sz1) / 2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: night ? bake!.site.night : bake!.site.day, transparent: true, alphaTest: 0.02, depthWrite: false }));
      if (night) { const mm = m.material as THREE.MeshLambertMaterial; mm.emissiveMap = bake!.site.night; mm.emissive.set("#ffffff"); mm.emissiveIntensity = 0.6; }
      m.receiveShadow = true; m.renderOrder = 1; return m;
    })();
    // 精细化试点模型：材质按名字换成本片的扁平配色；楼栋节点每帧跟随原楼栋节点的位置和转角
    const PC: Record<string, string> = { wall: "#F3F1EC", glass: "#6A8094", rail_glass: "#5E7488", gold: "#D2B37A", crown: "#D9BA82", office_glass: "#7393AC", office_frame: "#DCE2E6", stone: "#E9E2D6", roof: "#EEEAE2", mech: "#C9C4BA",
        asphalt: "#A7AEB4", curb: "#E3E3DE", sidewalk: "#E9E2D3", median_green: "#B9D29C", lamp: "#6F665C", light: "#FFE6B8", rail: "#8F867A", path: "#E8DDC6", bench: "#B98D62", water_edge: "#D9D3C9",
      lawn: "#BCD69E", grass_paver: "#CCDDB6", hedge: "#6E9A5C" }; // 小区草坪、植草砖、绿篱比色板深半档，保住现状小区的绿意
    const pilot = (() => {
      const mats = new Map<string, THREE.Material>();
      const matOf = (n: string) => { if (!mats.has(n)) { const m = lam(night && n === "glass" ? "#3A4558" : PC[n] ?? "#ffffff"); if (n === "rail_glass") { m.transparent = true; m.opacity = 0.75; } if (n === "glass" || n === "office_glass") { m.emissive.set(night ? "#FFC878" : "#9FB6CC"); m.emissiveIntensity = night ? 0.5 : 0.12; } if (n === "light" && night) { m.emissive.set("#FFD08A"); m.emissiveIntensity = 1.8; } mats.set(n, m); } return mats.get(n)!; };
      const prep = (src: THREE.Object3D) => { const g = src.clone(true); g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.material = matOf((m.material as THREE.Material).name); m.castShadow = m.receiveShadow = true; }); return g; };
      const towers = prep(bake!.pilot.towers), street = prep(bake!.pilot.street), park = prep(bake!.pilot.park);
      street.position.y = -1.25; park.position.y = -1.48; // 试点地面在 y=0；本片地面在 -1.5，路面略抬高盖住底图路面
      const tnodes: Record<string, THREE.Object3D> = {};
      towers.traverse((o) => { if (/^ruifu_(b\d+|t\d)$/.test(o.name)) tnodes[o.name] = o; });
      const g = new THREE.Group(); g.add(towers, street, park);
      return { g, towers, tnodes, street, park };
    })();
    // 全片精细化模型（refine_v1，HR-VIDEO-TASK-007）：材质按名字换成本片的扁平配色（白天沿用试点色板，夜景压暗、灯具和灯带发光）；
    // 楼栋节点每帧跟随原楼栋节点；地面类模型在 y=0 建模，这里统一下沉到本片地面
    const refine = (() => {
      const R = bake!.refine; if (!R) return null;
      const NC: Record<string, string> = { wall: "#59616D", glass: "#3A4558", rail_glass: "#2E3644", gold: "#E9C98A", crown: "#F2D49A", office_frame: "#4B525C", stone: "#3C4152", roof: "#3A4258", mech: "#4B525C", copper: "#7A5A48", venue_white: "#AEB8D2", canopy_glass: "#F2D9A8",
        asphalt: "#2A3046", curb: "#4A5268", sidewalk: "#343A50", median_green: "#1E3A2E", lamp: "#3A4258", rail: "#4A5268", path: "#6A5A48", bench: "#5A4636", water_edge: "#3C4152", lawn: "#1D3330", paving: "#2E3448", grass_paver: "#22382F", hedge: "#1E3A2E", water: "#1C4F8C", deck: "#5A4636", planter: "#3C4152" };
      const mats = new Map<string, THREE.Material>();
      const matOf = (src: THREE.Material) => {
        const n = src.name; if (mats.has(n)) return mats.get(n)!;
        const c = new THREE.Color(night ? NC[n] ?? "#3A4258" : PC[n] ?? "#ffffff");
        if (!night && !PC[n]) c.copy((src as THREE.MeshStandardMaterial).color);
        const m = new THREE.MeshLambertMaterial({ color: c }); m.name = n;
        if (n === "rail_glass") { m.transparent = true; m.opacity = 0.75; }
        if (n === "canopy_glass") { m.transparent = true; m.opacity = 0.85; }
        if (n === "glass" || n === "office_glass") { m.emissive.set(night ? "#FFC878" : "#9FB6CC"); m.emissiveIntensity = night ? 0.5 : 0.12; }
        if (night && (n === "light" || n === "led")) { m.color.set("#FFE6B8"); m.emissive.set("#FFD08A"); m.emissiveIntensity = n === "led" ? 1.2 : 1.8; }
        if (night && n === "canopy_glass") { m.emissive.set("#F2C77E"); m.emissiveIntensity = 0.8; }
        if (night && n === "venue_white") { m.emissive.set("#C8D4F0"); m.emissiveIntensity = 0.3; }
        if (night && n === "water") { m.emissive.set("#2E7CC8"); m.emissiveIntensity = 0.42; }
        mats.set(n, m); return m;
      };
      const flat = /^(lawn|paving|path|curb|planter|water_edge|grass_paver|asphalt|water|sidewalk|median_green|deck)$/;
      // over：按网格所在节点换材质（夜景写字楼玻璃换灯光秀、近景城市墙体用城市白模同一材质）
      const prep = (src: THREE.Object3D, over?: (m: THREE.Mesh, name: string) => THREE.Material | null) => {
        const g = src.clone(true);
        g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const nm = (m.material as THREE.Material).name; m.material = over?.(m, nm) ?? matOf(m.material as THREE.Material); m.castShadow = !flat.test(nm); m.receiveShadow = true; });
        return g;
      };
      const nodeOf = (o: THREE.Object3D, re: RegExp) => { let p: THREE.Object3D | null = o; while (p && !re.test(p.name)) p = p.parent; return p; };
      const showMats = new Map<string, THREE.Material>();
      const show = (key: string, top: number) => { if (!showMats.has(key)) showMats.set(key, showLit(-1.5, top + 1.5, (key.length * 0.137 + key.charCodeAt(key.length - 1) * 0.071) % 1)); return showMats.get(key)!; };
      const topOf = (n: THREE.Object3D) => new THREE.Box3().setFromObject(n).max.y;
      // A 瑞府楼栋：写字楼玻璃夜里走灯光秀
      // 夜景住宅玻璃：和城市白模一样按格随机亮窗（整片自发光会让整栋楼发橙）
      const winMat = (() => { if (!night) return null; const m = skin(lam("#3A4558"), { lit: 1 }); m.userData.u.uHideR = { value: Array.from({ length: 6 }, () => OFF) }; return m; })();
      const ruifuG = prep(R.ruifu, (m, nm) => {
        if (!night) return null;
        if (nm === "glass") return winMat;
        if (nm !== "office_glass") return null;
        const p = nodeOf(m, /^ruifu_(b\d+|t\d|s1)$/); return p && OFFICE.test(p.name) ? show(p.name, topOf(p) - 1.5) : null;
      });
      const tnodes: Record<string, THREE.Object3D> = {};
      ruifuG.children.forEach((o) => { if (/^ruifu_(b\d+|t\d|s1)$/.test(o.name)) tnodes[o.name] = o; });
      // 单元凹槽压暗（006b 约定）：凹槽并在 _glass、_rails 里，按几何挑出来——比主玻璃再退进约 0.5m 的长边玻璃（凹槽背板），
      // 以及法线沿长边方向、不在楼端头的栏板面（凹槽侧壁）；拆成单独网格，换深色
      const grooveMat = lam(night ? "#1E2430" : "#4D5D6E");
      const split = (m: THREE.Mesh, pick: (n: THREE.Vector3, c: THREE.Vector3) => boolean) => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(), pa = g.attributes.position;
        const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
        const keep: number[] = [], take: number[] = [];
        for (let t = 0; t < pa.count / 3; t++) {
          A.fromBufferAttribute(pa, 3 * t); B.fromBufferAttribute(pa, 3 * t + 1); C.fromBufferAttribute(pa, 3 * t + 2);
          n.subVectors(C, B).cross(new THREE.Vector3().subVectors(A, B)).normalize(); c.copy(A).add(B).add(C).divideScalar(3);
          (pick(n, c) ? take : keep).push(t);
        }
        if (!take.length) return;
        const sub = (ts: number[]) => { const o = new THREE.BufferGeometry(); for (const [k, at] of Object.entries(g.attributes)) { const sz = at.itemSize, src = at.array as Float32Array, out = new Float32Array(ts.length * 3 * sz); ts.forEach((t, j) => out.set(src.subarray(t * 3 * sz, (t + 1) * 3 * sz), j * 3 * sz)); o.setAttribute(k, new THREE.BufferAttribute(out, sz)); } return o; };
        m.geometry = sub(keep);
        const gm = new THREE.Mesh(sub(take), grooveMat); gm.position.copy(m.position); gm.quaternion.copy(m.quaternion); gm.scale.copy(m.scale); gm.castShadow = gm.receiveShadow = true; m.parent!.add(gm);
      };
      for (const [n, root] of Object.entries(tnodes)) {
        if (OFFICE.test(n) || n === "ruifu_s1") continue;
        const meshes: THREE.Mesh[] = []; root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
        const glass = meshes.filter((m) => (m.material as THREE.Material).name === "glass" && /_glass(_\d+)?$/.test(nodeOf(m, /^ruifu_b\d+_/)?.name ?? ""));
        if (!glass.length) continue;
        const bb = new THREE.Box3(); glass.forEach((m) => { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox!); });
        const zMax = Math.max(-bb.min.z, bb.max.z), xMax = Math.max(-bb.min.x, bb.max.x);
        const gx: number[] = [];
        glass.forEach((m) => split(m, (nn, c) => { const hit = Math.abs(nn.z) > 0.9 && Math.abs(c.z) < zMax - 0.3 && Math.abs(c.x) < xMax - 1; if (hit && !gx.some((x) => Math.abs(x - c.x) < 1.2)) gx.push(c.x); return hit; }));
        // 凹槽宽度范围内、背板以外的楼板和栏板（侧壁、断面、俯视时看到的楼板顶面）一起压暗，否则一层层白色楼板会叠成一条浅色虚线
        meshes.filter((m) => /^(rail_glass|wall)$/.test((m.material as THREE.Material).name) && /_(rails|slabs)(_\d+)?$/.test(nodeOf(m, /^ruifu_b\d+_/)?.name ?? "")) // 多材质节点加载后网格名带 _1、_2 后缀
          .forEach((m) => split(m, (nn, c) => Math.abs(c.z) > zMax - 0.6 && gx.some((x) => Math.abs(c.x - x) < 1.0)));
      }
      // D 长风商务区：塔楼玻璃夜里走灯光秀，万象城实墙夜里走彩色媒体立面
      R.cbd.updateMatrixWorld(true);
      const wxWall = lam(LANDMARK.wanxiang.wall); // 万象城外墙沿用片中的酒红色（用户确认过）
      const wxNight = nightLit("#3A3550", "#FF6FB0", -1.5, 15.9, 1);
      const cbdG = prep(R.cbd, (m, nm) => {
        const nd = nodeOf(m, /^cbd_/)?.name ?? "", t = /^cbd_(t\d)_/.exec(nd);
        if (!night) return /^cbd_wanxiang/.test(nd) && nm === "stone" ? wxWall : null;
        if (t && nm === "office_glass") return show("cbd_" + t[1], new THREE.Box3().setFromObject(m).max.y);
        if (/^cbd_wanxiang/.test(nd) && (nm === "stone" || nm === "office_glass")) return wxNight; // 店面玻璃和实墙同一层彩色媒体立面，泛光从楼脚往上走（同片中现状）
        return null;
      });
      cbdG.position.y = -1.5;
      cbdG.traverse((o) => { if (/^cbd_pit/.test(o.name)) o.visible = false; }); // 基坑继续用片中用户确认过的 9m 扁平方体
      // G 近景城市：墙和屋面用城市白模同一份材质（夜景亮窗、旧貌裁切一致），首层玻璃和设备另配
      const cityG = prep(R.city, (_m, nm) => nm === "wall" || nm === "roof" ? city.material as THREE.Material : nm === "mech" ? skin(lam(night ? "#3A4050" : "#D9D6D0"), { lit: 0 }) : skin(lam(night ? "#4A5868" : "#7A8D9C"), { lit: 0 }));
      cityG.position.y = -1.5;
      // B 小区园林、C 道路与滨河绿带、E 文化岛平台：地面略抬高，避免和烘焙底图共面闪烁
      const siteG = prep(R.site); siteG.position.y = -1.42;
      const streetG = prep(R.street); streetG.position.y = -1.25;
      const riverG = prep(R.riverside); riverG.position.y = -1.48;
      const islandG = prep(R.island);
      // 原型实例
      const inst = (protos: THREE.Object3D, rows: [string, number, number, number, number, number][], y0: number) => {
        const g = new THREE.Group(); protos.updateMatrixWorld(true);
        const by = new Map<string, typeof rows>(); rows.forEach((r) => (by.get(r[0]) ?? by.set(r[0], []).get(r[0])!).push(r));
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        for (const [name, rs] of by) {
          const proto = protos.getObjectByName(name); if (!proto) continue;
          const inv = proto.matrixWorld.clone().invert();
          proto.traverse((o) => {
            const pm = o as THREE.Mesh; if (!pm.isMesh) return;
            const geo = pm.geometry.clone(); geo.applyMatrix4(pm.matrixWorld.clone().premultiply(inv));
            const im = new THREE.InstancedMesh(geo, matOf(pm.material as THREE.Material), rs.length);
            rs.forEach(([, x, y, z, ry, sc], i) => { M.compose(new THREE.Vector3(x, y0 + y, z), q.setFromAxisAngle(up, ry), new THREE.Vector3(sc, sc, sc)); im.setMatrixAt(i, M); });
            im.castShadow = true; im.receiveShadow = true; g.add(im);
          });
        }
        return g;
      };
      const siteI = inst(R.siteProtos, R.siteInst, -1.42), streetI = inst(R.streetProtos, R.streetInst, -1.25), islandI = inst(R.islandProtos, R.islandInst, 0);
      const islandP = new THREE.Group(); islandP.add(islandG, islandI);
      const ground = new THREE.Group(); ground.add(siteG, siteI, streetG, riverG, streetI);
      const g = new THREE.Group(); g.add(ruifuG, cbdG, cityG, ground, islandP);
      return { g, ruifu: ruifuG, tnodes, cbd: cbdG, city: cityG, ground, island: islandP };
    })();
    // 近景路面：比底图更清楚的路面边缘、车道线和车流（只在项目附近、白天近景显示）
    const roadDet = (() => {
      const g = new THREE.Group(), paths: { pts: [number, number][]; cum: number[]; L: number }[] = [];
      if (night || !roadFeat) return { g, paths, cars: null as THREE.InstancedMesh | null };
      const BB = [-800, 1000, 150, 1900];
      const W: Record<string, number> = { trunk: 26, primary: 20, secondary: 14, tertiary: 8 };
      const C: Record<string, string> = { trunk: "#A7AEB4", primary: "#BCC2C7", secondary: "#CDD2D6", tertiary: "#E0E3E6" };
      const Y: Record<string, number> = { tertiary: -1.52, secondary: -1.47, primary: -1.42, trunk: -1.37 };
      const parts: Record<string, THREE.BufferGeometry[]> = { trunk: [], primary: [], secondary: [], tertiary: [] };
      const dash: THREE.Matrix4[] = [], solid: THREE.Matrix4[] = [];
      const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      const seg = (arr: THREE.Matrix4[], x: number, z: number, ang: number, len: number, wid: number) => { q.setFromAxisAngle(up, -ang); arr.push(new THREE.Matrix4().compose(new THREE.Vector3(x, -1.3, z), q, new THREE.Vector3(len, 1, wid))); };
      for (const f of roadFeat) {
        const cls = f.properties.class, w = W[cls]; if (!w) continue;
        const pts = f.geometry.coordinates as [number, number][];
        const sid = f.properties.source_id, binhe = sid === "way/328706009" || sid === "way/351806756";
        if (!pts.some(([x, z]) => x > BB[0] && x < BB[1] && z > BB[2] && z < BB[3])) continue;
        const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        if (cls === "trunk") paths.push({ pts, cum, L: cum[cum.length - 1] });
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
          const ang = Math.atan2(bz - az, bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
          if (REFINE && ((binhe && mz > 300 && mz < 1800) || (sid === "way/892698945" && mx > -250 && mx < 400 && mz > 600 && mz < 1500))) continue; // 这一段已由精细化道路模型（C 包）接管
          const pg = new THREE.PlaneGeometry(len + w * 0.5, w); pg.rotateX(-Math.PI / 2); pg.rotateY(-ang); pg.translate(mx, Y[cls], mz); parts[cls].push(pg);
          if (cls === "tertiary") continue;
          const nx = -Math.sin(ang), nz = Math.cos(ang);
          const lanes = cls === "trunk" ? 4 : cls === "primary" ? 4 : 2, lw = 3.5, half = (lanes * lw) / 2;
          for (const o of [-half - 0.3, half + 0.3]) seg(solid, mx + nx * o, mz + nz * o, ang, len, 0.3); // 车道外侧实线
          for (let k = 1; k < lanes; k++) { // 车道分隔虚线：6 米划线、9 米间隔
            const o = -half + k * lw;
            for (let d = (cum[i - 1] % 15); d < len; d += 15) { const L = Math.min(6, len - d); if (L < 1) continue; const t0 = (d + L / 2) / len; seg(dash, ax + (bx - ax) * t0 + nx * o, az + (bz - az) * t0 + nz * o, ang, L, 0.22); }
          }
        }
      }
      for (const cls of Object.keys(parts)) if (parts[cls].length) { const m = new THREE.Mesh(mergeGeometries(parts[cls]), new THREE.MeshLambertMaterial({ color: C[cls] })); m.receiveShadow = true; g.add(m); }
      const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
      const mkI = (arr: THREE.Matrix4[], c: string) => { const m = new THREE.InstancedMesh(plane, new THREE.MeshLambertMaterial({ color: c }), arr.length); arr.forEach((M, i) => m.setMatrixAt(i, M)); m.receiveShadow = true; return m; };
      g.add(mkI(dash, "#F7F6F2"), mkI(solid, "#F2F1EC"));
      const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 1.5, 1.9), new THREE.MeshLambertMaterial({ color: "#ffffff" }), paths.length * 36);
      { const cc = new THREE.Color(); for (let i = 0; i < cars.count; i++) cars.setColorAt(i, cc.set(["#F2F0EA", "#2B2622", "#8D96A0", "#C25A2C", "#E8E4DC", "#4F6F8A", "#6F665C"][(i * 3) % 7])); }
      cars.castShadow = true; g.add(cars);
      return { g, paths, cars };
    })();
    // 汾河上的桥：材质按名字换成扁平配色；夜里灯带、拱和索按实景灯光色发光（南中环紫红、跻汾蓝、长风暖黄）
    const bridges = new THREE.Group();
    const NIGHT_GLOW: Record<string, string> = { changfeng: "#FFCC80", jifen: "#5AA8FF", nanzhonghuan: "#D45AE0" };
    for (const src of bake!.bridges) {
      const g = src.clone(true); const id = src.userData.id as string;
      g.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const name = (m.material as THREE.Material).name;
        const base = (m.material as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color("#ccc");
        const mm = new THREE.MeshLambertMaterial({ color: base }); mm.name = name;
        if (night && id === "jifen" && name === "rail") { mm.emissive.set("#5AA8FF"); mm.emissiveIntensity = 1.1; }
        if (night) {
          if (name === "light") { mm.color.set(NIGHT_GLOW[id] === "#FFCC80" ? "#FFE0A8" : NIGHT_GLOW[id]); mm.emissive.set(NIGHT_GLOW[id]); mm.emissiveIntensity = 1.4; }
          else if (name === "structure" || name === "cable") { mm.color.set("#9AA6C4"); if (id !== "changfeng") { mm.emissive.set(NIGHT_GLOW[id]); mm.emissiveIntensity = 0.55; } }
          else if (name === "deck") { mm.color.set("#3A3F55"); }
          else { mm.color.multiplyScalar(0.45); }
        }
        m.material = mm; m.castShadow = name !== "cable"; m.receiveShadow = true;
      });
      bridges.add(g);
    }
    // 桥面细部（长风桥、南中环桥两座直桥）：中央绿化带、白色车道虚线、两侧白色防撞墙压顶、中分带双臂路灯；车流另外按帧更新
    const bridgeCars: { mesh: THREE.InstancedMesh; lanes: { o: number; dir: number; y: (s: number) => number }[]; c: [number, number]; d: [number, number]; L: number }[] = [];
    {
      const BD = [{ id: "changfeng", c: [713.3, -1129.6] as [number, number], d: [1, -0.0015] as [number, number], L: 560 }, { id: "nanzhonghuan", c: [592.5, 1521.8] as [number, number], d: [0.99993, -0.01206] as [number, number], L: 530 }];
      const rc = new THREE.Raycaster();
      bridges.updateMatrixWorld(true);
      const decks: THREE.Object3D[] = []; bridges.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material) && /deck/.test(((m.userData as any).mat ?? "") + "")) decks.push(m); });
      const allMeshes: THREE.Object3D[] = []; bridges.traverse((o) => { if ((o as THREE.Mesh).isMesh) allMeshes.push(o); });
      const box = new THREE.BoxGeometry(1, 1, 1);
      const W = night ? "#FFF3D8" : "#FFFFFF";
      for (const b of BD) {
        const n: [number, number] = [-b.d[1], b.d[0]]; // 桥面横向
        const at = (s_: number, o: number) => [b.c[0] + b.d[0] * s_ + n[0] * o, b.c[1] + b.d[1] * s_ + n[1] * o] as [number, number];
        const yAt = (s_: number, o: number) => { const [x, z] = at(s_, o); rc.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0)); const hit = rc.intersectObjects(allMeshes, false).find((h) => h.point.y > 3 && h.point.y < 20 && !/cable|structure|light/.test(((h.object as THREE.Mesh).material as THREE.Material).name)); return hit ? hit.point.y : NaN; };
        const ang = Math.atan2(b.d[1], b.d[0]);
        const dash: THREE.Matrix4[] = [], med: THREE.Matrix4[] = [], poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], par: THREE.Matrix4[] = [];
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
        const put = (arr: THREE.Matrix4[], s_: number, o: number, y: number, sx: number, sy: number, sz: number) => { const [x, z] = at(s_, o); arr.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))); };
        for (let s_ = -b.L / 2; s_ < b.L / 2; s_ += 3) {
          const y0 = yAt(s_, 0); if (isNaN(y0)) continue;
          put(med, s_, 0, y0 + 0.35, 3.2, 0.7, 2.6);
          if (Math.round(s_ / 3) % 3 === 0) for (const o of [-18.3, -14.4, -10.5, -6.6, 6.6, 10.5, 14.4, 18.3]) { const yy = yAt(s_, o); if (!isNaN(yy)) put(dash, s_, o, yy + 0.04, 3.0, 0.06, 0.18); }
          for (const o of [-25.6, 25.6]) { const yy = yAt(s_, o * 0.96); if (!isNaN(yy)) put(par, s_, o, yy + 0.6, 3.05, 1.2, 0.5); }
          if (Math.round(s_ / 3) % 10 === 0) { put(poles, s_, 0, y0 + 6.5, 0.35, 12, 0.35); put(heads, s_, -2.6, y0 + 12.4, 0.9, 0.35, 5.2); put(heads, s_, 2.6, y0 + 12.4, 0.9, 0.35, 5.2); }
        }
        const mk = (arr: THREE.Matrix4[], mat: THREE.Material, sh = true) => { const m = new THREE.InstancedMesh(box, mat, arr.length); arr.forEach((M, i) => m.setMatrixAt(i, M)); m.castShadow = sh; m.receiveShadow = true; bridges.add(m); };
        mk(med, lam(night ? "#1E3A2E" : "#8DB37A"));
        mk(dash, new THREE.MeshBasicMaterial({ color: W }), false);
        mk(par, lam(night ? "#8A93AE" : "#F3F1EC"));
        mk(poles, lam(night ? "#3A4258" : "#9AA0A8"));
        { const hm = lam(night ? "#FFE6B8" : "#E8E4DA"); if (night) { hm.emissive.set("#FFD08A"); hm.emissiveIntensity = 2.2; } mk(heads, hm, false); }
        // 车流：每个方向 4 条车道
        const lanes = [-16.3, -12.4, -8.6, -4.8, 4.8, 8.6, 12.4, 16.3].map((o) => ({ o, dir: o > 0 ? 1 : -1, y: (s_: number) => yAt(s_, o) }));
        const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 1.5, 1.9), night ? new THREE.MeshBasicMaterial({ color: "#ffffff" }) : lam("#ffffff"), 64);
        const cc = new THREE.Color();
        for (let i = 0; i < 64; i++) cm.setColorAt(i, night ? cc.set(lanes[i % 8].dir > 0 ? "#FFE9B8" : "#FF6A5A") : cc.set(["#C25A2C", "#4F8BA6", "#6F665C", "#E8E4DC", "#2B2622"][i % 5]));
        cm.castShadow = true; bridges.add(cm);
        bridgeCars.push({ mesh: cm, lanes, c: b.c, d: b.d, L: b.L });
      }
    }
    // 和园精细模型（建模交付）：园内材质换成扁平配色，树按树种实例化
    const heyuan = new THREE.Group();
    { const H = bake!.heyuan;
      const poly = w.parks.find((p) => p.id === "way/996055599")!.poly;
      poly.slice(0, 32).forEach(([x, z], i) => PARK_U.uPark.value[i].set(x, z)); PARK_U.uParkN.value = Math.min(32, poly.length);
      const sc = H.scene.clone(true);
      const NIGHTC: Record<string, string> = { lawn: "#1D3330", lawn_dark: "#183028", paving: "#2A3046", paving_red: "#4A3036", path: "#B48A50", water: "#1C4F8C", bank: "#2A2F40", sand: "#3A3A44", building: "#C8D2EA", roof: "#3A4258", glass: "#FFD08A", wood: "#5A4636", stone: "#3C4152", metal: "#4A5268", lamp: "#FFE0A0", shrub: "#1E3A2E" };
      sc.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const name = (m.material as THREE.Material).name; const base = (m.material as THREE.MeshStandardMaterial).color.clone();
        const mm = new THREE.MeshLambertMaterial({ color: night ? new THREE.Color(NIGHTC[name] ?? "#2A3046") : base }); mm.name = name;
        if (night && (name === "lamp" || name === "glass")) { mm.emissive.set(name === "lamp" ? "#FFD08A" : "#FFC070"); mm.emissiveIntensity = name === "lamp" ? 1.6 : 0.8; }
        if (night && name === "water") { mm.emissive.set("#2E7CC8"); mm.emissiveIntensity = 0.42; }
        if (night && name === "building") { mm.emissive.set("#C8D4F0"); mm.emissiveIntensity = 0.4; }
        m.material = mm; m.castShadow = !/lawn|water|paving|path|sand|bank/.test(name); m.receiveShadow = true;
      });
      heyuan.add(sc);
      // 花境：沿园路两侧和水岸成段种植，按“段”分色（粉、黄、紫、白、橙），不满铺，留出草坪
      { sc.updateMatrixWorld(true);
        const tri: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = []; const edge: [number, number][] = [];
        sc.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const nm = (m.material as THREE.Material).name;
          const pos = m.geometry.attributes.position, idx = m.geometry.index; const W = m.matrixWorld;
          const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(W);
          if (nm === "lawn" || nm === "lawn_dark") { const n = idx ? idx.count : pos.count; for (let k = 0; k < n; k += 3) { const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, c = idx ? idx.getX(k + 2) : k + 2; tri.push([v(a), v(b), v(c)]); } }
          if (nm === "path" || nm === "paving" || nm === "bank") for (let i = 0; i < pos.count; i += 2) { const p = v(i); edge.push([p.x, p.z]); } });
        const grid = new Map<string, [number, number][]>(); const key = (x: number, z: number) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
        edge.forEach((e) => { const k = key(e[0], e[1]); (grid.get(k) ?? grid.set(k, []).get(k)!).push(e); });
        const near = (x: number, z: number, r: number) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const e of grid.get(`${Math.floor(x / 4) + i},${Math.floor(z / 4) + j}`) ?? []) if ((e[0] - x) ** 2 + (e[1] - z) ** 2 < r * r) return true; return false; };
        const tr2 = H.trees.map((r) => [r[0], r[1], r[3] / 2] as const);
        const underTree = (x: number, z: number) => tr2.some(([tx, tz, cr]) => (tx - x) ** 2 + (tz - z) ** 2 < (cr * 0.8) ** 2);
        const areas = tri.map(([a, b, c]) => new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2);
        const tot = areas.reduce((x, y) => x + y, 0); const cum: number[] = []; areas.reduce((acc, x, i) => (cum[i] = acc + x), 0);
        const rr = (i: number) => { const x = Math.sin(i * 91.7 + 13.1) * 43758.5453; return x - Math.floor(x); };
        const COLS = night ? ["#B05A8C", "#C8A040", "#7A5AB0", "#C8C8D8", "#C8703A"] : ["#F2A7C3", "#F6D06A", "#B79BE0", "#FFFFFF", "#F4A15C"];
        const pts: [number, number, number, number, number][] = [];
        for (let i = 0; tri.length && pts.length < 2600 && i < 60000; i++) {
          const t = rr(i) * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const md = (lo + hi) >> 1; if (cum[md] < t) lo = md + 1; else hi = md; }
          const [a, b, c] = tri[lo]; let u = rr(i + 7), w2 = rr(i + 13); if (u + w2 > 1) { u = 1 - u; w2 = 1 - w2; }
          const p = a.clone().addScaledVector(new THREE.Vector3().subVectors(b, a), u).addScaledVector(new THREE.Vector3().subVectors(c, a), w2);
          if (!near(p.x, p.z, 3.2) || near(p.x, p.z, 0.9) || underTree(p.x, p.z)) continue;
          const seg = Math.floor(p.x / 14) * 7 + Math.floor(p.z / 14) * 3; if (rr(seg) < 0.35) continue; // 分段：一部分路边只留草
          pts.push([p.x, p.y, p.z, Math.abs(seg) % 5, 0.45 + rr(i + 3) * 0.5]);
        }
        const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: "#ffffff" }), pts.length);
        const FM = new THREE.Matrix4(), fc = new THREE.Color();
        pts.forEach(([x, y, z, ci, sz], i) => { FM.compose(new THREE.Vector3(x, y + sz * 0.3, z), new THREE.Quaternion(), new THREE.Vector3(sz * 1.3, sz * 0.55, sz * 1.3)); fl.setMatrixAt(i, FM); fl.setColorAt(i, fc.set(COLS[ci])); });
        fl.receiveShadow = true; heyuan.add(fl); }
      const M = new THREE.Matrix4(), q = new THREE.Quaternion();
      H.protos.updateMatrixWorld(true);
      for (let sp = 0; sp < 5; sp++) {
        const proto = H.protos.getObjectByName(`tree_proto_${sp}`); if (!proto) continue;
        const rows = H.trees.map((r, i) => [r, H.ty[i]] as const).filter(([r]) => r[4] === sp);
        proto.traverse((o) => {
          const pm = o as THREE.Mesh; if (!pm.isMesh) return;
          const geo = pm.geometry.clone(); geo.applyMatrix4(pm.matrixWorld.clone().premultiply(new THREE.Matrix4().copy(proto.matrixWorld).invert()));
          const mname = (pm.material as THREE.Material).name;
          const col = night ? (mname === "tree_trunk" ? "#2A2622" : ["#1E3A2E", "#183327", "#22402F", "#2A4A35", "#3A3448"][sp]) : (pm.material as THREE.MeshStandardMaterial).color;
          const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: col }), rows.length);
          rows.forEach(([r, gy], i) => { M.compose(new THREE.Vector3(r[0], gy, r[1]), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.399) % 6.28), new THREE.Vector3(r[3], r[2], r[3])); im.setMatrixAt(i, M); });
          im.castShadow = true; im.receiveShadow = true; heyuan.add(im);
        });
      }
    }
    // 五馆脚下和四周15米不种树，留出场地
    const clear = venues.map((g) => new THREE.Box3().setFromObject(g).expandByVector(new THREE.Vector3(15, 0, 15)));
    // 烘焙地面：按世界坐标取样，地面和文化岛平台顶面共用一张图（草坪、步道、道路分级都在图里）
    const B = bake!;
    const worldMap = () => {
      const m = new THREE.MeshLambertMaterial({ map: night ? B.night : B.day });
      if (night) { m.emissiveMap = B.night; m.emissive.set("#ffffff"); m.emissiveIntensity = 0.75; }
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, PARK_U);
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWG;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWG = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
          varying vec3 vWG; uniform vec2 uPark[32]; uniform int uParkN; uniform float uParkOn;
          bool inPark(vec2 p) { bool c = false; for (int i = 0, j = 31; i < 32; j = i++) { if (i >= uParkN) break; int jj = (i == 0) ? uParkN - 1 : i - 1; vec2 a = uPark[i], b = uPark[jj]; if (((a.y > p.y) != (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) c = !c; } return c; }`)
          .replace("void main() {", "void main() {\n          if (uParkOn > 0.5 && inPark(vWG.xz)) discard;");
        sh.vertexShader = sh.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
          vec4 wpG = modelMatrix * vec4(position, 1.0);
          vMapUv = vec2((wpG.x - (${B.bounds[0].toFixed(1)})) / ${B.bounds[2].toFixed(1)}, 1.0 - (wpG.z - (${B.bounds[1].toFixed(1)})) / ${B.bounds[2].toFixed(1)});`);
      };
      m.customProgramCacheKey = () => "worldmap2";
      return m;
    };
    const groundGeo = new THREE.PlaneGeometry(B.bounds[2], B.bounds[2]); groundGeo.rotateX(-Math.PI / 2); groundGeo.translate(B.bounds[0] + B.bounds[2] / 2, -1.55, B.bounds[1] + B.bounds[2] / 2);
    const ground = new THREE.Mesh(groundGeo, worldMap()); ground.receiveShadow = true;
    const oldMat = worldMap(); (oldMat as THREE.MeshLambertMaterial).map = B.old;
    const groundOld = new THREE.Mesh(groundGeo, oldMat); groundOld.receiveShadow = true;
    // 远处地形：西山。近处（远景底图范围内）压到地面以下，避免盖住湖面和城区
    const tg = w.terrain.clone(); const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = tp.getZ(i); const y = tp.getY(i); tp.setY(i, y > 40 ? y - 1 : Math.min(y, -4) - 1); } // 只留山地，盆地压到地面以下
    tg.computeVertexNormals();
    // 西山：按高度和朝向着色——山脚、沟谷是成片的绿（植被），山脊偏土黄，避免一整片灰白
    { const cols = new Float32Array(tp.count * 3); const c = new THREE.Color(), g1 = new THREE.Color("#9DBB86"), g2 = new THREE.Color("#B7CB9C"), dry = new THREE.Color("#D9CDB2");
      const nrm = tg.attributes.normal;
      for (let i = 0; i < tp.count; i++) { const y = tp.getY(i), x = tp.getX(i), z = tp.getZ(i);
        const nz = Math.sin(x * 0.004) * Math.cos(z * 0.005) * 0.5 + Math.sin(x * 0.011 + z * 0.007) * 0.5; // 斑块
        const steep = 1 - nrm.getY(i);
        const k = Math.min(1, Math.max(0, (y - 120) / 650 + steep * 0.8 - nz * 0.25));
        c.copy(g1).lerp(g2, Math.max(0, nz) ).lerp(dry, k * 0.85);
        if (night) c.multiplyScalar(0.28);
        cols.set([c.r, c.g, c.b], i * 3); }
      tg.setAttribute("color", new THREE.BufferAttribute(cols, 3)); }
    const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true })); terrain.receiveShadow = true;
    // 远景：向西南扩到晋阳湖的地面和建筑（近景地面压在上面）
    const F = B.far;
    const farMat = new THREE.MeshLambertMaterial({ map: night ? F.night : F.day });
    if (night) { farMat.emissiveMap = F.night; farMat.emissive.set("#ffffff"); farMat.emissiveIntensity = 0.7; }
    farMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
        vec4 wpF = modelMatrix * vec4(position, 1.0);
        vMapUv = vec2((wpF.x - (${F.bounds[0].toFixed(1)})) / ${F.bounds[2].toFixed(1)}, 1.0 - (wpF.z - (${F.bounds[1].toFixed(1)})) / ${F.bounds[2].toFixed(1)});`);
    };
    farMat.customProgramCacheKey = () => "farmap";
    const farGeo = new THREE.PlaneGeometry(F.bounds[2], F.bounds[2]); farGeo.rotateX(-Math.PI / 2); farGeo.translate(F.bounds[0] + F.bounds[2] / 2, -2.3, F.bounds[1] + F.bounds[2] / 2);
    const farGround = new THREE.Mesh(farGeo, farMat); farGround.receiveShadow = true;
    const farCity = new THREE.Mesh(F.city, city.material); farCity.castShadow = farCity.receiveShadow = true;
    const isl = new THREE.ExtrudeGeometry(shape(w.island), { depth: 6, bevelEnabled: false }); isl.rotateX(-Math.PI / 2); isl.translate(0, -1.5, 0);
    const island = new THREE.Mesh(isl, worldMap()); island.castShadow = island.receiveShadow = true;
    (island.material as THREE.MeshLambertMaterial).transparent = true;
    // 平台下穿行的车：沿广北街、广南街（从文化岛平台底下穿过）来回开
    const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 1.6, 2.0), lam("#ffffff"), 48);
    { const cc = new THREE.Color(); for (let i = 0; i < 48; i++) cars.setColorAt(i, cc.set(["#C25A2C", "#4F8BA6", "#6F665C", "#E8E4DC", "#2B2622"][i % 5])); }
    cars.castShadow = true;
    const fen = new THREE.Mesh(w.fen, night ? lam(N.water) : waterMat("#5C9AC6")), inner = new THREE.Mesh(w.inner, innerMat(night ? N.water : P.water, w.islandC as [number, number]));
    fen.receiveShadow = inner.receiveShadow = true;
    if (night) [fen, inner].forEach((m) => { const mm = m.material as THREE.MeshLambertMaterial; mm.color.set("#1C4F8C"); mm.emissive.set("#2E7CC8"); mm.emissiveIntensity = 0.42; });
    // 树：公园密林、草地散树、开阔空地成丛、主干道行道树（烘焙脚本算好位置）；文化岛平台上的树抬到平台高度
    const heyuanPoly = w.parks.find((p) => p.id === "way/996055599")!.poly;
    const spotsAll = B.trees.filter(([x, z]) => !clear.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z));
    const spotsOut = spotsAll.filter(([x, z]) => !inPoly(x, z, heyuanPoly));
    const M = new THREE.Matrix4(), col = new THREE.Color();
    const tc = night ? N.trees : P.trees;
    const mkTrees = (spots: typeof spotsAll) => {
      const tr = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), lam("#ffffff"), spots.length);
      spots.forEach(([x, z, s, c], i) => {
        const base = inPoly(x, z, w.island) ? 4.5 : -1.5;
        M.compose(new THREE.Vector3(x, base + s * 0.85, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.82, s));
        tr.setMatrixAt(i, M); tr.setColorAt(i, col.set(tc[c % 4]));
      });
      tr.castShadow = tr.receiveShadow = true;
      return tr;
    };
    const NEAR_T = [-500, 800, 250, 1750];
    const nearT = (x: number, z: number) => x > NEAR_T[0] && x < NEAR_T[1] && z > NEAR_T[2] && z < NEAR_T[3];
    const mkNiceTrees = (spots: typeof spotsAll) => {
      // 树冠：四个小球拼成一团，底部压暗、顶部提亮（顶点色），比单个多面球更像树
      const blobs = [[0, 0.15, 0, 0.72], [0.42, -0.12, 0.18, 0.55], [-0.38, -0.08, -0.25, 0.56], [0.05, 0.42, -0.12, 0.48]].map(([x, y, z, r]) => { const b = new THREE.IcosahedronGeometry(r, 2); b.translate(x, y, z); return b; });
      const cg = mergeGeometries(blobs); const pos = cg.getAttribute("position"); const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const k = 0.62 + 0.38 * THREE.MathUtils.clamp((pos.getY(i) + 0.75) / 1.5, 0, 1); cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k; }
      cg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      const can = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true }), spots.length);
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 1, 6), lam(night ? "#2A2620" : "#8A7660"), spots.length);
      const qy = new THREE.Quaternion();
      spots.forEach(([x, z, s, c], i) => {
        const base = inPoly(x, z, w.island) ? 4.5 : -1.5, rot = ((x * 13.1 + z * 7.3) % 6.28);
        qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        M.compose(new THREE.Vector3(x, base + s * 1.05, z), qy, new THREE.Vector3(s * 0.95, s * 0.8, s * 0.95)); can.setMatrixAt(i, M);
        can.setColorAt(i, col.set(tc[c % 4]).offsetHSL(0, 0, ((i * 37) % 9 - 4) * 0.012));
        M.compose(new THREE.Vector3(x, base + s * 0.3, z), qy, new THREE.Vector3(s, s * 0.6, s)); trunk.setMatrixAt(i, M);
      });
      can.castShadow = can.receiveShadow = true; trunk.castShadow = true;
      const g = new THREE.Group(); g.add(can, trunk); return g;
    };
    // 精细化时，小区、道路、岛上的树取新交付的位置和冠径，画法仍用片中的树（全片树木风格一致）
    const siteSpots = B.refine ? [...B.refine.siteTrees, ...B.refine.streetTrees, ...B.refine.islandTrees].map(([x, z, d], i) => [x, z, d * 0.525, i % 4] as typeof spotsAll[0])
      : B.site.trees.map(([x, z, r], i) => [x, z, r * 1.05, i % 4] as typeof spotsAll[0]);
    const trees = new THREE.Group(); trees.add(mkTrees(spotsOut.filter(([x, z]) => !nearT(x, z))), mkNiceTrees([...spotsOut.filter(([x, z]) => nearT(x, z)), ...siteSpots]));
    if (!REFINE) { // 小区里草坪和铺装交界处的矮灌木（树篱感），build_site.py 生成位置
      const sh = bake!.site.shrubs, g = new THREE.IcosahedronGeometry(1, 1);
      const m = new THREE.InstancedMesh(g, lam("#ffffff"), sh.length), qy = new THREE.Quaternion();
      sh.forEach(([x, z, r], i) => { M.compose(new THREE.Vector3(x, -1.5 + r * 0.45, z), qy, new THREE.Vector3(r * 1.3, r * 0.6, r * 1.3)); m.setMatrixAt(i, M); m.setColorAt(i, col.set(night ? "#1F3A2C" : ["#6E9A5C", "#7FA868", "#5F8C52"][i % 3])); });
      m.castShadow = m.receiveShadow = true; trees.add(m);
    }
    const treesPark = mkTrees(spotsAll.filter(([x, z]) => inPoly(x, z, heyuanPoly))); // treesPark：旧版和园里的程序树，只在对比图里显示
    // 视线扇形：前方（和园、晋阳湖、谐园）赤陶，身后（汾河、五馆）水蓝
    const front = new THREE.Mesh(fanGeo(0, 360, 1000, 0.42), fanMat(P.hero));
    const back = new THREE.Mesh(fanGeo(0, 360, 760, 0.5), fanMat(P.waterInk));
    front.renderOrder = back.renderOrder = 2;
    return { city, ruifu, nodes, heroMats, venues, wanxiang, roof, supp, det, roadDet, siteGround, pilot, refine, bridges, bridgeCars, heyuan, treesPark, ground, groundOld, terrain, farGround, farCity, island, cars, fen, inner, trees, front, back };
  }, [w, night]);

  // 按帧更新
  const ident = new THREE.Quaternion();
  for (const [name, { o, q }] of Object.entries(objs.nodes)) {
    const g = st.grow ? st.grow(name) : 1;
    o.visible = g > 0.003; o.scale.y = Math.max(0.003, g) * (H_SCALE[name] ?? 1);
    if (name === "ruifu_b01" || name === "ruifu_b02") o.quaternion.copy(ident).slerp(q, st.turn ?? 1);
  }
  if (objs.refine) { // 精细化楼栋：近景换上（1、2号楼要等立面模式）；跟随原节点的位置、转角、生长
    const R = objs.refine; objs.pilot.g.visible = false;
    const span = 2 * cam.position.distanceTo(new THREE.Vector3(PAIR[0], 40, PAIR[1])) * Math.tan((cam.fov * Math.PI) / 360);
    objs.ruifu.updateMatrixWorld(true);
    const P0 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), S0 = new THREE.Vector3();
    for (const [n, dst] of Object.entries(R.tnodes)) {
      const src = objs.nodes[n]?.o; if (!src) { dst.visible = false; continue; }
      const on = !st.old && (n === "ruifu_b01" || n === "ruifu_b02" ? (st.facade ?? 0) >= 0.5 : span < 1100);
      src.children.forEach((c) => (c.visible = !on)); dst.visible = on && src.visible;
      src.matrixWorld.decompose(P0, Q0, S0);
      dst.position.copy(P0); dst.quaternion.copy(Q0); dst.scale.set(1, Math.min(1, S0.y / (H_SCALE[n] ?? 1)), 1);
    }
  } else { // 试点模型：近景（立面模式）才换上；楼栋跟随原节点的位置、转角、生长
    const on = !st.old && (st.facade ?? 0) >= 0.5;
    objs.pilot.g.visible = !st.old; objs.pilot.towers.visible = on;
    objs.ruifu.updateMatrixWorld(true);
    const P0 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), S0 = new THREE.Vector3();
    for (const n of PILOT_TOWERS) {
      const src = objs.nodes[n]?.o, dst = objs.pilot.tnodes[n]; if (!src || !dst) continue;
      src.children.forEach((c) => (c.visible = !on));
      src.matrixWorld.decompose(P0, Q0, S0);
      dst.position.copy(P0); dst.quaternion.copy(Q0); dst.scale.set(1, Math.min(1, S0.y / (H_SCALE[n] ?? 1)), 1);
    }
  }
  const heroC = new THREE.Color(night ? N.other : P.ruifuWall).lerp(new THREE.Color(P.hero), st.hero ?? 1);
  (["ruifu_b01", "ruifu_b02"] as const).forEach((n) => {
    const m = objs.heroMats[n]; m.color.copy(heroC);
    m.userData.u.uFacade.value = st.facade ?? 0;
    m.userData.u.uWarm.value = n === "ruifu_b02" ? 0.16 * (st.hi2 ?? 0) : 0; // 轻微暖光，保留立面细节
  });
  const fu = (objs.front.material as THREE.Material).userData.u, bu = (objs.back.material as THREE.Material).userData.u;
  const fk = st.front ?? 0, bk = st.back ?? 0;
  fu.uC.value = 217.7; fu.uL.value = 33 * fk; fu.uR.value = 77 * fk;
  bu.uC.value = 35; bu.uL.value = 60 * bk; bu.uR.value = 60 * bk;
  objs.front.visible = fk > 0.001; objs.back.visible = bk > 0.001;

  // 旧貌、造岛、黄昏、馆亮灯
  const isOld = !!st.old;
  OLD_U.uOld.value = isOld ? 1 : 0;
  if (bake!.landmarks.fenCenter) bake!.landmarks.fenCenter.forEach(([z, x], i) => i < 41 && OLD_U.uFen.value[i].set(z, x));
  const rise = st.islandRise ?? 1, vg = st.venueGrow ?? 1;
  objs.island.scale.y = Math.max(0.02, rise); objs.island.position.y = -1.5 * (1 - Math.max(0.02, rise)) * 0;
  objs.venues.forEach((g) => {
    g.visible = !isOld && vg > 0.01; g.scale.y = Math.max(0.01, vg); g.position.y = 4.5 * rise;
    const gk = st.glow && st.glow.id === g.userData.id ? st.glow.k : 0;
    g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial; if (m && m.emissive && !night) { m.emissive.set("#F5B567"); m.emissiveIntensity = 0.55 * gk; } });
  });
  ((objs.inner.material as THREE.Material).userData.u).uReveal.value = st.innerReveal ?? 1;
  if (objs.refine) { // 精细化：长风商务区、近景城市、地面和文化岛平台
    const R = objs.refine; R.g.visible = !isOld;
    objs.wanxiang.visible = objs.roof.visible = false;
    objs.supp.visible = !isOld; objs.supp.children.forEach((c) => (c.visible = !!c.userData.pit));
    const rs = Math.max(0.02, rise); R.island.scale.y = rs; R.island.position.y = -1.5 * rs + 0.03;
    R.island.visible = (st.islandAlpha ?? 1) > 0.99;
  }
  [...(objs.refine ? [] : [objs.wanxiang, objs.roof, objs.supp]), objs.trees, objs.farCity, objs.fen, objs.inner, objs.island, objs.bridges].forEach((o) => (o.visible = !isOld));
  if (st.noBridges) objs.bridges.visible = false;
  { // 桥上车流：按镜头时间推进；对比图用 noBridges 时一并隐藏
    const M = new THREE.Matrix4(), tm = st.time ?? 0;
    SHOW_U.uTime.value = tm;
    for (const bc of objs.bridgeCars) {
      const n = [-bc.d[1], bc.d[0]], ang = Math.atan2(bc.d[1], bc.d[0]);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
      for (let i = 0; i < 64; i++) {
        const ln = bc.lanes[i % 8]; const u = ((((tm * 15) * ln.dir + i * 61.7) % bc.L) + bc.L) % bc.L - bc.L / 2;
        const y = ln.y(u); const x = bc.c[0] + bc.d[0] * u + n[0] * ln.o, z = bc.c[1] + bc.d[1] * u + n[1] * ln.o;
        M.compose(new THREE.Vector3(x, isNaN(y) ? -50 : y + 0.8, z), q, new THREE.Vector3(1, 1, 1)); bc.mesh.setMatrixAt(i, M);
      }
      bc.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  { const hy = !isOld && !st.noHeyuan; objs.heyuan.visible = hy; objs.treesPark.visible = !isOld && !!st.noHeyuan; PARK_U.uParkOn.value = hy ? 1 : 0; }
  objs.ground.visible = !isOld; objs.groundOld.visible = isOld; objs.siteGround.visible = !isOld && !objs.refine;
  objs.terrain.visible = !!st.terrain;
  objs.city.castShadow = !isOld; // 旧貌模式下城市被着色器裁掉，阴影也要一起关掉
  const dk = st.dusk ?? 0;
  { // 瑞府细部：近景才显示；1、2号楼转身、楼栋生长时不显示
    const span = 2 * cam.position.distanceTo(new THREE.Vector3(PAIR[0], 40, PAIR[1])) * Math.tan((cam.fov * Math.PI) / 360);
    objs.det.visible = !isOld && !st.grow && span < 1100 && !objs.refine;
    (objs.det.userData.heroGroup as THREE.Group).visible = (st.turn ?? 1) >= 0.999;
    // 近景路面和车流
    const rd = objs.roadDet; rd.g.visible = !isOld && span < 900;
    if (rd.cars && rd.g.visible) {
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), tm = st.time ?? 0; let n = 0;
      rd.paths.forEach((p, pi) => {
        for (let i = 0; i < 36; i++) {
          const lane = i % 4, sp = 15 + lane * 2.2;
          const s0 = (((i * 83.7 + pi * 41) + tm * sp) % p.L + p.L) % p.L;
          let k = 1; while (k < p.cum.length - 1 && p.cum[k] < s0) k++;
          const [ax, az] = p.pts[k - 1], [bx, bz] = p.pts[k], f = (s0 - p.cum[k - 1]) / (p.cum[k] - p.cum[k - 1] || 1);
          const ang = Math.atan2(bz - az, bx - ax), nx = -Math.sin(ang), nz = Math.cos(ang), o = -5.25 + lane * 3.5;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
          const cz = az + (bz - az) * f;
          M.compose(new THREE.Vector3(ax + (bx - ax) * f + nx * o, REFINE && cz > 300 && cz < 1800 ? -0.4 : -0.55, cz + nz * o), q, new THREE.Vector3(1, 1, 1));
          rd.cars!.setMatrixAt(n++, M);
        }
      });
      rd.cars.instanceMatrix.needsUpdate = true;
    }
    const hk = 1 - (st.facade ?? 0); const [a, b] = objs.det.userData.hero as THREE.MeshLambertMaterial[];
    a.color.set("#F3F1EC").lerp(new THREE.Color(P.heroL), hk * 0.8); b.color.set("#4F677D").lerp(new THREE.Color(P.hero), hk * 0.7); }
  { const ia = st.islandAlpha ?? 1; const im = objs.island.material as THREE.MeshLambertMaterial; im.opacity = ia; im.depthWrite = ia > 0.99; objs.island.castShadow = ia > 0.99; }
  { const tk = st.traffic ?? 0; objs.cars.visible = tk > 0.01 && !isOld; const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(tk, tk, tk);
    const lanes = [{ z: -112, dir: 1 }, { z: -119, dir: -1 }, { z: 110, dir: 1 }, { z: 117, dir: -1 }];
    for (let i = 0; i < 48; i++) { const ln = lanes[i % 4]; const L = 1100, x0 = -840; const u = ((((st.time ?? 0) * 14 + i * 97) % L) + L) % L; const x = ln.dir > 0 ? x0 + u : x0 + L - u;
      M.compose(new THREE.Vector3(x, 0.4, ln.z), q, sc); objs.cars.setMatrixAt(i, M); }
    objs.cars.instanceMatrix.needsUpdate = true; }
  const ray = (b: number, d: number, c: string, k: number) => {
    if (k <= 0.001) return null;
    const [x0, z0] = at(b, 30), [x1, z1] = at(b, 30 + (d - 30) * k);
    const len = Math.hypot(x1 - x0, z1 - z0);
    return (
      <mesh key={b} position={[(x0 + x1) / 2, 7, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(z1 - z0, x1 - x0)]} renderOrder={3}>
        <planeGeometry args={[len, 5]} />
        <meshBasicMaterial color={c} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    );
  };
  const fc = st.facade ?? 0;
  const tgt: V3 = st.lt ?? (fc > 0.5 ? [PAIR[0], 40, PAIR[1]] : LOOK);
  const box = st.box ?? (fc > 0.5 ? 500 : 1700);
  const mk = st.morning ?? 0;
  return (
    <>
      <CamFrom cam={cam} />
      <color attach="background" args={[night ? N.bg : P.paper]} />
      <ambientLight intensity={night ? 0.5 : (1.3 - 0.35 * dk) * (1 - 0.28 * mk)} color={night ? "#8295CC" : new THREE.Color("#ffffff").lerp(new THREE.Color("#F1D3B5"), dk)} />
      <directionalLight position={[tgt[0] + (-900 - 900 * dk) * (1 - mk) + 820 * mk, (1500 - 900 * dk) * (1 - mk) + 420 * mk, tgt[2] + (300 + 400 * dk) * (1 - mk) - 640 * mk]} intensity={night ? 0.35 : 1.75 + 0.2 * dk + 0.15 * mk} color={night ? "#a9bbd8" : new THREE.Color("#fffaf2").lerp(new THREE.Color("#FFB878"), dk).lerp(new THREE.Color("#FFD7A0"), mk)} castShadow
        shadow-mapSize={[4096, 4096]} shadow-camera-left={-box} shadow-camera-right={box} shadow-camera-top={box} shadow-camera-bottom={-box} shadow-camera-far={5000} shadow-bias={-0.0004} shadow-normalBias={0.6}>
        <object3D attach="target" position={tgt} />
      </directionalLight>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LOOK[0], -2.6, LOOK[2]]} receiveShadow>
        <planeGeometry args={[30000, 30000]} />
        <meshLambertMaterial color={night ? N.ground : P.ground} />
      </mesh>
      <primitive object={objs.farGround} />
      <primitive object={objs.farCity} />
      <primitive object={objs.ground} />
      <primitive object={objs.groundOld} />
      <primitive object={objs.terrain} />
      {st.fog ? <fog attach="fog" args={[night ? N.bg : P.paper, st.fog[0], st.fog[1]]} /> : null}
      {night ? (
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.85} luminanceThreshold={0.5} luminanceSmoothing={0.35} mipmapBlur radius={0.65} />
        </EffectComposer>
      ) : <></>}
      <primitive object={objs.fen} />
      <primitive object={objs.inner} />
      <primitive object={objs.island} />
      <primitive object={objs.cars} />
      <primitive object={objs.city} />
      {objs.venues.map((g, i) => <primitive key={i} object={g} />)}
      <primitive object={objs.wanxiang} />
      <primitive object={objs.roof} />
      <primitive object={objs.supp} />
      <primitive object={objs.trees} />
      <primitive object={objs.treesPark} />
      <primitive object={objs.heyuan} />
      <primitive object={objs.front} />
      <primitive object={objs.back} />
      {Object.entries(RAYS).map(([k, [b, d, c]]) => ray(b, d, c === "hero" ? P.hero : P.waterInk, st.rays?.[k as keyof typeof RAYS] ?? 0))}
      {(st.ring ?? 0) > 0.001 && !isOld ? (
        <mesh position={[PAIR[0], 1.5, PAIR[1]]} rotation={[-Math.PI / 2, 0, -0.65]} renderOrder={4}>
          <planeGeometry args={[260, 200]} />
          <meshBasicMaterial map={GLOW} color={night ? "#FFB27A" : P.hero} transparent opacity={(night ? 0.55 : 0.42) * (st.ring ?? 0)} depthWrite={false} />
        </mesh>
      ) : null}
      <primitive object={objs.ruifu} />
      <primitive object={objs.det} />
      <primitive object={objs.roadDet.g} />
      <primitive object={objs.siteGround} />
      <primitive object={objs.pilot.g} />
      {objs.refine ? <primitive object={objs.refine.g} /> : null}
      <primitive object={objs.bridges} />
    </>
  );
};

/** 风格样帧用的旧接口：静态状态 */
export const RegionScene: React.FC<{ cam: THREE.PerspectiveCamera; night?: boolean; diagram?: boolean; facade?: boolean }> = ({ cam, night = false, diagram = true, facade = false }) => (
  <MapScene cam={cam} st={{ night, facade: facade ? 1 : 0, front: diagram ? 1 : 0, back: diagram ? 1 : 0, ring: facade ? 0 : 1,
    rays: diagram ? { heyuan: 1, xieyuan: 1, lake: 1, fen: 1, venues: 1 } : {} }} />
);
