// 局部对比用的测试画面（不进成片）：桥、和园。
import React from "react";
import { AbsoluteFill } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useReady } from "./data";
import { CamSpec, makeCamera } from "./geo";
import { MapScene } from "./map";
import { N, P } from "./theme";

const CAMS: Record<string, CamSpec> = {
  changfeng: { t: [713, 4, -1130], az: 200, el: 18, D: 900, span: 260 },
  jifen: { t: [605, 4, -12], az: 195, el: 24, D: 900, span: 280 },
  nanzhonghuan: { t: [592, 25, 1522], az: 205, el: 14, D: 900, span: 260 },
  heyuan: { t: [5, 0, 1090], az: 60, el: 42, D: 520, span: 360 },
  b11mid: { t: [560, 8, -500], az: 25, el: 6, D: 1400, span: 380 },
};
export const Probe: React.FC<{ cam: string; night?: boolean; before?: boolean; park?: boolean }> = ({ cam, night = false, before = false, park = false }) => {
  const ready = useReady();
  if (!ready) return <AbsoluteFill style={{ background: P.paper }} />;
  const c = makeCamera(CAMS[cam]); c.near = 5; c.far = 30000; c.updateProjectionMatrix();
  return (
    <AbsoluteFill style={{ background: night ? N.bg : P.paper }}>
      <ThreeCanvas width={1920} height={1080} shadows style={{ backgroundColor: night ? N.bg : P.paper }}>
        <MapScene cam={c} st={{ night, facade: 1, hero: 1, ring: 0, fog: [2500, 12000], box: 900, lt: [CAMS[cam].t[0], 0, CAMS[cam].t[2]], noBridges: before && !park, noHeyuan: before && park }} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
