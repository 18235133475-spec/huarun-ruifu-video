// v2 地理与机位：坐标约定同 world.tsx（米；+X 东，+Z 南；原点山西大剧院形心）。
import React from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export type XZ = [number, number];
export type V3 = [number, number, number];

export const B01: XZ = [146.607, 737.806], B02: XZ = [204.874, 780.752];
export const PAIR: XZ = [(B01[0] + B02[0]) / 2, (B01[1] + B02[1]) / 2]; // 1、2号楼一起转身，按一组讲
export const dirOf = (bearing: number): XZ => [Math.sin((bearing * Math.PI) / 180), -Math.cos((bearing * Math.PI) / 180)];
export const at = (bearing: number, dist: number): XZ => { const d = dirOf(bearing); return [PAIR[0] + d[0] * dist, PAIR[1] + d[1] * dist]; };

// 近似轴测：极远机位 + 小视角

// 区域底图默认机位：近似轴测（极远机位 + 小视角）
export const LOOK: V3 = [-17, 0, 663];
export const CAM_AZ = 160, CAM_EL = 50, CAM_D = 24000, SPAN = 1750; // SPAN：画面纵向覆盖的米数（垂直于视线）
export const camPos = (): V3 => {
  const [dx, dz] = dirOf(CAM_AZ);
  const h = Math.cos((CAM_EL * Math.PI) / 180) * CAM_D;
  return [LOOK[0] + dx * h, Math.sin((CAM_EL * Math.PI) / 180) * CAM_D, LOOK[2] + dz * h];
};
export const FOV = (2 * Math.atan(SPAN / 2 / CAM_D) * 180) / Math.PI;
export const makeCam = () => {
  const c = new THREE.PerspectiveCamera(FOV, 1920 / 1080, CAM_D - 5000, CAM_D + 5000);
  c.position.set(...camPos()); c.lookAt(...LOOK); c.updateProjectionMatrix(); c.updateMatrixWorld();
  return c;
};
export const toScreen = (cam: THREE.PerspectiveCamera, p: V3): [number, number] => {
  const v = new THREE.Vector3(...p).project(cam);
  return [(v.x + 1) * 960, (1 - v.y) * 540];
};

export const shape = (poly: number[][]) => { const s = new THREE.Shape(); poly.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z))); return s; };
export const flatGeo = (poly: number[][], y: number) => { const g = new THREE.ShapeGeometry(shape(poly)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };
export const inPoly = (x: number, z: number, poly: number[][]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
export const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const BOUNDS = { x0: -900, x1: 1500, z0: -900, z1: 1700 };

/** 近似轴测机位：让 center 落在屏幕 (sx, sy) */
export const axo = (center: V3, az: number, el: number, D: number, span: number, sx: number, sy: number) => {
  const [dx, dz] = dirOf(az);
  const back = new THREE.Vector3(dx * Math.cos((el * Math.PI) / 180), Math.sin((el * Math.PI) / 180), dz * Math.cos((el * Math.PI) / 180));
  const tmp = new THREE.PerspectiveCamera(1, 16 / 9, 1, 2);
  tmp.position.copy(new THREE.Vector3(...center).addScaledVector(back, D)); tmp.lookAt(...center); tmp.updateMatrixWorld();
  const R = new THREE.Vector3().setFromMatrixColumn(tmp.matrixWorld, 0), U = new THREE.Vector3().setFromMatrixColumn(tmp.matrixWorld, 1);
  const ppm = 1080 / span;
  const look = new THREE.Vector3(...center).addScaledVector(R, -(sx - 960) / ppm).addScaledVector(U, (sy - 540) / ppm);
  const fov = (2 * Math.atan(span / 2 / D) * 180) / Math.PI;
  const cam = new THREE.PerspectiveCamera(fov, 16 / 9, D * 0.5, D * 1.5);
  cam.position.copy(look.clone().addScaledVector(back, D)); cam.lookAt(look); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return cam;
};
export const CamFrom: React.FC<{ cam: THREE.PerspectiveCamera }> = ({ cam }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NoToneMapping; gl.localClippingEnabled = true;
  const c = camera as THREE.PerspectiveCamera;
  c.position.copy(cam.position); c.quaternion.copy(cam.quaternion); c.fov = cam.fov; c.near = cam.near; c.far = cam.far; c.updateProjectionMatrix();
  return null;
};

// ---------- 正片机位：一套参数描述所有机位，可在远景轴测和近景透视之间连续插值 ----------
/** t 目标点；az 机位所在方位（北0顺时针）；el 仰角；D 距离（米）；span 目标处画面纵向覆盖米数；sx/sy 目标点落在屏幕的位置 */
export type CamSpec = { t: V3; az: number; el: number; D: number; span: number; sx?: number; sy?: number };
export const makeCamera = (c: CamSpec) => {
  const [dx, dz] = dirOf(c.az);
  const ce = Math.cos((c.el * Math.PI) / 180), se = Math.sin((c.el * Math.PI) / 180);
  const back = new THREE.Vector3(dx * ce, se, dz * ce);
  const fov = (2 * Math.atan(c.span / 2 / c.D) * 180) / Math.PI;
  const tmp = new THREE.PerspectiveCamera(fov, 16 / 9, 1, 2);
  tmp.position.copy(new THREE.Vector3(...c.t).addScaledVector(back, c.D)); tmp.lookAt(...c.t); tmp.updateMatrixWorld();
  const R = new THREE.Vector3().setFromMatrixColumn(tmp.matrixWorld, 0), U = new THREE.Vector3().setFromMatrixColumn(tmp.matrixWorld, 1);
  const ppm = 1080 / c.span;
  const look = new THREE.Vector3(...c.t).addScaledVector(R, -((c.sx ?? 960) - 960) / ppm).addScaledVector(U, ((c.sy ?? 540) - 540) / ppm);
  // 近裁面随距离走：远景收紧深度范围防止地面各层闪烁，近景放宽避免切掉前景树
  const cam = new THREE.PerspectiveCamera(fov, 16 / 9, Math.max(5, c.D * 0.25), c.D + 9000);
  cam.position.copy(look.clone().addScaledVector(back, c.D)); cam.lookAt(look); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return cam;
};
/** 机位插值：距离和画幅按对数插值（远景俯冲到近景时速度均匀），方位走最短路 */
export const lerpCam = (a: CamSpec, b: CamSpec, k: number): CamSpec => {
  const L = (x: number, y: number) => x + (y - x) * k;
  const G = (x: number, y: number) => Math.exp(L(Math.log(x), Math.log(y)));
  const daz = ((b.az - a.az + 540) % 360) - 180;
  return { t: [L(a.t[0], b.t[0]), L(a.t[1], b.t[1]), L(a.t[2], b.t[2])], az: a.az + daz * k, el: L(a.el, b.el), D: G(a.D, b.D), span: G(a.span, b.span), sx: L(a.sx ?? 960, b.sx ?? 960), sy: L(a.sy ?? 540, b.sy ?? 540) };
};
/** 区域底图的标准机位（与风格样帧01相同） */
export const MAP_CAM: CamSpec = { t: LOOK, az: CAM_AZ, el: CAM_EL, D: CAM_D, span: SPAN };
