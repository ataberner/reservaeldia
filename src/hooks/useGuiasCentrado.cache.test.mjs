import assert from "node:assert/strict";
import test from "node:test";
import { Transform } from "konva/lib/Util.js";
import { resolveNodeSelectionRect, useGuiasCentrado } from "./testSupport/loadGuideHook.mjs";

function nodeAt(stage, initial = {}) {
  const attrs = { x: 0, y: 0, width: 20, height: 20, rotation: 0, scaleX: 1, scaleY: 1, visible: true, ...initial };
  const node = {
    attrs,
    rectReads: 0,
    getStage: () => stage,
    getParent: () => stage,
    isVisible: () => attrs.visible,
    getAbsoluteTransform(relativeTo) {
      const parent = node.getParent();
      const transform = parent !== relativeTo && parent?.getAbsoluteTransform
        ? parent.getAbsoluteTransform(relativeTo).copy()
        : new Transform();
      transform.translate(attrs.x, attrs.y);
      transform.rotate(attrs.rotation * Math.PI / 180);
      transform.scale(attrs.scaleX, attrs.scaleY);
      transform.translate(-(attrs.offsetX || 0), -(attrs.offsetY || 0));
      return transform;
    },
    getClientRect() {
      node.rectReads += 1;
      return { x: attrs.x, y: attrs.y, width: attrs.width * attrs.scaleX, height: attrs.height * attrs.scaleY };
    },
  };
  for (const name of Object.keys(attrs)) {
    node[name] = (value) => {
      if (value !== undefined) attrs[name] = value;
      return attrs[name];
    };
  }
  return node;
}

function scene() {
  const stage = {};
  const moving = nodeAt(stage, { x: 102, y: 700 });
  const target = nodeAt(stage, { x: 100, y: 200 });
  const objects = [
    { id: "moving", tipo: "forma", figura: "rect", seccionId: "section" },
    { id: "target", tipo: "forma", figura: "rect", seccionId: "section" },
  ];
  const refs = { current: { moving, target } };
  const request = { elementId: "moving", sessionId: "drag-1" };
  let lines = [];
  const guides = useGuiasCentrado({
    anchoCanvas: 800, elementMagnetRadius: 10, sectionMagnetRadius: 6,
    seccionesOrdenadas: [{ id: "section", altura: 4000 }, { id: "other", altura: 1000 }],
    onGuideLinesChange: (next) => { lines = next; },
  });
  return {
    stage, moving, target, objects, refs, request, guides,
    prepare: () => guides.prepararGuias(request, objects, refs),
    evaluate: () => guides.mostrarGuias(request, objects, refs),
    lines: () => lines,
  };
}

test("SNAP01: target X100 to X300 invalidates bounds with identical objects and refs", () => {
  const s = scene();
  s.prepare();
  s.target.x(300);
  s.moving.x(302);
  s.evaluate();
  assert.equal(s.moving.x(), 300);
  assert.ok(s.lines().some((line) => line.type === "reach-x" && line.points[0] === 310));
});

test("unchanged targets reuse their bounds across drag samples, including locked targets", () => {
  const s = scene();
  s.prepare();
  const reads = s.target.rectReads;
  for (let index = 0; index < 8; index += 1) {
    s.moving.x(102);
    s.moving.y(700 + index);
    s.evaluate();
    assert.equal(s.moving.x(), 100);
  }
  assert.equal(s.target.rectReads, reads, "cache hits must not re-read target bounds");
});

test("a new session and terminal cleanup discard previous-session bounds", () => {
  const s = scene();
  s.prepare();
  s.request.sessionId = "drag-2";
  s.evaluate();
  assert.equal(s.target.rectReads, 2);
  s.guides.limpiarGuias();
  assert.deepEqual(s.lines(), []);
  s.evaluate();
  assert.equal(s.target.rectReads, 3);
});

test("replacing a node under the same ID measures its new live bounds", () => {
  const s = scene();
  s.prepare();
  const replacement = nodeAt(s.stage, { x: 300, y: 200 });
  s.refs.current.target = replacement;
  s.moving.x(302);
  s.evaluate();
  assert.equal(s.moving.x(), 300);
  assert.equal(replacement.rectReads, 1);
  assert.equal(s.target.rectReads, 1);
});

for (const [name, value] of [["y", 250], ["width", 80], ["height", 80], ["rotation", 45], ["scaleX", 2], ["scaleY", 0.5]]) {
  test(`live ${name} invalidates only that target's cached bounds`, () => {
    const s = scene();
    const unaffected = nodeAt(s.stage, { x: 600, y: 1000 });
    s.objects.push({ id: "unaffected", tipo: "forma", figura: "rect", seccionId: "section" });
    s.refs.current.unaffected = unaffected;
    s.prepare();
    s.target[name](value);
    s.evaluate();
    assert.equal(s.target.rectReads, 2);
    assert.equal(unaffected.rectReads, 1);
  });
}

test("late font measurement invalidates automatic Text dimensions without object/attr updates", () => {
  const s = scene();
  s.objects[1].tipo = "texto";
  let measuredWidth = 20;
  let measuredHeight = 20;
  s.target.width = () => measuredWidth;
  s.target.height = () => measuredHeight;
  s.prepare();
  measuredWidth = 100;
  measuredHeight = 40;
  s.moving.x(202);
  s.evaluate();
  assert.equal(s.moving.x(), 200, "snap follows the new text right edge");
  assert.equal(s.target.rectReads, 2);
});

test("Gallery internal frame changes invalidate bounds without traversing its cells", () => {
  const s = scene();
  s.objects[1].tipo = "galeria";
  const frame = nodeAt(s.stage, { width: 80, height: 100 });
  frame.getParent = () => s.target;
  frame.getClientRect = () => {
    frame.rectReads += 1;
    return { x: s.target.x(), y: s.target.y(), width: frame.width(), height: frame.height() };
  };
  s.target.findOne = () => frame;
  s.target.getChildren = () => { throw new Error("Gallery cells must not be traversed"); };
  s.prepare();
  frame.width(200);
  frame.height(300);
  s.moving.x(302);
  s.evaluate();
  assert.equal(s.moving.x(), 300);
  assert.equal(frame.rectReads, 2);
  s.moving.x(302);
  s.evaluate();
  assert.equal(frame.rectReads, 2);
});

test("descendant geometry and parent transforms invalidate bounds of composite targets", () => {
  const s = scene();
  const child = nodeAt(s.stage);
  const parent = nodeAt(s.stage);
  s.target.getChildren = () => [child];
  s.target.getParent = () => parent;
  s.prepare();
  child.width(40);
  s.evaluate();
  assert.equal(s.target.rectReads, 2);
  parent.x(50);
  s.evaluate();
  assert.equal(s.target.rectReads, 3);
});

for (const [name, invalidate] of [
  ["removed ref", (s) => { delete s.refs.current.target; }],
  ["removed object", (s) => { s.objects.splice(1, 1); }],
  ["changed section", (s) => { s.objects[1].seccionId = "other"; }],
  ["hidden node", (s) => { s.target.visible(false); }],
  ["hidden ancestor", (s) => { s.target.isVisible = () => false; }],
  ["detached node", (s) => { s.target.getStage = () => null; }],
]) {
  test(`${name} removes the target and releases its axis lock immediately`, () => {
    const s = scene();
    s.evaluate();
    assert.equal(s.moving.x(), 100);
    invalidate(s);
    s.moving.x(102);
    s.evaluate();
    assert.equal(s.moving.x(), 102);
    assert.deepEqual(s.lines(), []);
  });
}

test("a newly appearing target in the same array can participate immediately", () => {
  const s = scene();
  s.objects.splice(1, 1);
  s.prepare();
  s.objects.push({ id: "target", tipo: "forma", figura: "rect", seccionId: "section" });
  s.evaluate();
  assert.equal(s.moving.x(), 100);
});

test("geometry invalidation releases stale lock but preserves the other axis lock", () => {
  const s = scene();
  // X locks to target; Y locks to an unrelated object's center at 710.
  const yTarget = nodeAt(s.stage, { x: 600, y: 700 });
  s.objects.push({ id: "yTarget", tipo: "forma", figura: "rect", seccionId: "section" });
  s.refs.current.yTarget = yTarget;
  s.evaluate();
  s.target.x(300);
  s.moving.x(102);
  // Eighteen units is beyond activation, inside the existing release radius.
  s.moving.y(718);
  s.evaluate();
  assert.equal(s.moving.x(), 102, "old X alignment must not survive the target move");
  assert.equal(s.moving.y(), 700, "unaffected Y lock retains its original anchor");
  assert.ok(s.lines().every((line) => line.type === "reach-y"));
});

test("a visual attribute change with identical bounds does not break an existing lock", () => {
  const s = scene();
  s.evaluate();
  s.target.attrs.opacity = 0.8;
  s.moving.x(118);
  s.evaluate();
  assert.equal(s.moving.x(), 100, "same-geometry target retains its locked center anchor");
});

test("changing target width preserves its unchanged Y anchor lock", () => {
  const s = scene();
  s.moving.y(202);
  s.evaluate();
  assert.equal(s.moving.y(), 200);
  s.target.width(40);
  s.moving.x(102);
  s.moving.y(218);
  s.evaluate();
  assert.equal(s.moving.y(), 200, "target center Y210 must remain locked inside its release radius");
  assert.ok(s.lines().some((line) => line.type === "reach-y" && line.points[1] === 210));
});

test("desktop Alt clears guide locks; releasing it uses refreshed target geometry", () => {
  const s = scene();
  s.evaluate();
  s.request.modifierState = { altKey: true, isTouchLike: false };
  s.moving.x(102);
  s.evaluate();
  assert.equal(s.moving.x(), 102);
  assert.deepEqual(s.lines(), []);
  s.target.x(300);
  s.request.modifierState.altKey = false;
  s.moving.x(302);
  s.evaluate();
  assert.equal(s.moving.x(), 300);
});

test("locked but visible reference objects remain eligible without changing edit permissions", () => {
  const s = scene();
  s.objects[1].locked = true;
  s.objects[1].bloqueado = true;
  s.evaluate();
  assert.equal(s.moving.x(), 100);
});

test("stage-space snap deltas respect a transformed parent's local coordinates", () => {
  const s = scene();
  s.objects.splice(1, 1);
  s.objects[0].tipo = "texto";
  const parent = nodeAt(s.stage, { x: 100, y: 200, rotation: 90, scaleX: 2, scaleY: 0.5 });
  s.moving.getParent = () => parent;
  s.moving.x(0);
  s.moving.y(-608);
  s.evaluate();
  const box = resolveNodeSelectionRect(s.objects[0], s.moving, { relativeTo: s.stage });
  assert.ok(Math.abs(box.x + box.width / 2 - 400) < 1e-8);
  assert.ok(Math.abs(s.moving.x()) < 1e-8);
  assert.ok(Math.abs(s.moving.y() + 610) < 1e-8);
  assert.ok(s.lines().some((line) => line.type === "seccion-cx"));
});
