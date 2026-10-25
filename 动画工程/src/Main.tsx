// 粗片总装：按 timeline.json 把24个镜头排进时间线，叠字幕、花字、审片标记和三条音轨。
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import timeline from "./timeline.json";
import { CUSTOM_FLOWER, DARK_SHOTS, SHOTS } from "./shots";
import { loadWorld, waitForWorld, worldReady } from "./world";

waitForWorld();

const OVERLAP = 12; // 相邻镜头交叉淡化的帧数
const SANS = '"PingFang SC", "Hiragino Sans GB", sans-serif';
type Shot = (typeof timeline.shots)[number];

const Fade: React.FC<{ frames: number; first: boolean; children: React.ReactNode }> = ({ frames, first, children }) => {
  const f = useCurrentFrame();
  const o = first ? 1 : interpolate(f, [0, OVERLAP], [0, 1], { extrapolateRight: "clamp" });
  const end = interpolate(f, [frames - 1, frames + OVERLAP], [1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o * end }}>{children}</AbsoluteFill>;
};

const Captions: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame();
  const t = f / timeline.fps;
  const cue = shot.cues.find((c) => t >= c.start && t < c.end + 0.15);
  if (!cue) return null;
  const k = interpolate(t, [cue.start, cue.start + 0.12], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, display: "flex", justifyContent: "center", opacity: k }}>
      <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 600, color: "#fff", padding: "10px 26px", borderRadius: 10, background: "rgba(0,0,0,.42)", letterSpacing: 1 }}>{cue.text}</div>
    </div>
  );
};

const GenericFlower: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame();
  const t = f / timeline.fps;
  if (CUSTOM_FLOWER.has(shot.id) || !shot.flower.length) return null;
  return (
    <div style={{ position: "absolute", left: 96, top: 100 }}>
      {shot.flower.map((s, i) => {
        const at = 0.5 + i * 0.6;
        const k = interpolate(t, [at, at + 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={i} style={{ opacity: k, transform: `translateY(${(1 - k) * 12}px)`, marginBottom: 14, fontFamily: '"Songti SC", serif', fontSize: 44, fontWeight: 700, color: DARK_SHOTS.has(shot.id) ? "#fff" : "#2c2a26", textShadow: DARK_SHOTS.has(shot.id) ? "0 2px 12px rgba(0,0,0,.55)" : "none" }}>{s}</div>
        );
      })}
    </div>
  );
};

const Badge: React.FC<{ shot: Shot }> = ({ shot }) => (
  <div style={{ position: "absolute", right: 28, top: 22, fontFamily: SANS, fontSize: 20, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.35)", padding: "4px 12px", borderRadius: 6 }}>
    M2 模型粗片 · 镜{shot.id} · {shot.section}
  </div>
);

export const Main: React.FC = () => {
  const shots = timeline.shots;
  // 真实世界资源读完之前不渲染镜头（waitForWorld 已挡住截图）
  const [ready, setReady] = useState(worldReady());
  useEffect(() => { if (!ready) loadWorld().then(() => setReady(true)); }, [ready]);
  if (!ready) return <AbsoluteFill style={{ background: "#000" }} />;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {shots.map((s, i) => {
        const Comp = SHOTS[s.id];
        const dur = s.frames + (i < shots.length - 1 ? OVERLAP : 0);
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={dur} name={`镜${s.id} ${s.section}`}>
            <Fade frames={s.frames} first={i === 0}>
              <Comp len={s.length} beats={s.beats as Record<string, number[]>} />
              <GenericFlower shot={s} />
              <Captions shot={s} />
              <Badge shot={s} />
            </Fade>
          </Sequence>
        );
      })}
      {shots.map((s) => (
        <Sequence key={`vo${s.id}`} from={s.from + Math.round(s.voStart * timeline.fps)} durationInFrames={Math.ceil((s.voLength + 0.2) * timeline.fps)}>
          <Audio src={staticFile(`vo/s${s.id}.wav`)} volume={1} />
        </Sequence>
      ))}
      <Audio src={staticFile("audio/music.wav")} volume={0.32} />
      <Audio src={staticFile("audio/sfx.wav")} volume={0.8} />
    </AbsoluteFill>
  );
};
