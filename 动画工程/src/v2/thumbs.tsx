// 开场“天花板 · 四个维度”卡片用的四张小图（同一画法、同一构图逻辑），用 Thumbs 合成渲染静帧后存到 public/v2/thumbs/。
// 第 0 帧位置：正北朝上俯视；第 1 帧楼栋：正对1、2号楼正面（西南）看两栋全貌；第 2 帧平面：整户正北朝上；第 3 帧勇气：黄昏下整个瑞府，收官的1、2号楼加亮。
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { PerspShot } from "./ch1";
import { useReady } from "./data";
import { CamSpec, PAIR } from "./geo";
import { MapShot } from "./open";
import { P } from "./theme";
import { UnitThumb } from "./unitshots";

const POS: CamSpec = { t: [PAIR[0] + 70, 0, PAIR[1] + 30], az: 180, el: 78, D: 24000, span: 760, sy: 540 };
const BLD: CamSpec = { t: [PAIR[0], 52, PAIR[1]], az: 217.7, el: 10, D: 900, span: 175, sy: 560 };
const GUTS: CamSpec = { t: [215, 30, 1020], az: 240, el: 32, D: 1300, span: 600, sy: 560 };

export const Thumbs: React.FC = () => {
  const f = useCurrentFrame();
  const ready = useReady();
  if (!ready) return <AbsoluteFill style={{ background: P.paper }} />;
  if (f === 0) return <MapShot spec={POS} st={{ hero: 1, ring: 1, facade: 0 }} vignette={0.4} />;
  if (f === 1) return <PerspShot spec={BLD} st={{ facade: 1, hero: 1, ring: 0, fog: [1500, 7000], box: 500, lt: [PAIR[0], 40, PAIR[1]] }} />;
  if (f === 2) return <UnitThumb />;
  return <PerspShot spec={GUTS} st={{ dusk: 0.45, facade: 1, hero: 1, hi2: 1, ring: 0, fog: [1800, 8000], box: 900, lt: [215, 0, 1060] }} />;
};
