// v4 第四、五章：S1 每加推一次新开样板间；S2 规划调整的数字；T1 四个维度；T2 夜色里为太原侧了个身；T3 片尾。
import React from "react";
import { AbsoluteFill } from "remotion";
import { PerspShot } from "./ch1";
import { CamSpec, MAP_CAM, PAIR, lerpCam, makeCamera, toScreen } from "./geo";
import { bake } from "./data";
import { BLACK, BookTitle, ReasonCards, credit, pr, useT } from "./open";
import { ease } from "../lib";
import { BuildingTag, Callout, Footnote, N, P, SANS, SERIF, SkyTitle } from "./theme";
import { kw, shotById } from "./timeline";

// ---------- S1 耐心：几乎每加推一次就新开一个样板间；跟着市场和客户的反馈一次次调整 —— 长期主义 ----------
// 画面：黄昏鸟瞰，瑞府楼栋由南向北一段一段长出来（示意，不标批次）；右侧一个循环小图：客户反馈 → 调整产品 → 新样板间
const SITE: [number, number] = [170, 1120];
const E1K0: CamSpec = { t: [SITE[0], 20, SITE[1]], az: 236, el: 26, D: 1500, span: 820, sy: 600 };
const E1K1: CamSpec = { t: [SITE[0], 20, SITE[1] - 60], az: 248, el: 23, D: 1450, span: 740, sy: 600 };
const BATCH = (z: number, n: string) => (n === "ruifu_b01" || n === "ruifu_b02" ? 5 : z > 1380 ? 0 : z > 1230 ? 1 : z > 1060 ? 2 : z > 900 ? 3 : 4);
export const S1: React.FC = () => {
  const t = useT(), len = shotById("S1").len;
  const spec = lerpCam(E1K0, E1K1, pr(t, 0, len));
  const t0 = kw("S1", "几乎每加推"), t1 = kw("S1", "就新开"), tf = kw("S1", "跟着市场"), ta = kw("S1", "一次次调整"), tl = kw("S1", "长期主义");
  const span = t1 + 1.6 - (t0 - 0.3), bt = (b: number) => t0 - 0.3 + (span * b) / 6; // 第 b 批出现的时刻
  const rects = bake!.landmarks.ruifuRects;
  const grow = (name: string) => { const r = rects.find((x) => x.n === name); if (!r || /^ruifu_t/.test(name)) return 1; return ease(pr(t, bt(BATCH(r.c[1], name)), 0.8)); };
  const kLoop = pr(t, tf - 0.2, 0.6), kL = pr(t, tl - 0.3, 0.8);
  return (
    <PerspShot spec={spec} st={{ dusk: 0.45, facade: 1, hero: 1, ring: 0, fog: [1500, 7000], box: 900, lt: [SITE[0], 0, SITE[1]], grow: t < bt(5) + 0.9 ? grow : undefined }}>
      {(s) => (
        <>
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(240,170,110,.12) 0%, rgba(240,170,110,0) 40%)" }} />
          <div style={{ opacity: pr(t, 0.3, 0.6) }}>
            <SkyTitle chapter="耐心" title="长期主义" sub="270㎡以上的大户型，几乎一批一个样板间" />
          </div>
          {/* 右侧：反馈 → 调整 → 新样板间 的循环 */}
          <div style={{ position: "absolute", right: 96, top: 330, width: 380, padding: "22px 26px", background: "rgba(243,240,234,.94)", boxShadow: "0 8px 24px rgba(60,45,30,.14)", fontFamily: SANS, opacity: kLoop, transform: `translateY(${(1 - kLoop) * 12}px)` }}>
            <svg width={328} height={250} viewBox="0 0 328 250">
              <defs><marker id="s1a" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" refX="7" refY="7" orient="auto"><path d="M0,1 L14,7 L0,13 z" fill={P.hero} /></marker></defs>
              <circle cx={164} cy={128} r={66} fill="none" stroke={P.line} strokeWidth={2} strokeDasharray="4 6" />
              <path d={`M 164 62 A 66 66 0 ${pr(t, ta - 0.3, 1.6) > 0.5 ? 1 : 0} 1 ${164 + 66 * Math.sin(2 * Math.PI * Math.max(0.02, Math.min(0.97, pr(t, ta - 0.3, 1.6) * 0.97)))} ${128 - 66 * Math.cos(2 * Math.PI * Math.max(0.02, Math.min(0.97, pr(t, ta - 0.3, 1.6) * 0.97)))}`} fill="none" stroke={P.hero} strokeWidth={4} markerEnd="url(#s1a)" />
              {([["客户反馈", 0, 0, -22], ["调整产品", 120, 52, 30], ["新样板间", 240, -52, 30]] as const).map(([l, a, ox, oy]) => { const r = (a * Math.PI) / 180, x = 164 + 66 * Math.sin(r), y = 128 - 66 * Math.cos(r); return <g key={l}><circle cx={x} cy={y} r={7} fill={P.hero} /><text x={x + ox} y={y + oy} textAnchor="middle" fontSize={20} fontWeight={600} fill={P.ink}>{l}</text></g>; })}
            </svg>
            <div style={{ fontSize: 22, color: P.ink2, marginTop: 6, textAlign: "center" }}>跟着市场和客户，一次次调整产品</div>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 38, color: P.hero, marginTop: 14, textAlign: "center", opacity: kL }}>长期主义的耐心</div>
          </div>
          <Footnote text="示意画面 · 楼栋生长顺序为示意；样板间信息为“据了解”口径" />
        </>
      )}
    </PerspShot>
  );
};

// ---------- S2 就拿最后的1、2号楼来说：放下正南，转向风景；总面积不变，户数少了104户 ----------
// 画面：近看1、2号楼，从正南正北转向西南（和开场 O2 呼应）；右侧数字面板
const S2K0: CamSpec = { t: [PAIR[0] - 10, 40, PAIR[1] + 30], az: 150, el: 62, D: 1000, span: 380, sx: 720, sy: 560 };
const S2K1: CamSpec = { t: [PAIR[0] - 10, 40, PAIR[1] + 30], az: 158, el: 58, D: 950, span: 350, sx: 720, sy: 560 };
export const S2: React.FC = () => {
  const t = useT(), len = shotById("S2").len;
  const spec = lerpCam(S2K0, S2K1, pr(t, 0, len));
  const cam = makeCamera(spec);
  const tn = kw("S2", "放下正南"), ts = kw("S2", "转向风景"), ta = kw("S2", "总面积"), th = kw("S2", "户数"), tf = kw("S2", "往大");
  const turn = ease(pr(t, ts - 0.3, 1.4));
  const ka = pr(t, ta - 0.2, 0.6), kh = pr(t, th - 0.2, 0.6), kf = pr(t, tf - 0.2, 0.6);
  const roll = pr(t, th, 1.6);
  const homes = Math.round(1290 + (1186 - 1290) * roll);
  const S = (x: number, z: number, y = 100) => toScreen(cam, [x, y, z]); // 箭头画在楼顶高度，不被楼挡住
  const arrow = (deg: number, L: number) => { const r = (deg * Math.PI) / 180; return [S(PAIR[0], PAIR[1]), S(PAIR[0] + Math.sin(r) * L, PAIR[1] - Math.cos(r) * L)]; };
  const [a0, a1] = arrow(180, 130), [b0, b1] = arrow(180 + 37.7 * turn, 150);
  return (
    <PerspShot spec={spec} st={{ facade: 1, hero: 1, hi2: 0.4, turn, ring: 0, fog: [1500, 7000], box: 500, lt: [PAIR[0], 40, PAIR[1]] }}>
      {() => (
        <>
          <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible", opacity: pr(t, tn - 0.3, 0.5) }}>
            <defs><marker id="s2a" markerUnits="userSpaceOnUse" markerWidth="18" markerHeight="18" refX="9" refY="9" orient="auto"><path d="M0,1 L18,9 L0,17 z" fill={P.hero} /></marker>
              <marker id="s2b" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto"><path d="M0,1 L16,8 L0,15 z" fill="#5E5750" /></marker></defs>
            <line x1={a0[0]} y1={a0[1]} x2={a1[0]} y2={a1[1]} stroke="#fff" strokeWidth={8} opacity={0.8} /><line x1={a0[0]} y1={a0[1]} x2={a1[0]} y2={a1[1]} stroke="#5E5750" strokeWidth={4} strokeDasharray="10 8" markerEnd="url(#s2b)" />
            <line x1={b0[0]} y1={b0[1]} x2={b1[0]} y2={b1[1]} stroke={P.hero} strokeWidth={5} markerEnd="url(#s2a)" opacity={turn > 0.02 ? 1 : 0} />
          </svg>
          <div style={{ position: "absolute", left: a1[0], top: a1[1] + 12, transform: "translateX(-50%)", fontFamily: SANS, fontSize: 22, color: P.ink2, background: "rgba(243,240,234,.88)", padding: "2px 10px", opacity: pr(t, tn - 0.2, 0.5), whiteSpace: "nowrap" }}>正南 · 标准答案</div>
          <div style={{ position: "absolute", left: b1[0], top: b1[1] + 12, transform: "translateX(-60%)", fontFamily: SANS, fontSize: 24, fontWeight: 700, color: "#fff", background: P.hero, padding: "3px 12px", opacity: pr(t, ts + 0.6, 0.5), whiteSpace: "nowrap" }}>转向风景 · 西南</div>
          <BuildingTag at={toScreen(cam, [146.6, 100, 737.8])} label="1号楼" k={pr(t, 0.4, 0.5)} />
          <BuildingTag at={toScreen(cam, [204.9, 100, 780.8])} label="2号楼" k={pr(t, 0.5, 0.5)} />
          <div style={{ position: "absolute", left: 96, top: 72, fontFamily: SANS, fontSize: 22, color: P.hero, letterSpacing: 3, background: "rgba(243,240,234,.92)", padding: "8px 14px" }}>耐心 · 长期主义</div>
          <div style={{ position: "absolute", left: 96, top: 130, fontFamily: SERIF, fontWeight: 900, fontSize: 52, color: P.ink, letterSpacing: 2, opacity: pr(t, 0.3, 0.6), textShadow: "0 0 18px rgba(243,240,234,.9)" }}>就拿最后的1、2号楼来说</div>
          {/* 右侧：一次规划调整，前后对比——同一块面积（框的大小不变），分成的户数从 12 份变成 11 份（按 1290 → 1186 的比例示意），每一户变大 */}
          <div style={{ position: "absolute", right: 96, top: 250, width: 520, padding: "24px 30px 26px", background: "rgba(243,240,234,.96)", boxShadow: "0 8px 24px rgba(60,45,30,.14)", fontFamily: SANS, opacity: pr(t, kw("S2", "规划调整") - 0.3, 0.6) }}>
            <div style={{ fontSize: 20, color: P.hero, letterSpacing: 3 }}>2025年 · 一次规划调整</div>
            <div style={{ fontSize: 18, color: P.ink2, marginTop: 4 }}>6月方案 → 9月方案</div>
            {(() => {
              const W = 460, H = 70, n = 12 - roll; // 份数从 12 平滑变到 11
              const cells = Math.ceil(n);
              const bar = (y: number, label: string, cnt: number, k: number, hl: boolean) => (
                <g transform={`translate(0 ${y})`} opacity={k}>
                  <text x={0} y={-8} fontSize={18} fill={P.ink2}>{label}</text>
                  <rect x={0} y={0} width={W} height={H} fill={hl ? "#F1D9C4" : "#E7DFD2"} stroke={P.ink2} strokeWidth={1.5} />
                  {Array.from({ length: Math.ceil(cnt) - 1 }).map((_, i) => <line key={i} x1={(W * (i + 1)) / cnt} y1={0} x2={(W * (i + 1)) / cnt} y2={H} stroke={hl ? P.hero : "#9C9284"} strokeWidth={1.5} />)}
                </g>
              );
              return (
                <svg width={W} height={250} style={{ marginTop: 24, overflow: "visible" }}>
                  {bar(24, "调整前 · 1290户", 12, pr(t, kw("S2", "规划调整") - 0.1, 0.5), false)}
                  {bar(140, `调整后 · ${homes}户`, Math.max(11, n), ka, true)}
                  {/* 两条一样长：总面积不变 */}
                  <g opacity={ka}>
                    <line x1={0} y1={112} x2={W} y2={112} stroke={P.hero} strokeWidth={1.5} strokeDasharray="4 5" />
                    <rect x={W / 2 - 98} y={100} width={196} height={24} fill="rgba(243,240,234,1)" />
                    <text x={W / 2} y={118} textAnchor="middle" fontSize={20} fontWeight={700} fill={P.hero}>总面积：一样多</text>
                  </g>
                  {void cells}
                </svg>
              );
            })()}
            <div style={{ marginTop: 4, opacity: pr(t, kw("S2", "少了") - 0.1, 0.4), whiteSpace: "nowrap" }}>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 44, color: P.hero }}>户数少了104户</div>
              <div style={{ fontSize: 22, color: P.ink2, marginTop: 4 }}>同样的面积，分给更少的户数，每一户更大</div>
            </div>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 48, color: P.hero, letterSpacing: 10, marginTop: 16, opacity: kf, transform: `translateY(${(1 - kf) * 10}px)` }}>往大，往少</div>
          </div>
          <Footnote text="数据来源：2025年规划调整公示（6月方案 → 9月拟变更方案）；面积、户数为所在地块整体口径，非1、2号楼单栋；画面为示意" />
        </>
      )}
    </PerspShot>
  );
};

// ---------- T1 四个维度，打勾；之前不曾有，之后也很难再有 ----------
export const T1: React.FC = () => {
  const t = useT();
  const words = ["位置", "楼栋", "户型", "耐心"];
  const checks = words.map((w) => pr(t, kw("T1", w) - 0.1, 0.35));
  const kt = pr(t, kw("T1", "当这些") - 0.2, 0.6), k2 = pr(t, kw("T1", "之前不曾有") - 0.3, 0.6);
  return (
    <AbsoluteFill style={{ background: P.paper, fontFamily: SANS }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 120, textAlign: "center" }}>
        <div style={{ fontSize: 24, color: P.hero, letterSpacing: 6 }}>最后 · 天花板</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 60, color: P.ink, marginTop: 16, letterSpacing: 4, opacity: kt }}>同时落在一套三百多平的房子里</div>
      </div>
      <ReasonCards ks={[1, 1, 1, 1]} checks={checks} y={420} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 860, textAlign: "center", fontFamily: SERIF, fontWeight: 900, fontSize: 52, color: P.hero, letterSpacing: 6, opacity: k2 }}>在太原，之前不曾有，之后也很难再有</div>
    </AbsoluteFill>
  );
};

// ---------- T2 夜色里的长风：商务区公建灯光秀，文化岛五馆亮灯，瑞府最后的两栋楼为太原侧了个身 ----------
// 机位在汾河东岸上空，往西北看：前景汾河和桥，中景文化岛，远处长风商务区的塔楼群在打灯光秀；镜头慢慢推向1、2号楼
const N2K0: CamSpec = { t: [-60, 30, 520], az: 122, el: 20, D: 2300, span: 1650, sy: 600 };
const N2K1: CamSpec = { t: [60, 40, 760], az: 128, el: 17, D: 1500, span: 820, sy: 600 };
export const T2: React.FC = () => {
  const t = useT(), len = shotById("T2").len;
  const spec = lerpCam(N2K0, N2K1, ease(pr(t, 0, len)));
  const tt = kw("T2", "侧了个身");
  const turn = pr(t, tt - 0.2, 1.4);
  const k1 = pr(t, 0.4, 0.7) * (1 - pr(t, kw("T2", "瑞府最后") - 0.4, 0.4));
  return (
    <PerspShot dark spec={spec} st={{ night: true, facade: 0, turn, hero: 1, hi2: 0.6 * pr(t, tt - 0.5, 1.0), ring: 0, fog: [2600, 11000], box: 1600, lt: [0, 0, 600], time: t }}>
      {(s) => (
        <>
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(14,16,26,.85) 0%, rgba(14,16,26,0) 28%)" }} />
          <div style={{ position: "absolute", left: 120, top: 100, fontFamily: SERIF, color: "#F3E9D8", textShadow: "0 2px 16px rgba(0,0,0,.6)", opacity: k1 }}>
            <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: 4, color: "#E8C79A" }}>长风，二十多年</div>
            <div style={{ fontWeight: 900, fontSize: 58, marginTop: 10 }}>长成了太原的城市名片</div>
          </div>
          <BuildingTag at={s(PAIR, 110)} label="瑞府楼王" k={pr(t, tt + 0.8, 0.5)} />
          <Footnote dark text={credit} />
        </>
      )}
    </PerspShot>
  );
};

// ---------- T3 片尾：黑底，和片头同一版式首尾呼应 ----------
// 先浮现“所谓天花板，不是再高一层 / 推窗是山水，回身是家人”，淡出后回到片头那张标题卡：华润 · 太原瑞府 / 一栋楼，为太原侧了个身，最后淡出到黑
export const T3: React.FC = () => {
  const t = useT(), len = shotById("T3").len;
  const out1 = 1 - pr(t, len - 3.9, 0.7);
  const kTitle = pr(t, len - 3.0, 1.0) * (1 - pr(t, len - 0.9, 0.8));
  return (
    <AbsoluteFill style={{ background: BLACK, fontFamily: SERIF }}>
      <div style={{ position: "absolute", top: 360, width: "100%", textAlign: "center", color: "#BFB6A6", fontSize: 40, letterSpacing: 8, opacity: pr(t, 0.3, 1.0) * out1, filter: `blur(${(1 - pr(t, 0.3, 1.0)) * 6}px)` }}>所谓天花板，不是再高一层</div>
      <div style={{ position: "absolute", top: 450, width: "100%", textAlign: "center", color: "#EAD9B8", fontSize: 76, fontWeight: 900, letterSpacing: 14, opacity: out1 }}>
        <span style={{ opacity: pr(t, kw("T3", "而是") - 0.2, 1.0), filter: `blur(${(1 - pr(t, kw("T3", "而是") - 0.2, 1.0)) * 6}px)`, display: "inline-block" }}>推窗是山水，</span>
        <span style={{ opacity: pr(t, kw("T3", "回身") - 0.2, 1.0), filter: `blur(${(1 - pr(t, kw("T3", "回身") - 0.2, 1.0)) * 6}px)`, display: "inline-block" }}>回身是家人</span>
      </div>
      <BookTitle k={kTitle} />
    </AbsoluteFill>
  );
};

export const END_SHOTS = { S1, S2, T1, T2, T3 };
