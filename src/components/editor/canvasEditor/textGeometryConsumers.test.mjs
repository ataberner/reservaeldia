import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Group } from "konva/lib/Group.js";
import { Rect } from "konva/lib/shapes/Rect.js";
import { geometryUrl } from "../../../hooks/testSupport/loadGuideHook.mjs";

const { resolveNodeSelectionRect, resolveSingleTextSelectionVisualBounds } = await import(geometryUrl);

const asUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function loadSource(relative, replacements) {
  let source = await readFile(new URL(relative, import.meta.url), "utf8");
  for (const [specifier, url] of Object.entries(replacements)) source = source.replaceAll(JSON.stringify(specifier), JSON.stringify(url));
  return asUrl(source);
}
const authorityUrl = await loadSource("./konvaAuthoritativeBounds.js", {
  "@/components/editor/canvasEditor/konvaCanonicalPose": new URL("./konvaCanonicalPose.js", import.meta.url).href,
});
const debugUrl = asUrl(`
  export const buildTextGeometryContractRect = (rect) => rect;
  export const evaluateTextGeometryContractRectAlignment = () => ({pass:true});
  export const logTextGeometryContractInvariant = () => {};
`);
const { getInlineKonvaProjectedRectViewport } = await import(await loadSource("../overlays/inlineGeometry.js", {
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
  "@/components/editor/canvasEditor/textGeometryContractDebug": debugUrl,
}));
const { buildSelectionFramePolygon } = await import(await loadSource("../textSystem/render/konva/selectionFrameVisuals.js", {
  "@/components/editor/canvasEditor/konvaAuthoritativeBounds": authorityUrl,
}));

function fixture(nodeAttrs = {}, parentAttrs = {}, stageAttrs = {}, cssScale = 0.6) {
  const stage = new Group({width:800, height:1000, ...stageAttrs});
  stage.getStage = () => stage;
  stage.batchDraw = () => {};
  stage.container = () => ({getBoundingClientRect: () => ({left:15, top:30, width:800 * cssScale, height:1000 * cssScale})});
  const parent = new Group(parentAttrs);
  stage.add(parent);
  const node = new Rect({id:"text", x:400, y:100, width:200, height:40, offsetX:100,
    __canonicalPoseMode:"text-origin-offset", ...nodeAttrs});
  node.getClassName = () => "Text";
  parent.add(node);
  return {node, stage, cssScale};
}
function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.001, `${message}: ${actual} != ${expected}`);
}

for (const [label, nodeAttrs, parentAttrs, stageAttrs] of [
  ["plain", {}, {}, {}],
  ["rotated 90", {rotation:90}, {}, {}],
  ["scaled and rotated", {rotation:-45, scaleX:1.5, scaleY:0.7, offsetY:10}, {}, {}],
  ["inherited rotation", {}, {rotation:45, x:80, y:30}, {}],
  ["native stage and CSS zoom", {rotation:90}, {scaleX:1.2}, {x:20,y:35,scaleX:1.5,scaleY:1.3}],
]) {
  test(`inline viewport AABB matches painted text once: ${label}`, () => {
    const {node,stage,cssScale}=fixture(nodeAttrs,parentAttrs,stageAttrs);
    const projection=getInlineKonvaProjectedRectViewport(node,stage,cssScale);
    const painted=node.getClientRect({skipShadow:true,skipStroke:true});
    const expected={x:15+painted.x*cssScale,y:30+painted.y*cssScale,width:painted.width*cssScale,height:painted.height*cssScale};
    for(const key of Object.keys(expected)) near(projection.konvaProjectedRectViewport[key],expected[key],key);
    const [a,b,c,d,e,f] = projection.konvaTextViewportTransform;
    const liveTransform = node.getAbsoluteTransform();
    for (const point of [{x:0,y:0},{x:200,y:0},{x:200,y:40},{x:0,y:40}]) {
      const absolutePoint = liveTransform.point(point);
      near(a*point.x+c*point.y+e,15+absolutePoint.x*cssScale,"DOM corner x");
      near(b*point.x+d*point.y+f,30+absolutePoint.y*cssScale,"DOM corner y");
    }
  });
}

test("text selection polygon stays in stage coordinates with parent and stage transforms", () => {
  const {node,stage}=fixture({rotation:45,offsetY:10},{rotation:-15,scaleX:1.4},{x:30,y:25,scaleX:2,scaleY:1.5});
  const points=buildSelectionFramePolygon(node,0);
  const transform=node.getAbsoluteTransform(stage);
  const expected=[{x:0,y:0},{x:200,y:0},{x:200,y:40},{x:0,y:40}].flatMap(point=>{
    const mapped=transform.point(point);return [mapped.x,mapped.y];
  });
  for(let index=0;index<8;index++) near(points[index],expected[index],`corner ${index}`);
});

test("text selection uses inherited rotation even with zero local rotation", () => {
  const {node}=fixture({}, {rotation:45,x:30,y:20});
  const visual=resolveSingleTextSelectionVisualBounds({object:{tipo:"texto"},node});
  assert.equal(visual.kind,"polygon");
  assert.deepEqual(visual.points,buildSelectionFramePolygon(node,0));
});

test("selection AABB honors explicit ancestor coordinates and otherwise stays stage-local", () => {
  const {node,stage}=fixture({rotation:45},{x:100,y:50,rotation:20},{x:30,scaleX:2,scaleY:1.5});
  for (const relativeTo of [stage,node.getParent(),null]) {
    const actual=resolveNodeSelectionRect({tipo:"texto"},node,{relativeTo});
    const expected=node.getClientRect({relativeTo:relativeTo || undefined,skipShadow:true,skipStroke:true});
    for (const key of Object.keys(expected)) near(actual[key],expected[key],key);
  }
  assert.deepEqual(resolveNodeSelectionRect({tipo:"texto"},node),resolveNodeSelectionRect({tipo:"texto"},node,{relativeTo:stage}));
});

test("untransformed text keeps rectangular selection and projected-box inline layout at CSS zoom", () => {
  const {node,stage,cssScale}=fixture();
  assert.equal(resolveSingleTextSelectionVisualBounds({object:{tipo:"texto"},node}).kind,"rect");
  assert.equal(getInlineKonvaProjectedRectViewport(node,stage,cssScale).canUseProjectedBoxLayout,true);
});

test("empty measured text retains its inline transform and insertion origin", () => {
  const {node,stage,cssScale}=fixture({width:0,rotation:45,offsetX:0});
  const projection=getInlineKonvaProjectedRectViewport(node,stage,cssScale);
  assert.ok(projection.konvaTextViewportTransform,"zero width is measured geometry, not missing geometry");
  const [, , , ,x,y]=projection.konvaTextViewportTransform;
  const origin=node.getAbsoluteTransform().point({x:0,y:0});
  near(x,15+origin.x*cssScale,"insertion origin x");
  near(y,30+origin.y*cssScale,"insertion origin y");
});

test("native stage translation keeps inline in the transformed backend path", () => {
  const {node,stage,cssScale}=fixture({}, {}, {x:20,y:35});
  const projection=getInlineKonvaProjectedRectViewport(node,stage,cssScale);
  assert.equal(projection.canUseProjectedBoxLayout,false,
    "the CSS-only synthetic decoration adapter must not reapply the native stage transform");
});

test("semantic backend uses local dimensions and CSS transform for inherited rotation", async () => {
  const source=await readFile(new URL("../textSystem/render/domSemantic/HiddenSemanticTextBackend.jsx",import.meta.url),"utf8");
  const start=source.indexOf("  const useProjectedBoxLayout =");
  const end=source.indexOf("  const usesTransformedBackendLayout =",start);
  assert.ok(start>=0 && end>start);
  const {node,stage,cssScale}=fixture({}, {rotation:45});
  const projection=getInlineKonvaProjectedRectViewport(node,stage,cssScale);
  const decide=new Function("projectedRect","nodeProps","effectiveKonvaProjection",`${source.slice(start,end)}; return useProjectedBoxLayout;`);
  assert.equal(Boolean(decide(projection.konvaProjectedRectViewport,{rotation:0,scaleX:1,scaleY:1},projection)),false);
});
