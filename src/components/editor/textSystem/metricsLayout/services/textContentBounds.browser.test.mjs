import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import puppeteer from "puppeteer";
import { measureTextContentBottom } from "./textContentBounds.js";
import { resolveTextBoxLayout } from "../../render/konva/textBoxLayout.js";

const require = createRequire(import.meta.url);

test("Konva content bounds match rendered text on desktop/mobile, without touching live nodes", async () => {
  // Synthetic, offline canvas only: no editor/Firebase initialization or user profile.
  const browser = await puppeteer.launch({ headless: true, pipe: true, args: ["--disable-background-networking"] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => request.abort());
    await page.setContent('<div id="canvas"></div>');
    await page.addScriptTag({ path: require.resolve("konva/konva.min.js") });
    const results = await page.evaluate(({ measureSource, layoutSource }) => {
      const layout = new Function(`return (${layoutSource})`)();
      const measure = new Function("resolveTextBoxLayout", `return (${measureSource})`)(layout);
      const cases = [];
      for (const viewportScale of [1, 0.45, 1.6]) {
        for (const grouped of [false, true]) {
          for (const wrap of ["word", "char", "auto"]) {
            const stage = new Konva.Stage({ container: "canvas", width: 800, height: 900,
              scaleX: viewportScale, scaleY: viewportScale, x: 19, y: 41 });
            const layer = new Konva.Layer();
            stage.add(layer);
            const object = { id: "text", tipo: "texto", x: 30, y: 82,
              width: 155, __autoWidth: wrap === "auto", textWrapMode: wrap, align: "center" };
            const rootObject = grouped ? { id: "group", y: 60 } : object;
            const sectionOffset = 410;
            let parent = layer;
            let rootNode;
            if (grouped) {
              rootNode = new Konva.Group({ x: 120, y: rootObject.y + sectionOffset,
                rotation: 12, scaleX: 1.1, scaleY: 0.85, width: 200, height: 50 });
              const content = new Konva.Group();
              layer.add(rootNode);
              rootNode.add(content);
              parent = content;
            }
            const node = new Konva.Text({ id: "text", x: object.x, y: object.y + (grouped ? 0 : sectionOffset),
              text: "Antes", fontFamily: "sans-serif", fontSize: 24, lineHeight: 1.2 * 0.92,
              letterSpacing: 1.3, rotation: -7, scaleX: 1.05, scaleY: 1.2,
              stroke: "red", strokeWidth: 4, shadowBlur: 10, shadowOffsetY: 20 });
            parent.add(node);
            rootNode ||= node;
            const originalAttrs = JSON.stringify(node.getAttrs());
            const parentChildren = parent.getChildren().length;
            for (const text of ["Una línea", "Una\nsegunda\ntercera", "Nuestra historia empezó con una mirada. ".repeat(12), "\n\n", "", "Un café ☕ y música 🎵   "]) {
              const measured = measure({ node, rootNode, object, rootObject, text });
              const expected = node.clone({ text: text.replace(/[ \t]+$/gm, ""), width: undefined, wrap: "none" });
              const expectedLayout = layout(object, Math.max(1, Math.ceil(expected.getTextWidth())));
              expected.setAttrs({ width: expectedLayout.width, wrap: expectedLayout.wrap,
                x: node.x() - node.offsetX() + expectedLayout.offsetX, offsetX: expectedLayout.offsetX });
              parent.add(expected);
              const actual = expected.getClientRect({ relativeTo: stage, skipShadow: true, skipStroke: true });
              cases.push({ viewportScale, grouped, wrap, measured,
                expected: actual.y + actual.height - sectionOffset,
                unchanged: JSON.stringify(node.getAttrs()) === originalAttrs });
              expected.destroy();
            }
            if (parent.getChildren().length !== parentChildren) throw new Error("measurement leaked a node");
            stage.destroy();
          }
        }
      }
      return cases;
    }, { measureSource: measureTextContentBottom.toString(), layoutSource: resolveTextBoxLayout.toString() });
    assert.equal(results.length, 108);
    for (const result of results) {
      assert.ok(Math.abs(result.measured - result.expected) < 1e-8, JSON.stringify(result));
      assert.equal(result.unchanged, true);
    }
  } finally {
    await browser.close();
  }
});
