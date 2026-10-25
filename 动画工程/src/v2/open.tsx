// v2 开场：片名卡 + A1–A6（HR-VIDEO-003 镜头对照表）。所有动作按配音卡点（kw）。
import React, { useMemo } from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { clamp, ease } from "../lib";
import { CamSpec, LOOK, MAP_CAM, PAIR, V3, XZ, at, dirOf, lerpCam, makeCamera, toScreen } from "./geo";
import { MapScene, MapState } from "./map";
import { bake } from "./data";
import { BuildingTag, Callout, CenterTitle, Footnote, N, P, Pin, RightTitle, SANS, SERIF } from "./theme";
import { FPS, INTRO, OPEN_Q, kw, shotById } from "./timeline";

export const useT = () => useCurrentFrame() / FPS;
export const pr = (t: number, a: number, d: number) => ease(clamp((t - a) / d));

// 瑞府各楼的位置和正面方位（来自建模交付的 footprints.json，场景米）
const RUIFU: Record<string, [number, number, number]> = {
  ruifu_b01: [146.6, 737.8, 217.97], ruifu_b02: [204.9, 780.8, 217.74], ruifu_b03: [256.1, 833.2, 180.67], ruifu_b04: [197.4, 880.9, 180.67],
  ruifu_b05: [261.3, 916.5, 180.67], ruifu_b06: [193.1, 964.9, 180.67], ruifu_b07: [266.4, 993.6, 180.67], ruifu_b08: [191.7, 1037.5, 180.67],
  ruifu_b09: [272.5, 1072.0, 180.67], ruifu_b10: [186.0, 1109.8, 180.67], ruifu_b11: [257.2, 1140.0, 180.67], ruifu_b12: [180.9, 1177.4, 180.67],
  ruifu_b13: [169.5, 1255.5, 180.67], ruifu_b14: [169.7, 1313.0, 180.67], ruifu_b15: [-46.2, 1401.5, 180.67], ruifu_b16: [26.9, 1401.2, 180.67],
  ruifu_b17: [102.6, 1400.8, 180.67], ruifu_b18: [174.1, 1400.5, 180.67], ruifu_b19: [-46.1, 1461.4, 180.67], ruifu_b20: [20.4, 1461.1, 180.67],
  ruifu_b21: [91.3, 1460.8, 180.67], ruifu_b22: [146.3, 1460.6, 180.67], ruifu_b23: [199.3, 1461.0, 180.67], ruifu_t1: [253.0, 1219.4, 180.67],
  ruifu_t2: [262.9, 1299.2, 180.67], ruifu_t3: [250.2, 1409.9, 180.67], ruifu_s1: [141.8, 780.9, 217.86],
};
const ORDER = Object.keys(RUIFU).sort((a, b) => RUIFU[b][1] - RUIFU[a][1]); // 从南往北长出来，最后是最北的1、2号楼

// 机位
const WIDE0: CamSpec = { t: [230, 0, 520], az: 160, el: 45, D: 24000, span: 4600, sy: 560 };
const WIDE1: CamSpec = { ...WIDE0, span: 4200 };
const TOP0: CamSpec = { t: [165, 0, 1090], az: 180, el: 72, D: 24000, span: 960, sy: 560 };
const TOP1: CamSpec = { t: [190, 0, 840], az: 180, el: 76, D: 24000, span: 620, sy: 560 };
const MAP0: CamSpec = MAP_CAM, MAP1: CamSpec = { ...MAP_CAM, span: 1620 };
// O6 结束时的机位（全城鸟瞰），O7 从这里俯冲到楼栋近景
export const MAP_O6END: CamSpec = { t: [-900, 0, 1100], az: 168, el: 44, D: 30000, span: 3600, sy: 540 };
const FAC0: CamSpec = { t: [PAIR[0] + 10, 46, PAIR[1]], az: 222, el: 9, D: 560, span: 300 };
const FAC1: CamSpec = { t: [PAIR[0] + 10, 56, PAIR[1]], az: 226, el: 13, D: 620, span: 330 };

export const credit = "示意图 · 建筑轮廓：3D-GloBFP（CC BY 4.0）、© OpenStreetMap；瑞府楼栋按甲方总平面配准";

/** 区域场景镜头：三维 + 四周晕到纸面 + 覆盖层（按当前机位投影） */
export const MapShot: React.FC<{ spec: CamSpec; st: MapState; vignette?: number; extra?: React.ReactNode; children?: (s: (p: XZ, y?: number) => [number, number]) => React.ReactNode }> = ({ spec, st, vignette = 1, extra, children }) => {
  const cam = makeCamera(spec);
  const s = (p: XZ, y = 0) => toScreen(cam, [p[0], y, p[1]] as V3);
  const bg = st.night ? N.bg : P.paper, fc = (a: number) => (st.night ? `rgba(26,32,43,${a * vignette})` : `rgba(243,240,234,${a * vignette})`);
  return (
    <AbsoluteFill style={{ background: bg }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: bg }}>
        <MapScene cam={cam} st={st} />
        {extra}
      </ThreeCanvas>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 66% 70% at 55% 54%, ${fc(0)} 64%, ${fc(1)} 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(0deg, ${fc(0.9)} 0%, ${fc(0)} 14%)` }} />
      {children ? children(s) : null}
    </AbsoluteFill>
  );
};

// ---------- 片名卡 ----------
/** 片头、片尾共用的标题卡：纯黑底上，小字“华润 · 太原瑞府”、大字“一栋楼，为太原侧了个身”、一道赤陶细线；k 为出现进度（由虚到实浮现） */
export const BLACK = "#0C0B0A";
export const BookTitle: React.FC<{ k: number }> = ({ k }) => {
  const e = ease(clamp(k));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 410, textAlign: "center", opacity: e }}>
      <div style={{ fontFamily: SANS, fontSize: 24, letterSpacing: 14, color: "#B79A6E", filter: `blur(${(1 - e) * 4}px)` }}>华润 · 太原瑞府</div>
      <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 92, color: "#EFE6D6", letterSpacing: 10 + 8 * (1 - e), marginTop: 26, filter: `blur(${(1 - e) * 8}px)` }}>一栋楼，为太原侧了个身</div>
      <div style={{ width: 90 * e, height: 2, background: P.hero, margin: "34px auto 0" }} />
    </div>
  );
};
export const Intro: React.FC = () => {
  const t = useT();
  const k = pr(t, 0.4, 1.4) * (1 - pr(t, INTRO - 0.8, 0.7));
  return (
    <AbsoluteFill style={{ background: BLACK }}>
      {OPEN_Q ? null : <BookTitle k={k} />}
    </AbsoluteFill>
  );
};

// ---------- O0 新开头：黑幕闪出问句“好房子，一定要朝正南吗？”，再转到太原城区俯视，三句垫场（在北方看房先问朝南吗 / 正南正北是标准答案 / 采光好、好卖、不容易出错） ----------
const CITY0: CamSpec = { t: [1650, 0, 1450], az: 180, el: 62, D: 24000, span: 2400, sy: 560 }; // 汾河东岸老城的成片住宅区：先不露出瑞府，也不提前露出晋阳湖
const CITY1: CamSpec = { ...CITY0, t: [1600, 0, 1380], span: 1900 };
export const O0: React.FC = () => {
  const t = useT(), len = shotById("O0").len;
  const tq = kw("O0", "好房子"), tn = kw("O0", "在北方看房"), ts = kw("O0", "朝南吗"), ta = kw("O0", "正南正北"), tb = kw("O0", "标准答案");
  const t1 = kw("O0", "采光好"), t2 = kw("O0", "好卖"), t3 = kw("O0", "不容易出错");
  const kQ = pr(t, tq - 0.1, 0.9) * (1 - pr(t, tn - 0.55, 0.3)); // 问句由虚到实浮现；问句念完（“吗”之后约 0.6 秒才接下一句）再淡出
  const kBlack = 1 - pr(t, tn - 0.4, 0.6);          // 黑幕随后退去，地图在“在北方看房”时出来
  const kOut = 1 - pr(t, len - 0.7, 0.5);            // 收尾：文字和指北针先退，再接 O1
  const cam = lerpCam(CITY0, CITY1, pr(t, tn - 0.9, len - tn + 0.9));
  const kN = pr(t, tn - 0.2, 0.5), kS = pr(t, ts - 0.2, 0.6), kA = pr(t, ta - 0.2, 0.7), kB = pr(t, tb - 0.3, 0.6);
  const chip = (label: string, k: number) => (
    <div style={{ display: "inline-block", marginRight: 18, padding: "10px 22px", background: "rgba(255,255,255,.94)", borderLeft: `4px solid ${P.hero}`, fontFamily: SANS, fontSize: 30, color: P.ink, boxShadow: "0 4px 14px rgba(60,45,30,.12)", opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}>{label}</div>
  );
  const cx = 1660, cy = 300, R = 110; // 右上角指北针
  const needle = (a: number, color: string) => (
    <g transform={`rotate(${a} ${cx} ${cy})`}>
      <path d={`M${cx},${cy - R + 22} L${cx + 11},${cy} L${cx},${cy + 18} L${cx - 11},${cy} Z`} fill={color} />
    </g>
  );
  return (
    <AbsoluteFill style={{ background: BLACK }}>
      <MapShot spec={cam} st={{ hero: 0, facade: 0, turn: 0, ring: 0, time: t }}>
        {() => (
          <>
            <AbsoluteFill style={{ opacity: kOut }}>
            <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(243,240,234,.94) 0%, rgba(243,240,234,.82) 34%, rgba(243,240,234,0) 58%)` }} />
            {/* 正南正北：一条贯穿画面的南北轴 */}
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: kA }}>
              <line x1={1180} y1={150 + (1 - kA) * 380} x2={1180} y2={930 - (1 - kA) * 380} stroke={P.hero} strokeWidth={3} strokeDasharray="14 10" />
              <text x={1180} y={130} textAnchor="middle" fontFamily={SANS} fontSize={28} fill={P.ink2}>北</text>
              <text x={1180} y={972} textAnchor="middle" fontFamily={SANS} fontSize={28} fontWeight={600} fill={P.hero}>南</text>
            </svg>
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: kS }}>
              <circle cx={cx} cy={cy} r={R} fill="rgba(255,255,255,.9)" stroke={P.line} strokeWidth={2} />
              {[["北", 0], ["东", 90], ["南", 180], ["西", 270]].map(([l, a]) => {
                const [dx, dz] = dirOf(a as number);
                return <text key={l as string} x={cx + dx * (R + 26)} y={cy + dz * (R + 26) + 10} textAnchor="middle" fontFamily={SANS} fontSize={26} fontWeight={l === "南" ? 600 : 400} fill={l === "南" ? P.hero : P.mute}>{l}</text>;
              })}
              {needle(180, P.hero)}
              <circle cx={cx} cy={cy} r={7} fill={P.ink} />
            </svg>
            <div style={{ position: "absolute", left: 160, top: 250, fontFamily: SANS, fontSize: 32, letterSpacing: 4, color: P.ink2, opacity: kN }}>在北方看房，第一句问的是</div>
            <div style={{ position: "absolute", left: 152, top: 310, fontFamily: SERIF, fontWeight: 900, fontSize: 124, letterSpacing: 8, color: P.ink, opacity: kS, transform: `translateY(${(1 - kS) * 16}px)` }}>朝南吗？</div>
            <div style={{ position: "absolute", left: 160, top: 480, fontFamily: SANS, fontSize: 32, letterSpacing: 4, color: P.ink2, opacity: kB }}>正南正北，几乎是住宅的<span style={{ color: P.hero, fontWeight: 600 }}>标准答案</span></div>
            <div style={{ position: "absolute", left: 160, top: 580, whiteSpace: "nowrap" }}>
              {chip("采光好", pr(t, t1 - 0.2, 0.4))}{chip("好卖", pr(t, t2 - 0.2, 0.4))}{chip("最不容易出错", pr(t, t3 - 0.2, 0.4))}
            </div>
            </AbsoluteFill>
          </>
        )}
      </MapShot>
      {/* 黑幕问句 */}
      <AbsoluteFill style={{ background: BLACK, opacity: kBlack, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 96, letterSpacing: 10 + 8 * (1 - kQ), color: "#EFE6D6", opacity: kQ, filter: `blur(${(1 - kQ) * 8}px)` }}>好房子，一定要朝正南吗？</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- O1 开车经过滨河西路：沿瑞府东侧的滨河快速路往南，河在左、楼在右，再抬升成俯视 ----------
// 滨河西路取 OSM way/328706009（瑞府东侧的快速路，场景 x≈330–372）
const ROAD: XZ[] = [[330, 640], [345, 820], [356, 1064], [362, 1187], [356, 1290], [330, 1440]];
const roadAt = (u: number): XZ => { const n = ROAD.length - 1, f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), k = f - i; return [ROAD[i][0] + (ROAD[i + 1][0] - ROAD[i][0]) * k, ROAD[i][1] + (ROAD[i + 1][1] - ROAD[i][1]) * k]; };
export const O1: React.FC = () => {
  const t = useT(), len = shotById("O1").len;
  const tr = kw("O1", "华润瑞府"), ts = kw("O1", "由南向北");
  const rise = pr(t, ts - 0.4, len - ts + 0.2);
  const u = 0.05 + 0.6 * pr(t, 0, ts + 0.6);
  const p = roadAt(u), ahead = roadAt(Math.min(1, u + 0.12));
  // 行车机位：车后上方约 30 米，朝前（往南）看；后段抬升到俯视全盘
  const az = (Math.atan2(p[0] - ahead[0], -(p[1] - ahead[1])) * 180) / Math.PI;
  const DRIVE: CamSpec = { t: [ahead[0] + 45, 18, ahead[1]], az: (az + 368) % 360, el: 15, D: 300, span: 200, sy: 560 };
  const cam = lerpCam(DRIVE, TOP0, rise);
  // 雾距跟着机位距离走：抬升到俯视时不再有雾，否则远处整片被纸色吞掉
  const fog: [number, number] | undefined = rise < 0.98 ? [cam.D * 2.4, cam.D * 16] : undefined;
  return (
    <MapShot spec={cam} st={{ hero: 0, facade: 1, turn: 0, ring: 0, fog, time: t }} vignette={rise}>
      {(s) => (
        <>
          <Callout band at={s([262, 1180], 90)} k={pr(t, tr - 0.3, 0.5) * (1 - pr(t, ts + 0.6, 0.4))} title="华润瑞府" sub="车窗右手边" color={P.hero} dx={-240} dy={60} />
          <Callout band at={s([470, 1250], 2)} k={pr(t, 0.8, 0.5) * (1 - pr(t, ts + 0.6, 0.4))} title="汾河" sub="左手边" color={P.waterInk} dx={60} dy={-90} />
          <div style={{ position: "absolute", left: 96, top: 72, fontFamily: SANS, fontSize: 22, color: P.ink2, letterSpacing: 3, opacity: pr(t, 0.3, 0.5) * (1 - pr(t, ts, 0.5)), background: "rgba(243,240,234,.88)", padding: "8px 14px" }}>滨河西路 · 往南</div>
          <Footnote text={credit} />
        </>
      )}
    </MapShot>
  );
};

// ---------- O2 最北侧的两栋侧了个身，一起转向西南 ----------
export const O2: React.FC = () => {
  const t = useT(), len = shotById("O2").len;
  const cam = lerpCam(TOP0, TOP1, pr(t, 0, len));
  const tt = kw("O2", "侧了个身"), tw = kw("O2", "一起转向");
  const turn = pr(t, tt - 0.1, 1.5);
  return (
    <MapShot spec={cam} st={{ hero: turn, turn, ring: pr(t, tt + 1.3, 0.5) }} vignette={0.7}>
      {(s) => {
        const ka = pr(t, tw - 0.2, 0.9);
        return (
          <>
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
              <defs><marker id="ah2" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto"><path d="M0,1 L16,8 L0,15 z" fill={P.hero} /></marker></defs>
              {ka > 0.01 && Object.entries(RUIFU).filter(([n]) => n !== "ruifu_s1").map(([n, [x, z, az]]) => {
                const hero = n === "ruifu_b01" || n === "ruifu_b02";
                const [dx, dz] = dirOf(hero ? az : 180);
                const L = hero ? 95 : 55;
                const a = s([x + dx * 22, z + dz * 22], 2), b = s([x + dx * (22 + L * ka), z + dz * (22 + L * ka)], 2);
                return <line key={n} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={hero ? P.hero : "#8F867A"} strokeWidth={hero ? 5 : 2.5} strokeDasharray={hero ? undefined : "7 6"} markerEnd={hero && ka > 0.6 ? "url(#ah2)" : undefined} opacity={hero ? 1 : 0.8} />;
              })}
            </svg>
            {ka > 0.01 ? (
              <>
                <div style={{ position: "absolute", left: s([330, 1000])[0], top: s([330, 1000])[1], fontFamily: SANS, fontSize: 24, color: P.ink2, opacity: ka, whiteSpace: "nowrap" }}>其余楼栋：正南</div>
                <div style={{ position: "absolute", left: s(at(217.7, 150))[0] - 20, top: s(at(217.7, 150))[1] + 10, transform: "translateX(-100%)", fontFamily: SANS, fontSize: 26, fontWeight: 600, color: P.hero, opacity: ka, whiteSpace: "nowrap" }}>1、2号楼：西南</div>
              </>
            ) : null}
            <BuildingTag at={s(PAIR, 110)} label="1号、2号楼" k={pr(t, tt + 1.2, 0.5)} />
            <Footnote text={credit} />
          </>
        );
      }}
    </MapShot>
  );
};

// ---------- O3 南北朝向几乎是标准答案；为什么偏偏选择侧身？ ----------
export const O3: React.FC = () => {
  const t = useT();
  // 新开头版：“南北朝向是标准答案”已在开头讲过，O3 只剩“那么，华润的这两栋楼，为什么偏偏侧身”，大标题改成一行小字承接
  const kq = OPEN_Q ? pr(t, 0.2, 0.6) : pr(t, kw("O3", "标准答案") - 0.4, 0.5), ks = pr(t, kw("O3", "为什么"), 1.2), kw2 = pr(t, kw("O3", "侧身") - 0.3, 0.5);
  const ang = 180 + 37.7 * ks;
  const cx = 1330, cy = 500, R = 210;
  const needle = (a: number, color: string, op: number) => (
    <g transform={`rotate(${a} ${cx} ${cy})`} opacity={op}>
      <path d={`M${cx},${cy - R + 34} L${cx + 16},${cy} L${cx},${cy + 26} L${cx - 16},${cy} Z`} fill={color} />
    </g>
  );
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      {OPEN_Q ? (
        <>
          <div style={{ position: "absolute", left: 200, top: 360, fontFamily: SANS, color: P.ink2, fontSize: 32, letterSpacing: 4, opacity: kq }}>正南正北是标准答案，华润的这两栋楼</div>
          <div style={{ position: "absolute", left: 196, top: 430, fontFamily: SERIF, fontWeight: 900, color: P.hero, fontSize: 96, letterSpacing: 8, opacity: kw2, transform: `translateY(${(1 - kw2) * 16}px)` }}>为什么偏偏侧身？</div>
        </>
      ) : (
        <>
          <div style={{ position: "absolute", left: 200, top: 260, fontFamily: SANS, color: P.ink2, fontSize: 30, letterSpacing: 4, opacity: pr(t, 0.3, 0.5) }}>在太原买房</div>
          <div style={{ position: "absolute", left: 196, top: 320, fontFamily: SERIF, fontWeight: 900, color: P.ink, fontSize: 120, letterSpacing: 8, opacity: kq, transform: `translateY(${(1 - kq) * 16}px)` }}>南北朝向</div>
          <div style={{ position: "absolute", left: 204, top: 480, fontFamily: SANS, color: P.ink2, fontSize: 30, letterSpacing: 4, opacity: kq }}>几乎是标准答案</div>
          <div style={{ position: "absolute", left: 200, top: 580, fontFamily: SERIF, fontWeight: 900, color: P.hero, fontSize: 72, letterSpacing: 6, opacity: kw2 }}>为什么偏偏侧身？</div>
        </>
      )}
      {/* 罗盘里淡淡一层瑞府最北端四栋楼的平面：3、4号楼正南正北，1、2号楼跟着指针一起转向西南 */}
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: 0.7 * pr(t, 0.2, 0.8) }}>
        {bake!.landmarks.ruifuRects.filter((r) => /^ruifu_b0[1-4]$/.test(r.n)).map((r) => {
          const hero = r.n === "ruifu_b01" || r.n === "ruifu_b02", SC = 1.55, C0: [number, number] = [200, 812];
          const a = hero ? Math.PI + (r.a - Math.PI + (r.a < 0 ? 2 * Math.PI : 0)) * ks : r.a;
          const pts = [[-r.w / 2, -r.d / 2], [r.w / 2, -r.d / 2], [r.w / 2, r.d / 2], [-r.w / 2, r.d / 2]].map(([lx, lz]) => [cx + (r.c[0] + lx * Math.cos(a) - lz * Math.sin(a) - C0[0]) * SC, cy + (r.c[1] + lx * Math.sin(a) + lz * Math.cos(a) - C0[1]) * SC]);
          return <polygon key={r.n} points={pts.map((p) => p.join(",")).join(" ")} fill={hero ? P.hero : "#D6CCBC"} opacity={hero ? 0.75 : 0.8} />;
        })}
      </svg>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080 }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={P.line} strokeWidth={3} />
        <circle cx={cx} cy={cy} r={R - 26} fill="none" stroke={P.line} strokeWidth={1} strokeDasharray="2 8" />
        {[["北", 0], ["东", 90], ["南", 180], ["西", 270]].map(([l, a]) => {
          const [dx, dz] = dirOf(a as number);
          return <text key={l as string} x={cx + dx * (R + 34)} y={cy + dz * (R + 34) + 11} textAnchor="middle" fontFamily={SANS} fontSize={30} fill={l === "南" ? P.ink : P.mute}>{l}</text>;
        })}
        {ks > 0.02 ? needle(180, "#C9C0B3", 1) : null}
        {needle(ang, P.hero, 1)}
        <circle cx={cx} cy={cy} r={9} fill={P.ink} />
        {ks > 0.5 ? <text x={cx + dirOf(217.7)[0] * (R + 40)} y={cy + dirOf(217.7)[1] * (R + 40) + 12} textAnchor="end" fontFamily={SANS} fontSize={30} fontWeight={600} fill={P.hero} opacity={pr(t, kw("O3", "为什么") + 0.6, 0.5)}>西南</text> : null}
      </svg>
    </AbsoluteFill>
  );
};

// ---------- O7 这两栋楼是瑞府最后的收官之作；355是收官楼栋里的楼王 ----------
export const O7: React.FC = () => {
  const t = useT(), len = shotById("O7").len;
  const kd = pr(t, 0, 2.6); // 俯冲
  const cam = t < 2.6 ? lerpCam(MAP_O6END, FAC0, kd) : lerpCam(FAC0, FAC1, pr(t, 2.6, len - 2.6));
  const k2 = pr(t, kw("O7", "楼王") - 0.6, 0.6), kc = pr(t, kw("O7", "收官") - 0.1, 0.7), kt = pr(t, kw("O7", "楼王") - 0.3, 0.7), ku = pr(t, kw("O7", "最后的，") - 0.1, 0.6);
  const fade = 1 - pr(t, 0, 0.8);
  const camObj = makeCamera(cam);
  const p1 = toScreen(camObj, [146.6, 100, 737.8]), p2 = toScreen(camObj, [204.9, 100, 780.8]);
  const kTags = pr(t, 2.2, 0.6);
  return (
    <MapShot spec={cam} st={{ box: Math.exp(Math.log(1700) + (Math.log(500) - Math.log(1700)) * kd), lt: [LOOK[0] + (PAIR[0] - LOOK[0]) * kd, 40 * kd, LOOK[2] + (PAIR[1] - LOOK[2]) * kd], facade: pr(t, 1.1, 1.3), hi2: k2, front: fade, back: fade, ring: fade, rays: { heyuan: fade, xieyuan: fade, lake: fade, fen: fade, venues: fade } }} vignette={1 - pr(t, 1.2, 1.2) * 0.75}>
      {() => (
        <>
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${P.paper} 0%, rgba(243,240,234,0) 30%)`, opacity: pr(t, 1.6, 1) }} />
          <BuildingTag at={p1} label="1号楼" k={kTags} strong />
          <BuildingTag at={p2} label="2号楼" k={kTags} strong />
          <RightTitle k={kc} lines={["收官之作"]} sub={ku > 0 ? "最后的，往往也是最好的" : undefined} />
          <div style={{ position: "absolute", right: 104, top: 330, textAlign: "right", fontFamily: SANS, opacity: kt, transform: `translateY(${(1 - kt) * 12}px)` }}>
            <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 64, color: P.hero }}>355㎡</div>
            <div style={{ fontSize: 26, color: P.ink2, marginTop: 6 }}>收官楼栋里的楼王</div>
          </div>
          <Footnote text="示意画面 · 立面按甲方效果图特征简化绘制，楼栋位置按甲方总平面配准" />
        </>
      )}
    </MapShot>
  );
};

// ---------- A6 天花板：位置、楼栋、平面、耐心 ----------
export const REASONS = [
  { w: "位置", img: "pos.jpg", line: "占尽山水城" },
  { w: "楼栋", img: "bld.jpg", line: "侧身迎景" },
  { w: "户型", img: "plan.jpg", line: "一纵一横" },
  { w: "耐心", img: "courage.jpg", line: "长期主义" },
];
/** 四个维度卡片。tags：每张卡左上角的小签（如“刚才看到”“接下来”），t 为出现进度 */
export const ReasonCards: React.FC<{ ks: number[]; checks?: number[]; y?: number; tags?: { text: string; k: number; dim?: boolean }[] }> = ({ ks, checks, y = 560, tags }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", gap: 36 }}>
    {REASONS.map((r, i) => (
      <div key={r.w} style={{ width: 360, opacity: ks[i], transform: `translateY(${(1 - ks[i]) * 24}px)`, fontFamily: SANS }}>
        <div style={{ width: 360, height: 203, overflow: "hidden", background: "#E9E2D6", boxShadow: "0 10px 30px rgba(60,45,30,.12)", position: "relative" }}>
          <Img src={staticFile(`v2/thumbs/${r.img}`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {r.w === "耐心" ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 14px 10px", background: "linear-gradient(0deg, rgba(243,240,234,.95) 40%, rgba(243,240,234,0))", textAlign: "center", fontFamily: SERIF, fontWeight: 900, fontSize: 30, color: P.ink }}>1290 → <span style={{ color: P.hero }}>1186</span><span style={{ fontFamily: SANS, fontWeight: 400, fontSize: 18, color: P.ink2 }}> 户</span></div> : null}
          {tags && tags[i] && tags[i].k > 0.01 ? <div style={{ position: "absolute", left: 12, top: 12, opacity: tags[i].k, background: tags[i].dim ? "rgba(255,255,255,.92)" : P.hero, color: tags[i].dim ? P.ink2 : "#fff", fontSize: 18, padding: "4px 12px", letterSpacing: 2 }}>{tags[i].text}</div> : null}
          {checks && checks[i] > 0 ? (
            <div style={{ position: "absolute", right: 12, top: 12, width: 52, height: 52, borderRadius: 26, background: P.hero, color: "#fff", fontSize: 32, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${checks[i]})` }}>✓</div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 16 }}>
          <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 40, color: P.ink }}>{r.w}</span>
          <span style={{ fontSize: 20, color: P.ink2 }}>{r.line}</span>
        </div>
      </div>
    ))}
  </div>
);
export const O8: React.FC = () => {
  const t = useT();
  const kc = pr(t, kw("O8", "天花板") - 0.2, 0.7);
  const ks = ["位置", "楼栋", "户型", "耐心"].map((w) => Math.max(pr(t, kw("O8", w) - 0.12, 0.45), 0.2 * pr(t, 0.3, 0.8))); // 四张卡片开场先淡淡铺着，讲到哪张亮哪张
  return (
    <AbsoluteFill style={{ background: P.paper }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 100, textAlign: "center", fontFamily: SANS }}>
        <div style={{ fontSize: 24, color: P.hero, letterSpacing: 6, opacity: pr(t, kw("O8", "三百平") - 0.5, 0.4) }}>说说我的理解</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 52, color: P.ink2, letterSpacing: 4, marginTop: 14, opacity: pr(t, kw("O8", "三百平") - 0.3, 0.6) }}>太原 · 三百平以上 · 千万级总价段</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 150, color: P.ink, letterSpacing: 24, marginTop: 4, opacity: kc, transform: `scale(${1.06 - 0.06 * kc})` }}>天花板</div>
        <div style={{ width: 16 + 64 * kc, height: 3, background: P.hero, margin: "16px auto 0", opacity: kc }} />
        <div style={{ fontSize: 24, color: P.ink2, marginTop: 14, letterSpacing: 4, opacity: pr(t, kw("O8", "四个维度") - 0.2, 0.5) }}>立在四个维度上</div>
      </div>
      {/* 位置、楼栋前面已经讲过：打勾、标“刚才看到”；户型、耐心是后面要展开的：标“接下来” */}
      <ReasonCards ks={ks} y={600}
        checks={[0, 1].map((i) => pr(t, kw("O8", "刚才") - 0.2 + i * 0.15, 0.35)).concat([0, 0])}
        tags={[{ text: "刚才看到", k: pr(t, kw("O8", "刚才"), 0.4), dim: true }, { text: "刚才看到", k: pr(t, kw("O8", "刚才") + 0.15, 0.4), dim: true },
          { text: "接下来", k: pr(t, kw("O8", "接着") - 0.3, 0.4) }, { text: "接下来", k: pr(t, kw("O8", "接着") - 0.15, 0.4) }]} />
      {/* 开头先单独亮出“说说我的理解”，再缩成上方的小标签 */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 440, textAlign: "center", fontFamily: SERIF, fontWeight: 900, fontSize: 72, color: P.ink, letterSpacing: 10, opacity: pr(t, 0.1, 0.5) * (1 - pr(t, kw("O8", "三百平") - 0.6, 0.4)) }}>说说我的理解</div>
    </AbsoluteFill>
  );
};
