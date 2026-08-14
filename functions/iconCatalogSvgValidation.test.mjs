import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { inspectAndNormalizeSvg } = requireBuiltModule(
  "lib/iconCatalog/svgValidation.js"
);

function inspect(svgText, name = "icon.svg") {
  return inspectAndNormalizeSvg({
    svgText,
    fileName: name,
    bytes: Buffer.byteLength(svgText),
    normalizeSafe: true,
    normalizeCurrentColor: false,
  });
}

function inspectWithCurrentColorNormalization(svgText) {
  return inspectAndNormalizeSvg({
    svgText,
    fileName: "normalize-color.svg",
    bytes: Buffer.byteLength(svgText),
    normalizeSafe: true,
    normalizeCurrentColor: true,
  });
}

test("backend canonicalizes every supported SVG composition without flattening it to paths", async () => {
  const cases = {
    simplePath: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v20H2z"/></svg>',
    multiplePaths: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#f00" d="M0 0h12v24H0z"/><path fill="#00f" d="M12 0h12v24H12z"/></svg>',
    shapeWithoutPath: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#123456"/></svg>',
    transformedGroup: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><g transform="translate(4 2) scale(1.5)"><rect width="12" height="8" fill="#123456"/></g></svg>',
    strokeOnly: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="2" y1="2" x2="22" y2="22" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    localReference: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><path id="tile" d="M0 0h6v6H0z" fill="#333"/></defs><use href="#tile" transform="translate(8,8)"/></svg>',
  };

  const reports = await Promise.all(
    Object.entries(cases).map(async ([name, svgText]) => [name, await inspect(svgText, `${name}.svg`)])
  );
  for (const [name, report] of reports) {
    assert.notEqual(report.status, "rejected", name);
    assert.ok(report.renderable, name);
    assert.ok(report.renderable.geometryCount > 0, name);
  }

  assert.match(reports.find(([name]) => name === "shapeWithoutPath")[1].renderable.svgText, /<circle/);
  assert.match(reports.find(([name]) => name === "transformedGroup")[1].renderable.svgText, /transform=/);
  assert.match(reports.find(([name]) => name === "strokeOnly")[1].renderable.svgText, /stroke="currentColor"/);
});

test("backend distinguishes currentColor from fixed multicolor and preserves non-square ratio", async () => {
  const currentColor = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg>'
  );
  assert.equal(currentColor.renderable?.colorMode, "currentColor");

  const multicolor = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" width="40" height="20"><path fill="#f00" d="M0 0h20v20H0z"/><path fill="#00f" d="M20 0h20v20H20z"/></svg>'
  );
  assert.equal(multicolor.renderable?.colorMode, "fixed");
  assert.equal(multicolor.renderable?.viewBox, "0 0 40 20");
  assert.match(multicolor.renderable?.svgText || "", /preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(multicolor.renderable?.svgText || "", /\swidth="40"|\sheight="20"/);
  assert.ok(multicolor.warnings.some((entry) => entry.code === "ICON_SVG_NON_SQUARE_VIEWBOX"));
});

test("optional color normalization never collapses mixed currentColor plus fixed paint", async () => {
  const svgText = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h12v24H0z"/><path fill="#ffcc00" d="M12 0h12v24H12z"/></svg>';
  const report = await inspectWithCurrentColorNormalization(svgText);
  assert.notEqual(report.status, "rejected");
  assert.match(report.renderable?.svgText || "", /fill="currentColor"/);
  assert.match(report.renderable?.svgText || "", /fill="#ffcc00"/);
  assert.ok(
    report.warnings.some((entry) => entry.code === "ICON_SVG_MULTICOLOR_SKIP_CURRENTCOLOR")
  );
});

test("backend rejects unsafe, unsupported, unresolved and visually empty SVG", async () => {
  const cases = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h1v1z"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><foreignObject width="10" height="10"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path onclick="alert(1)" d="M0 0h2v2z"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><use href="https://evil.test/a.svg#x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><use href="#missing"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="20" height="20" fill="none" stroke="none"/></svg>',
  ];
  const reports = await Promise.all(cases.map((svgText) => inspect(svgText)));
  for (const report of reports) {
    assert.equal(report.status, "rejected");
    assert.equal(report.renderable, null);
    assert.ok(report.errors.length > 0);
  }
});

test("activation enforcement cannot turn rejected reports active or restore before revalidation", () => {
  const processorSource = readFileSync(
    new URL("./src/iconCatalog/processor.ts", import.meta.url),
    "utf8"
  );
  const serviceSource = readFileSync(
    new URL("./src/iconCatalog/service.ts", import.meta.url),
    "utf8"
  );
  assert.match(processorSource, /if \(report\.status === "rejected"\) return "rejected"/);
  assert.doesNotMatch(processorSource, /ENFORCEMENT === "observe"\) return "active"/);
  assert.ok(
    serviceSource.indexOf("force: true") <
      serviceSource.indexOf("await restoreIconFromArchived({ iconId, uid })")
  );
});
