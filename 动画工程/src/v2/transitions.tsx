// v2 转场：纸面滑入/滑走、剪纸斑块（引擎内实时合成，运动镜头也能用）、转身。
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { clamp, ease } from "../lib";
import { FPS, cues } from "./timeline";
import { P, SANS } from "./theme";

/** 纸面从下方滑入（带一点投影），用于纸面镜头进场 */
export const SlideIn: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const k = ease(clamp(f / frames));
  return (
    <AbsoluteFill style={{ transform: `translateY(${(1 - k) * 100}%)`, boxShadow: k < 1 ? "0 -24px 60px rgba(60,45,30,.18)" : undefined }}>{children}</AbsoluteFill>
  );
};
/** 纸面向上抽走，露出垫在下面的下一镜 */
export const SlideAway: React.FC<{ at: number; frames: number; children: React.ReactNode }> = ({ at, frames, children }) => {
  const f = useCurrentFrame();
  const k = ease(clamp((f - at) / frames));
  return (
    <AbsoluteFill style={{ transform: `translateY(${-k * 100}%)`, boxShadow: k > 0 ? "0 24px 60px rgba(60,45,30,.18)" : undefined }}>{children}</AbsoluteFill>
  );
};

/** 转身：新画面以 (px, py) 为轴从 -37° 转正、由大到正常，旧画面在下面淡出 */
export const TurnIn: React.FC<{ frames: number; px?: number; py?: number; children: React.ReactNode }> = ({ frames, px = 960, py = 540, children }) => {
  const f = useCurrentFrame();
  const k = ease(clamp(f / frames));
  return (
    <AbsoluteFill style={{ opacity: clamp(f / (frames * 0.55)), transform: `rotate(${-37 * (1 - k)}deg) scale(${1 + 0.45 * (1 - k)})`, transformOrigin: `${px}px ${py}px` }}>{children}</AbsoluteFill>
  );
};

// ---------- 剪纸斑块 ----------
// 时间图 = 到焦点的距离 + 多倍频值噪声；进度 k 扫过时间图，扫到的地方露出新画面，边缘留一道 4 像素白边（像剪开的纸）
const W = 960, H = 540;
const tmapCache = new Map<string, Float32Array>();
const timeMap = (fx: number, fy: number, seed: number) => {
  const key = `${fx},${fy},${seed}`;
  if (tmapCache.has(key)) return tmapCache.get(key)!;
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const octave = (cells: number) => {
    const cw = cells + 1, ch = Math.ceil((cells * H) / W) + 1;
    const g = Array.from({ length: cw * ch }, rand);
    return (x: number, y: number) => {
      const gx = (x / W) * cells, gy = (y / W) * cells;
      const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = (i: number, j: number) => g[Math.min(ch - 1, j) * cw + Math.min(cw - 1, i)];
      return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
    };
  };
  const o1 = octave(4), o2 = octave(9), o3 = octave(22);
  const t = new Float32Array(W * H);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x / W - fx) * (W / H), y / H - fy);
    const v = d * 0.62 + (o1(x, y) * 0.55 + o2(x, y) * 0.3 + o3(x, y) * 0.15) * 0.38;
    t[y * W + x] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  for (let i = 0; i < t.length; i++) t[i] = (t[i] - lo) / (hi - lo);
  tmapCache.set(key, t);
  return t;
};
/** 进度 k（0–1）时：children 只在已翻开的斑块里可见，外加白边 */
export const PaperCut: React.FC<{ k: number; fx?: number; fy?: number; seed?: number; children: React.ReactNode }> = ({ k, fx = 0.5, fy = 0.5, seed = 7, children }) => {
  const { mask, rim } = useMemo(() => {
    const t = timeMap(fx, fy, seed);
    const th = k * 1.12 - 0.02;
    const cm = document.createElement("canvas"); cm.width = W; cm.height = H;
    const cr = document.createElement("canvas"); cr.width = W; cr.height = H;
    const im = cm.getContext("2d")!.createImageData(W, H), ir = cr.getContext("2d")!.createImageData(W, H);
    for (let i = 0; i < t.length; i++) {
      const a = t[i] < th ? 255 : 0;
      im.data[i * 4 + 3] = a;
      const band = th - t[i]; // 斑块内侧靠近边缘的一圈
      const r = band > -0.004 && band < 0.006 && k > 0 && k < 1 ? 245 : 0;
      ir.data[i * 4] = ir.data[i * 4 + 1] = ir.data[i * 4 + 2] = 252; ir.data[i * 4 + 3] = r;
    }
    cm.getContext("2d")!.putImageData(im, 0, 0); cr.getContext("2d")!.putImageData(ir, 0, 0);
    return { mask: cm.toDataURL(), rim: cr.toDataURL() };
  }, [k, fx, fy, seed]);
  if (k <= 0) return null;
  if (k >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ WebkitMaskImage: `url(${mask})`, maskImage: `url(${mask})`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ backgroundImage: `url(${rim})`, backgroundSize: "100% 100%", filter: "blur(0.6px)" }} />
    </AbsoluteFill>
  );
};

// ---------- 字幕：全片统一底部居中 ----------
export const Captions: React.FC<{ id: string }> = ({ id }) => {
  const t = useCurrentFrame() / FPS;
  const list = useMemo(() => cues(id), [id]);
  const c = list.find((x, i) => t >= x.start - 0.05 && t < (list[i + 1]?.start ?? x.end + 0.4) - 0.05);
  if (!c) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ fontFamily: SANS, fontSize: 38, fontWeight: 500, color: "#FBF7F0", padding: "7px 22px 9px", borderRadius: 6, background: "rgba(43,38,34,.72)", letterSpacing: 1 }}>{c.text}</div>
    </div>
  );
};
export const PaperBG: React.FC<{ dark?: boolean; children?: React.ReactNode }> = ({ dark, children }) => (
  <AbsoluteFill style={{ background: dark ? "#1A202B" : P.paper }}>{children}</AbsoluteFill>
);
