// 模型验收用：把 TASK-002 交付的 unit_b02.glb 放进镜头里看效果，不进成片。
import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type View = { pos: [number, number, number]; look: [number, number, number]; fov: number; label: string };
// 本户坐标：x 向东，z 向南（北为 -z），地面 y=0
const VIEWS: View[] = [
  { label: "横线①：入户向南，穿过双开门", pos: [9.79, 1.5, -12.6], look: [9.79, 1.4, -6.5], fov: 62 },
  { label: "横线②：玄关向西看走廊", pos: [9.79, 1.5, -7.06], look: [3.0, 1.4, -7.06], fov: 62 },
  { label: "横线③：走廊进主卧", pos: [5.2, 1.5, -7.06], look: [2.6, 1.2, -4.0], fov: 62 },
  { label: "纵线（有吊顶）：客厅南窗向北", pos: [16.3, 1.5, -2.27], look: [16.3, 1.4, -15.7], fov: 62 },
];

const Cam: React.FC<{ v: View }> = ({ v }) => {
  const { camera } = useThree();
  const c = camera as THREE.PerspectiveCamera;
  c.position.set(...v.pos); c.fov = v.fov; c.near = 0.05; c.far = 500; c.lookAt(...v.look); c.updateProjectionMatrix();
  return null;
};

export const ModelTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [handle] = useState(() => delayRender("glb"));
  useEffect(() => {
    new GLTFLoader().load(staticFile("models/unit_b02.glb"), (g) => { setScene(g.scene); continueRender(handle); });
  }, [handle]);
  const v = VIEWS[Math.min(frame, VIEWS.length - 1)];
  return (
    <AbsoluteFill style={{ background: "#eeeae2" }}>
      <ThreeCanvas width={width} height={height} camera={{ fov: v.fov }}>
        <Cam v={v} />
        <color attach="background" args={["#eeeae2"]} />
        <hemisphereLight args={["#ffffff", "#8a8f96", 1.1]} />
        <directionalLight position={[-20, 30, 15]} intensity={1.6} />
        <directionalLight position={[25, 12, -20]} intensity={0.4} />
        {scene && <primitive object={scene} />}
      </ThreeCanvas>
      <div style={{ position: "absolute", left: 40, top: 30, fontSize: 34, fontFamily: "PingFang SC", color: "#333", background: "rgba(255,255,255,.7)", padding: "6px 16px", borderRadius: 8 }}>{v.label}</div>
    </AbsoluteFill>
  );
};
