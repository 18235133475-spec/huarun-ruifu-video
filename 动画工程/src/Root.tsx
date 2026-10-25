import { UnitGrid } from "./v2/unitshots";
import { Thumbs } from "./v2/thumbs";
import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { Film2, FILM2_FRAMES } from "./film2";
import { ModelTest } from "./ModelTest";
import { SandTable } from "./SandTable";
import { CityTest } from "./CityTest";
import { AIClay, AIRegion, LookDev, LOOKDEV_FRAMES } from "./lookdev";
import { StyleFacade, StyleMapReveal, StyleNight, StylePlan, StyleRegion, StyleReveal, UNIT_FRAMES } from "./style";
import { FILM3_B2_FRAMES, FILM3_FRAMES, FILM3_OPEN_FRAMES, Film3, Film3Alt, Film3Open, Film3ToB2 } from "./v2/film3";
import { Probe } from "./v2/tests";
import timeline from "./timeline.json";

export const Root: React.FC = () => (
  <>
  <Composition id="Film3Open" component={Film3Open} durationInFrames={FILM3_OPEN_FRAMES} fps={30} width={1920} height={1080} />
  <Composition id="Film3ToB2" component={Film3ToB2} durationInFrames={FILM3_B2_FRAMES} fps={30} width={1920} height={1080} />
  <Composition id="Film3" component={Film3} durationInFrames={FILM3_FRAMES} fps={30} width={1920} height={1080} />
  <Composition id="UnitGrid" component={UnitGrid} durationInFrames={1} fps={30} width={1920} height={1080} />
  <Composition id="Thumbs" component={Thumbs} durationInFrames={4} fps={30} width={1920} height={1080} />
  <Composition id="Film3Alt" component={Film3Alt} durationInFrames={FILM3_FRAMES} fps={30} width={1920} height={1080} />
  <Composition id="Probe" component={Probe} defaultProps={{ cam: "changfeng", night: false, before: false }} durationInFrames={1} fps={30} width={1920} height={1080} />
  <Composition id="Film2" component={Film2} durationInFrames={FILM2_FRAMES} fps={30} width={1920} height={1080} />
  <Composition id="Animatic" component={Main} durationInFrames={timeline.totalFrames} fps={timeline.fps} width={timeline.width} height={timeline.height} />
  <Composition id="ModelTest" component={ModelTest} durationInFrames={4} fps={30} width={1920} height={1080} />
  <Composition id="SandTable" component={SandTable} durationInFrames={4} fps={30} width={1920} height={1080} />
  <Composition id="CityTest" component={CityTest} durationInFrames={7} fps={30} width={1920} height={1080} />
  <Composition id="LookDev" component={LookDev} durationInFrames={LOOKDEV_FRAMES} fps={30} width={1920} height={1080} />
  <Composition id="AIClay" component={AIClay} durationInFrames={150} fps={30} width={1920} height={1080} />
  <Composition id="AIRegion" component={AIRegion} durationInFrames={2} fps={30} width={1920} height={1080} />
  <Composition id="StyleRegion" component={StyleRegion} durationInFrames={1} fps={30} width={1920} height={1080} />
  <Composition id="StyleRegionBare" component={StyleRegion} defaultProps={{ bare: true }} durationInFrames={1} fps={30} width={1920} height={1080} />
  <Composition id="StyleDayPlain" component={StyleRegion} defaultProps={{ bare: true, diagram: false }} durationInFrames={1} fps={30} width={1920} height={1080} />
  <Composition id="StyleNightPlain" component={StyleRegion} defaultProps={{ bare: true, diagram: false, night: true }} durationInFrames={1} fps={30} width={1920} height={1080} />
  <Composition id="StyleFacade" component={StyleFacade} durationInFrames={1} fps={30} width={1920} height={1080} />
  <Composition id="StyleNight" component={StyleNight} durationInFrames={150} fps={30} width={1920} height={1080} />
  <Composition id="StylePlan" component={StylePlan} durationInFrames={UNIT_FRAMES} fps={30} width={1920} height={1080} />
  <Composition id="StyleReveal" component={StyleReveal} durationInFrames={150} fps={30} width={1920} height={1080} />
  <Composition id="StyleMapReveal" component={StyleMapReveal} durationInFrames={150} fps={30} width={1920} height={1080} />
  </>
);
