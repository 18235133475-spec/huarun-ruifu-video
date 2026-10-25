// 文章视频版人声版：全片自绘统一风格，配音是真人录音（vo4，按镜头切好），镜号 O/P/Q/R/S/T，章节卡 CP–CT。
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { clamp, ease } from "../lib";
import { useReady } from "./data";
import { Intro, O0, O1, O2, O3, O7, O8 } from "./open";
import { O4, O5 } from "./ch1";
import { O5S } from "./sunshot";
import { CHAPTER_CARDS } from "./chapters";
import { O5SB } from "./sunshot3d";
import { CHAPTER1B } from "./ch1b";
import { UNIT_SHOTS } from "./unitshots";
import { END_SHOTS } from "./end";
import { P, SANS } from "./theme";
import { Captions, PaperCut, SlideAway, SlideIn, TurnIn } from "./transitions";
import { getInputProps } from "remotion";
const NO_CAPS = (getInputProps() as { noCaps?: boolean }).noCaps === true;
import { EXITS_UP, FPS, INTRO, LEAD, SHOTS, SPLIT, Shot, TOTAL_FRAMES, TRIM } from "./timeline";

const VISUAL: Record<string, React.FC> = { O0, O1, O2, O3, O4, O5, O5S, O7, O8, ...CHAPTER1B, ...CHAPTER_CARDS, ...UNIT_SHOTS, ...END_SHOTS };
/** 对照版：O5S 换成沙盘直观版，其余镜头相同；正片用图表版（太阳轨迹图 + 直射时段） */
const ALT: Record<string, React.FC> = { O5S: O5SB };
const Placeholder: React.FC<{ id: string }> = ({ id }) => (
  <AbsoluteFill style={{ background: P.paper, alignItems: "center", justifyContent: "center", fontFamily: SANS, color: P.mute, fontSize: 40 }}>{id}（待制作）</AbsoluteFill>
);

/** 一个镜头：按进场方式包一层，纸面镜头在结尾自己滑走 */
const ShotView: React.FC<{ s: Shot; overIn: number; alt?: boolean }> = ({ s, overIn, alt }) => {
  const f = useCurrentFrame();
  const V = (alt && ALT[s.id]) || VISUAL[s.id];
  let body: React.ReactNode = V ? <V /> : <Placeholder id={s.id} />;
  if (EXITS_UP.has(s.id)) body = <SlideAway at={s.frames} frames={s.tail}>{body}</SlideAway>;
  const withCaps = <AbsoluteFill>{body}{/^C[PQRST]$/.test(s.id) || NO_CAPS ? null : <Captions id={s.id} />}</AbsoluteFill>; // 章节卡上已经有字，不再叠字幕；做文章配图动图时 --props 里 "noCaps":true 去掉字幕
  switch (s.enter) {
    case "slide": return <SlideIn frames={overIn}>{withCaps}</SlideIn>;
    case "turn": return <TurnIn frames={overIn}>{withCaps}</TurnIn>;
    case "cutpaper": return <PaperCut k={ease(clamp(f / overIn))} fx={0.55} fy={0.55}>{withCaps}</PaperCut>;
    case "under": return withCaps;
    default: return <AbsoluteFill style={{ opacity: clamp(f / overIn) }}>{withCaps}</AbsoluteFill>;
  }
};

const Film: React.FC<{ upto?: string; alt?: boolean }> = ({ upto, alt }) => {
  const ready = useReady();
  const last = upto ? SHOTS.findIndex((s) => s.id === upto) : SHOTS.length - 1;
  const list = SHOTS.slice(0, last + 1);
  const end = list[list.length - 1].from + list[list.length - 1].frames;
  if (!ready) return <AbsoluteFill style={{ background: P.paper }} />;
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <Sequence from={0} durationInFrames={Math.round(INTRO * FPS) + list[0].tail + 8} name="片名">
        <Intro />
      </Sequence>
      {list.map((s, i) => {
        const prev = i > 0 ? list[i - 1] : null;
        const overIn = prev ? prev.tail : 24; // 第一镜从片头的黑底里慢慢浮出
        // 上一镜要自己滑走时，它压在这一镜上面
        const z = EXITS_UP.has(s.id) ? 3 : 1;
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={s.frames + (i === list.length - 1 ? 30 : s.tail)} name={`${s.id} ${s.section}`} style={{ zIndex: z }}>
            <ShotView s={s} overIn={overIn} alt={alt} />
          </Sequence>
        );
      })}
      {list.map((s) => (
        <Sequence key={`vo${s.id}`} from={s.from + Math.round(LEAD * FPS)} durationInFrames={Math.ceil((s.voLength + 0.3 + (SPLIT[s.id]?.gap ?? 0)) * FPS)}>
          {SPLIT[s.id] ? (
            <>
              <Sequence durationInFrames={Math.round(SPLIT[s.id].at * FPS)}><Audio src={staticFile(`vo4/${s.id}.wav`)} /></Sequence>
              <Sequence from={Math.round((SPLIT[s.id].at + SPLIT[s.id].gap) * FPS)}><Audio src={staticFile(`vo4/${s.id}.wav`)} startFrom={Math.round(SPLIT[s.id].at * FPS)} /></Sequence>
            </>
          ) : <Audio src={staticFile(`vo4/${s.id}.wav`)} startFrom={Math.round((TRIM[s.id] ?? 0) * FPS)} />}
        </Sequence>
      ))}
      <Audio loop src={staticFile("music/piano.mp3")} volume={(fr) => clamp(fr / 45) * (fr < INTRO * FPS ? 0.24 : 0.15) * clamp((end + 30 - fr) / 45)} />
    </AbsoluteFill>
  );
};

export const FILM3_OPEN_FRAMES = (() => { const a = SHOTS.find((s) => s.id === "O8")!; return a.from + a.frames + 30; })();
export const Film3Open: React.FC = () => <Film upto="O8" />;
export const FILM3_B2_FRAMES = (() => { const b = SHOTS.find((s) => s.id === "O5")!; return b.from + b.frames + 30; })();
export const Film3ToB2: React.FC = () => <Film upto="O5" />;
export const Film3: React.FC = () => <Film />;
export const Film3Alt: React.FC = () => <Film alt />;
export const FILM3_FRAMES = TOTAL_FRAMES;
