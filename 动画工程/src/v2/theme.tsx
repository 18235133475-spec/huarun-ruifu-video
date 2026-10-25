// v2 视觉系统：色板、字体、通用文字组件。全片只用这一套（风格样帧第三版定稿，2026-10-22）。
import React from "react";

export const P = {
  paper: "#F3F0EA", // 页面底色
  ground: "#F2F1ED", // 地图地面
  site: "#F6F2EA", // 地块
  road: "#FBF9F5",
  ink: "#2B2622",
  ink2: "#6F665C",
  mute: "#A39A8E",
  line: "#CFC6B8",
  city: "#E1E0DB",
  white: "#FCFCFA",
  water: "#A3CFEA",
  waterInk: "#4F8BA6",
  green: "#C9E0AE",
  greenInk: "#5F8A4E",
  trees: ["#7DA86C", "#93B880", "#A9C796", "#6C9A5E"],
  hero: "#C25A2C", // 赤陶：只给2号楼、视线和标题条
  heroL: "#E8B596",
  landmark: "#E6D2AA", // 地标色：五大馆等重点公共建筑（第二级重点，第一级是1、2号楼的赤陶）
  edge: "#6F665C",
  warm: "#F0D3BD",
  // 瑞府其余楼栋：按效果图立面取色（浅灰蓝玻璃幕墙、白色屋面、顶部香槟金冠顶），和城市灰区分开
  ruifuWall: "#BCCAD3", ruifuRoof: "#F1F0EC", ruifuCrown: "#D6BB86",
};
/** 重点配套的主色：按实景定色相（官网/实拍照片和俯视卫星图），再统一压到同一档饱和度和明度，
 *  既能互相区分，又和1、2号楼的赤陶（全片唯一的高饱和色）不抢。wall 立面、roof 屋顶、glass 玻璃 */
export const LANDMARK: Record<string, { wall: string; roof: string; glass: string }> = {
  venue_grand_theatre: { wall: "#F4EBDA", roof: "#FCF9F3", glass: "#9FC0D0" }, // 山西大剧院：象牙白石材（实景就是白色，靠更亮的白、玻璃和描边与城市灰区分）
  venue_library: { wall: "#B3897A", roof: "#CDAE9F", glass: "#9DB9C4" }, // 山西省图书馆：玫瑰红褐格栅
  venue_art_museum: { wall: "#EDF1F4", roof: "#FAFBFC", glass: "#8FB4C6" }, // 太原美术馆：冷白折板（实景是白色）
  venue_museum: { wall: "#B8645B", roof: "#DDB8AE", glass: "#9DB9C4" }, // 太原博物馆：朱红锥筒
  venue_science_museum: { wall: "#AAA49B", roof: "#C6C1B9", glass: "#7BB0B7" }, // 山西省科技馆：暖灰石材 + 青蓝玻璃
  wanxiang: { wall: "#A87878", roof: "#EFE9E2", glass: "#B7CFDA" }, // 万象城：酒红立面 + 白色网壳穹顶
};
export const SERIF = '"Songti SC", "STSong", serif';
export const SANS = '"PingFang SC", "Hiragino Sans GB", sans-serif';

/** 夜景配色：同一张底图换暗底 */
export const N = { // 夜景：蓝紫色调（参考甲方夜景效果图），路网金色发光，河面亮蓝，项目楼栋白色泛光
  bg: "#222B48", ground: "#1A2136", road: "#E3A852", city: "#262D44", site: "#222A40", island: "#232B42",
  water: "#2F86C8", green: "#1D3330", trees: ["#1E3A2E", "#24432F", "#1A3329", "#2A4A35"], venue: "#DCE2EE", other: "#7F8AA6",
};

/** 画面底部的说明小字（示意说明、数据来源）：用户要求全片去掉（2026-10-25），各镜头的调用保留，组件不再显示 */
export const Footnote: React.FC<{ text: string; dark?: boolean; right?: boolean }> = () => null;

export const Chip: React.FC<{ color: string; label: string; ring?: boolean }> = ({ color, label, ring }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SANS, fontSize: 19, color: P.ink2 }}>
    <div style={{ width: 22, height: 14, background: ring ? "transparent" : color, border: ring ? `2.5px solid ${color}` : "1px solid rgba(60,45,30,.18)", borderRadius: 2 }} />
    {label}
  </div>
);

/** 地图标注：圆点 + 引线 + 标签 */
export const Pin: React.FC<{ at: [number, number]; label: string; sub?: string; dx?: number; dy?: number; color: string; solid?: boolean }> = ({ at: [x, y], label, sub, dx = 0, dy = -70, color, solid }) => (
  <>
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
      <line x1={x} y1={y} x2={x + dx} y2={y + dy} stroke={color} strokeWidth={2} />
      <circle cx={x} cy={y} r={7} fill="#fff" stroke={color} strokeWidth={3} />
    </svg>
    <div style={{ position: "absolute", left: x + dx, top: y + dy, transform: `translate(${dx < 0 ? "-100%" : dx > 0 ? "0" : "-50%"}, -100%)`, background: solid ? color : "rgba(255,255,255,.94)", color: solid ? "#fff" : P.ink, padding: "8px 14px 9px", fontFamily: SANS, boxShadow: "0 4px 14px rgba(60,45,30,.12)", borderLeft: solid ? undefined : `4px solid ${color}`, whiteSpace: "nowrap" }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 1 }}>{label}</div>
      {sub ? <div style={{ fontSize: 16, marginTop: 2, color: solid ? "rgba(255,255,255,.9)" : P.ink2 }}>{sub}</div> : null}
    </div>
  </>
);

/** 竖排标题：章节小字在上，宋体大字竖排（从右往左），副标题在最左两列 */
export const VTitle: React.FC<{ x: number; y: number; chapter: string; lines: string[]; sub: string[] }> = ({ x, y, chapter, lines, sub }) => (
  <div style={{ position: "absolute", left: x, top: y, fontFamily: SANS }}>
    <div style={{ fontSize: 20, color: P.hero, letterSpacing: 3 }}>{chapter}</div>
    <div style={{ writingMode: "vertical-rl", marginTop: 30, whiteSpace: "nowrap" }}>
      {lines.map((l) => <div key={l} style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 80, lineHeight: 1.3, letterSpacing: 10, color: P.ink }}>{l}</div>)}
      <div style={{ marginRight: 26, paddingTop: 10, fontSize: 23, lineHeight: 1.75, letterSpacing: 4, color: P.ink2 }}>
        {sub.map((t) => <div key={t}>{t}</div>)}
      </div>
    </div>
  </div>
);

// ---------- 正片文字组件 ----------
const kOf = (k?: number) => (k === undefined ? 1 : Math.max(0, Math.min(1, k)));
/** 居中对称大标题：片名、金句、结尾 */
export const CenterTitle: React.FC<{ k?: number; kicker?: string; title: string; sub?: string; dark?: boolean; size?: number }> = ({ k, kicker, title, sub, dark, size = 96 }) => {
  const o = kOf(k);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: o, fontFamily: SANS, color: dark ? "#F3E9D8" : P.ink, textShadow: dark ? "0 2px 16px rgba(0,0,0,.45)" : undefined }}>
      {kicker ? <div style={{ fontSize: 26, letterSpacing: 12, marginBottom: 20, color: dark ? "rgba(243,233,216,.85)" : P.hero }}>{kicker}</div> : null}
      <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: size, letterSpacing: 8, transform: `translateY(${(1 - o) * 12}px)`, whiteSpace: "pre-line", textAlign: "center", lineHeight: 1.3 }}>{title}</div>
      <div style={{ width: 16 + 64 * o, height: 3, background: P.hero, marginTop: 26, opacity: 0.9 }} />
      {sub ? <div style={{ fontSize: 26, marginTop: 20, color: dark ? "rgba(243,233,216,.8)" : P.ink2, letterSpacing: 2 }}>{sub}</div> : null}
    </div>
  );
};
/** 右上右对齐标题：楼栋近景、天空留白处 */
export const RightTitle: React.FC<{ k?: number; chapter?: string; lines: string[]; sub?: string; dark?: boolean; top?: number }> = ({ k, chapter, lines, sub, dark, top = 92 }) => {
  const o = kOf(k);
  return (
    <div style={{ position: "absolute", right: 104, top, textAlign: "right", fontFamily: SANS, opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>
      {chapter ? <div style={{ fontSize: 20, color: dark ? "#E8B596" : P.hero, letterSpacing: 3 }}>{chapter}</div> : null}
      <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 84, color: dark ? "#F3E9D8" : P.ink, marginTop: 12, letterSpacing: 4, lineHeight: 1.2 }}>{lines.map((l) => <div key={l}>{l}</div>)}</div>
      {sub ? <div style={{ fontSize: 26, color: dark ? "rgba(243,233,216,.8)" : P.ink2, marginTop: 16 }}>{sub}</div> : null}
    </div>
  );
};
/** 楼栋标签（跟着三维位置走） */
export const BuildingTag: React.FC<{ at: [number, number]; label: string; k?: number; strong?: boolean }> = ({ at: [x, y], label, k, strong = true }) => {
  const o = kOf(k);
  return (
    <div style={{ position: "absolute", left: x, top: y - 14, transform: `translate(-50%, -100%) scale(${0.9 + 0.1 * o})`, transformOrigin: "50% 100%", textAlign: "center", fontFamily: SANS, opacity: o }}>
      <div style={{ background: strong ? P.hero : "rgba(255,255,255,.92)", color: strong ? "#fff" : P.hero, border: `2px solid ${P.hero}`, fontSize: 22, fontWeight: 600, padding: "4px 14px", letterSpacing: 1, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ width: 2, height: 22, background: P.hero, margin: "0 auto" }} />
    </div>
  );
};

/** 体验文案：跟着画面里的位置走。粗一行写“看到什么”，细一行写依据或感受 */
/** 白框标注。band 模式（三维地图镜头统一用）：框顶对齐画面上方同一条线（默认距顶 150 像素），水平居中对准所指的东西、左右不出 96 像素边距，
 *  引线从标注点竖直向上接到框底；左上留给章节标题、右上留给示意小图，下方留给字幕。不传 band 时按 dx/dy 自由摆（户型图等平面镜头用） */
export const Callout: React.FC<{ at: [number, number]; title: string; sub?: string; k?: number; color?: string; dx?: number; dy?: number; dark?: boolean; dot?: boolean; band?: number | boolean }> = ({ at: [x, y], title, sub, k, color = P.hero, dx: dx0 = 0, dy: dy0 = -90, dark, dot = true, band }) => {
  const o = kOf(k);
  let dx = dx0, dy = dy0;
  if (band !== undefined && band !== false) {
    const top = band === true ? 150 : band, h = sub ? 96 : 66;
    const w = Math.max(title.length * 36, (sub?.length ?? 0) * 21) + 46;
    const cx = Math.min(1824 - w / 2, Math.max(96 + w / 2, x));
    dx = 0; dy = top + h - y;
    const lx = cx, ly = top + h;
    return (
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: o, pointerEvents: "none" }}>
        <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
          <polyline points={`${x},${y} ${x},${y + (ly - y) * o} ${x + (lx - x) * o},${y + (ly - y) * o}`} fill="none" stroke={color} strokeWidth={2} />
          {dot ? <circle cx={x} cy={y} r={7} fill="#fff" stroke={color} strokeWidth={3} /> : null}
        </svg>
        <div style={{ position: "absolute", left: lx, top: ly, transform: `translate(-50%, -100%) translateY(${(1 - o) * 10}px)`, background: dark ? "rgba(26,32,43,.82)" : "rgba(255,255,255,.95)", borderTop: `4px solid ${color}`, padding: "10px 22px 12px", boxShadow: "0 8px 24px rgba(60,45,30,.14)", fontFamily: SANS, whiteSpace: "nowrap", textAlign: "center" }}>
          <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 34, letterSpacing: 2, color: dark ? "#F3E9D8" : P.ink }}>{title}</div>
          {sub ? <div style={{ fontSize: 21, marginTop: 6, color: dark ? "rgba(243,233,216,.85)" : P.ink2 }}>{sub}</div> : null}
        </div>
      </div>
    );
  }
  const lx = x + dx, ly = y + dy;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, opacity: o, pointerEvents: "none" }}>
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, overflow: "visible" }}>
        <line x1={x} y1={y} x2={x + dx * o} y2={y + dy * o} stroke={color} strokeWidth={2} />
        {dot ? <circle cx={x} cy={y} r={7} fill="#fff" stroke={color} strokeWidth={3} /> : null}
      </svg>
      <div style={{ position: "absolute", left: lx, top: ly, transform: `translate(${dx < 0 ? "-100%" : dx > 0 ? "0" : "-50%"}, -100%) translateY(${(1 - o) * 10}px)`, background: dark ? "rgba(26,32,43,.82)" : "rgba(255,255,255,.95)", borderLeft: `5px solid ${color}`, padding: "12px 20px 13px", boxShadow: "0 8px 24px rgba(60,45,30,.14)", fontFamily: SANS, whiteSpace: "nowrap" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 34, letterSpacing: 2, color: dark ? "#F3E9D8" : P.ink }}>{title}</div>
        {sub ? <div style={{ fontSize: 21, marginTop: 6, color: dark ? "rgba(243,233,216,.85)" : P.ink2 }}>{sub}</div> : null}
      </div>
    </div>
  );
};

/** 透视镜头的章节标题：横排放在天空留白处，背后一条纸色渐变，和三维画面分开（不压在楼群上） */
export const SkyTitle: React.FC<{ k?: number; chapter: string; title: string; sub?: string }> = ({ k, chapter, title, sub }) => {
  const o = kOf(k);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 300, opacity: o, background: "linear-gradient(180deg, rgba(243,240,234,.96) 0%, rgba(243,240,234,.88) 45%, rgba(243,240,234,0) 100%)" }} />
      <div style={{ position: "absolute", left: 104, top: 70, opacity: o, transform: `translateY(${(1 - o) * 12}px)`, fontFamily: SANS }}>
        <div style={{ fontSize: 22, color: P.hero, letterSpacing: 3 }}>{chapter}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 10 }}>
          <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 72, color: P.ink, letterSpacing: 4 }}>{title}</div>
          {sub ? <div style={{ fontSize: 26, color: P.ink2, letterSpacing: 2 }}>{sub}</div> : null}
        </div>
      </div>
    </>
  );
};
