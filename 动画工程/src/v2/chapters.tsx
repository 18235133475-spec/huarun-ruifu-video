// 章节标题卡：真人录音里念出的“第一，位置，长风的来历”等，配一张短卡。
// 版式统一：纸色底（第一章垫在今天的长风卫星图上，和上一镜结尾的俯视、下一镜开头的卫星图接上），大号汉字序号、章节名、副题、一道赤陶细线。
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { clamp, ease } from "../lib";
import { pr, useT } from "./open";
import { P, SANS, SERIF } from "./theme";
import { kw, shotById } from "./timeline";

const Card: React.FC<{ id: string; num: string; title: string; sub?: string; titleWord: string; subWord?: string; bg?: "sat" }> = ({ id, num, title, sub, titleWord, subWord, bg }) => {
  const t = useT(), len = shotById(id).len;
  const kn = pr(t, 0.1, 0.6), kt = pr(t, kw(id, titleWord) - 0.15, 0.5), ks = sub && subWord ? pr(t, kw(id, subWord) - 0.15, 0.5) : 0;
  const out = 1 - pr(t, len - 0.35, 0.3);
  const dark = bg === "sat";
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      {dark ? (
        <>
          <Img src={staticFile("v2/ge_2025.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(243,240,234,.94) 0%, rgba(243,240,234,.82) 55%, rgba(243,240,234,.35) 100%)" }} />
        </>
      ) : null}
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, textAlign: "center", opacity: out }}>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 120, color: P.hero, opacity: kn * 0.9, transform: `translateY(${(1 - ease(kn)) * 14}px)` }}>{num}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 84, color: P.ink, letterSpacing: 18, marginTop: 6, opacity: kt, filter: `blur(${(1 - kt) * 5}px)` }}>{title}</div>
        <div style={{ width: 90 * ease(clamp(kt)), height: 2, background: P.hero, margin: "26px auto 0" }} />
        {sub ? <div style={{ fontFamily: SANS, fontSize: 32, color: P.ink2, letterSpacing: 10, marginTop: 24, opacity: ks }}>{sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
export const CP: React.FC = () => <Card id="CP" num="一" title="位置" titleWord="位置" sub="长风的来历" subWord="长风" bg="sat" />;
export const CQ: React.FC = () => <Card id="CQ" num="二" title="楼栋" titleWord="楼栋" sub="一层只属于一家" subWord="一层" />;
export const CR: React.FC = () => <Card id="CR" num="三" title="户型" titleWord="户型" sub="一纵一横" subWord="一纵" />;
export const CS: React.FC = () => <Card id="CS" num="四" title="耐心" titleWord="耐心" sub="长期主义" subWord="长期" />;
export const CT: React.FC = () => <Card id="CT" num="五" title="天花板" titleWord="天花板" />;
export const CHAPTER_CARDS = { CP, CQ, CR, CS, CT };
