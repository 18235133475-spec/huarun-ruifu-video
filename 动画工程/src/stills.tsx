// 甲方静帧：推拉摇移、叠化、合规标注
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp, lerp } from "./lib";

const SANS = '"PingFang SC", "Hiragino Sans GB", sans-serif';
export type Frame = { x: number; y: number; z: number }; // 画面中心（图片的0–1坐标）和放大倍数

/** 图片铺满画面，从 from 推到 to（k 0–1） */
export const Still: React.FC<{ src: string; from: Frame; to: Frame; k: number; blur?: number; tint?: string; aspect?: number }> = ({ src, from, to, k, blur = 0, tint, aspect = 1.6 }) => {
  const e = clamp(k);
  const x = lerp(from.x, to.x, e), y = lerp(from.y, to.y, e), z = lerp(from.z, to.z, e);
  // 先按画面宽高比铺满，再以 (x, y) 为中心放大
  const W = 1920, H = 1080;
  const baseW = Math.max(W, H * aspect), baseH = baseW / aspect;
  const w = baseW * z, h = baseH * z;
  const left = W / 2 - x * w, top = H / 2 - y * h;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <Img src={staticFile(`client/${src}`)} style={{ position: "absolute", left: Math.min(0, Math.max(W - w, left)), top: Math.min(0, Math.max(H - h, top)), width: w, height: h, filter: blur ? `blur(${blur}px)` : undefined }} />
      {tint ? <AbsoluteFill style={{ background: tint }} /> : null}
    </AbsoluteFill>
  );
};

/** 合规小字，放在左上角 */
export const Note: React.FC<{ kind: "render" | "sample"; k?: number }> = ({ kind, k = 1 }) => (
  <div style={{ position: "absolute", left: 40, top: 30, opacity: 0.85 * k, fontFamily: SANS, fontSize: 20, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: 1 }}>
    {kind === "render" ? "效果示意，最终以规划审批为准" : "样板间实景（其他户型），仅示意装修风格"}
  </div>
);

/** 画面一侧弹出的小窗图（镜14） */
export const Inset: React.FC<{ src: string; title: string; k: number; x: number; y: number; w?: number; dark?: boolean }> = ({ src, title, k, x, y, w = 520, dark = false }) =>
  k > 0.01 ? (
    <div style={{ position: "absolute", left: x, top: y, width: w, opacity: k, transform: `translateY(${(1 - k) * 18}px)`, boxShadow: "0 18px 40px rgba(0,0,0,.28)", background: "#fff", padding: 8 }}>
      <Img src={staticFile(`client/${src}`)} style={{ width: "100%", height: w * 0.56, objectFit: "cover", display: "block" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 4px 2px", fontFamily: SANS }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: dark ? "#fff" : "#2a2622" }}>{title}</span>
        <span style={{ fontSize: 15, color: "#8a8178" }}>效果示意</span>
      </div>
    </div>
  ) : null;
