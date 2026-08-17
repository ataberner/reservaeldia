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

test("backend normalizes the real love-svgrepo-com metadata and simple class-style pattern", async () => {
  const svgText = [
    '<svg version="1.1" id="designs" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" xml:space="preserve">',
    '<style type="text/css">.sketchy_een{fill:#111918;}</style>',
    '<path class="sketchy_een" d="M2 2h28v28H2z"/>',
    '</svg>',
  ].join("");
  const report = await inspect(svgText, "love-svgrepo-com.svg");

  assert.equal(report.status, "warning");
  assert.deepEqual(report.errors, []);
  assert.ok(report.renderable);
  assert.match(report.renderable.svgText, /<path[^>]*fill="#111918"/);
  assert.doesNotMatch(report.renderable.svgText, /\sversion=|\sxml:space=|<style|\sclass=/);
  assert.ok(report.checks.normalizationApplied.includes("remove-inert-svg-metadata"));
  assert.ok(report.checks.normalizationApplied.includes("inline-simple-class-styles"));
  assert.ok(report.checks.normalizationApplied.includes("remove-materialized-svg-classes"));
  assert.ok(report.warnings.some((entry) => entry.code === "ICON_SVG_FIXED_COLOR"));
});

test("backend canonicalizes an Inkscape-prefixed SVG and removes only inert editor metadata", async () => {
  const svgText = [
    '<svg:svg xmlns:svg="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" sodipodi:docname="heart.eps" viewBox="0 0 24 24">',
    '<sodipodi:namedview><inkscape:page/></sodipodi:namedview>',
    '<svg:g inkscape:groupmode="layer" inkscape:label="Layer 1" transform="translate(1 1)">',
    '<svg:path fill="#123456" d="M1 1h20v20H1z"/>',
    '</svg:g>',
    '</svg:svg>',
  ].join("");
  const report = await inspect(svgText, "inkscape-prefixed.svg");

  assert.equal(report.status, "warning");
  assert.deepEqual(report.errors, []);
  assert.ok(report.renderable);
  assert.equal(report.renderable.geometryCount, 1);
  assert.match(report.renderable.svgText, /^<svg\b/);
  assert.match(report.renderable.svgText, /<g[^>]*transform="translate\(1 1\)"/);
  assert.match(report.renderable.svgText, /<path[^>]*fill="#123456"/);
  assert.doesNotMatch(
    report.renderable.svgText,
    /svg:|sodipodi:|inkscape:|namedview|groupmode|docname|label=/
  );
  assert.ok(
    report.checks.normalizationApplied.includes("canonicalize-svg-namespace-prefix")
  );
  assert.ok(report.checks.normalizationApplied.includes("remove-inkscape-metadata"));
  assert.ok(report.warnings.some((entry) => entry.code === "ICON_SVG_FIXED_COLOR"));
});

test("backend removes inert Sketch metadata and unreferenced duplicate export ids", async () => {
  const svgText = [
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" viewBox="0 0 60 60">',
    '<g id="Page-1" sketch:type="MSPage"><g id="Holidays" sketch:type="MSLayerGroup" transform="translate(2 2)">',
    '<g id="Wedding" sketch:type="MSShapeGroup">',
    '<path id="Oval-1690" fill="#f2b632" d="M2 2h16v16H2z"/>',
    '<path id="Oval-1690" fill="#e05038" d="M20 2h16v16H20z"/>',
    '<path id="Oval-1690" fill="#334d5c" d="M38 2h16v16H38z"/>',
    '</g></g></g></svg>',
  ].join("");
  const report = await inspect(svgText, "wedding-ring1.svg");

  assert.equal(report.status, "warning");
  assert.deepEqual(report.errors, []);
  assert.ok(report.renderable);
  assert.equal(report.renderable.geometryCount, 3);
  assert.doesNotMatch(report.renderable.svgText, /sketch:|xmlns:sketch|Oval-1690/);
  assert.ok(report.checks.normalizationApplied.includes("remove-sketch-metadata"));
  assert.ok(
    report.checks.normalizationApplied.includes("remove-unreferenced-duplicate-svg-ids")
  );
  assert.ok(report.warnings.some((entry) => entry.code === "ICON_SVG_FIXED_COLOR"));
});

test("backend keeps rejecting unknown Sketch metadata and referenced duplicate ids", async () => {
  const unknownSketchMetadata = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" viewBox="0 0 24 24"><g sketch:unknown="value"><path d="M0 0h24v24H0z"/></g></svg>'
  );
  assert.equal(unknownSketchMetadata.status, "rejected");
  assert.ok(
    unknownSketchMetadata.errors.some(
      (entry) => entry.code === "ICON_SVG_UNSUPPORTED_ATTRIBUTE"
    )
  );

  const referencedDuplicate = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><path id="tile" d="M0 0h6v6H0z"/></defs><use href="#tile"/><path id="tile" d="M8 8h8v8H8z"/></svg>'
  );
  assert.equal(referencedDuplicate.status, "rejected");
  assert.equal(referencedDuplicate.renderable, null);
  assert.ok(
    referencedDuplicate.errors.some((entry) => entry.code === "ICON_SVG_INVALID_ID")
  );
  assert.ok(
    !referencedDuplicate.checks.normalizationApplied.includes(
      "remove-unreferenced-duplicate-svg-ids"
    )
  );
});

test("backend unwraps the safe Adobe Illustrator switch export and removes editor metadata", async () => {
  const svgText = [
    '<svg xmlns:x="http://ns.adobe.com/Extensibility/1.0/" xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" xmlns:graph="http://ns.adobe.com/Graphs/1.0/" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0" x="0px" y="0px" viewBox="0 0 100 125" enable-background="new 0 0 100 100" xml:space="preserve">',
    '<switch>',
    '<foreignObject requiredExtensions="http://ns.adobe.com/AdobeIllustrator/10.0/" x="0" y="0" width="1" height="1"/>',
    '<g i:extraneous="self"><path fill="#000000" d="M10 10h80v80H10z"/></g>',
    '</switch>',
    '<text x="0" y="115">Created by Author</text>',
    '<text x="0" y="120">from the Noun Project</text>',
    '</svg>',
  ].join("");
  const report = await inspect(svgText, "dresscode1.svg");

  assert.equal(report.status, "warning");
  assert.deepEqual(report.errors, []);
  assert.ok(report.renderable);
  assert.equal(report.renderable.geometryCount, 1);
  assert.match(report.renderable.svgText, /<g><path[^>]*fill="#000000"/);
  assert.doesNotMatch(
    report.renderable.svgText,
    /<switch|<foreignObject|<text|xmlns:(?:x|i|graph)=|i:extraneous/
  );
  assert.ok(
    report.checks.normalizationApplied.includes("unwrap-adobe-illustrator-switch")
  );
  assert.ok(
    report.checks.normalizationApplied.includes("remove-adobe-illustrator-metadata")
  );
  assert.ok(report.warnings.some((entry) => entry.code === "ICON_SVG_TEXT_REMOVED"));
  assert.ok(report.warnings.some((entry) => entry.code === "ICON_SVG_FIXED_COLOR"));
});

test("backend keeps rejecting ambiguous or non-Adobe switch and foreignObject content", async () => {
  const illustratorNamespace = "http://ns.adobe.com/AdobeIllustrator/10.0/";
  const cases = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="${illustratorNamespace}" viewBox="0 0 24 24"><switch><foreignObject requiredExtensions="${illustratorNamespace}" width="1" height="1"/><g i:extraneous="self"><path d="M0 0h12v24H0z"/></g><g><path d="M12 0h12v24H12z"/></g></switch></svg>`,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><switch><foreignObject requiredExtensions="https://example.test/custom" width="1" height="1"/><g><path d="M0 0h24v24H0z"/></g></switch></svg>',
  ];
  const reports = await Promise.all(cases.map((svgText) => inspect(svgText)));

  for (const report of reports) {
    assert.equal(report.status, "rejected");
    assert.equal(report.renderable, null);
    assert.ok(
      report.errors.some((entry) => entry.code === "ICON_SVG_UNSUPPORTED_ELEMENT")
    );
  }
});

test("backend removes exported attribution text and preserves the remaining drawing", async () => {
  const svgText = [
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" x="0px" y="0px" viewBox="0 0 32 40" style="enable-background:new 0 0 32 32;" xml:space="preserve">',
    '<path d="M4 4h24v24H4z"/>',
    '<text x="0" y="47" fill="#000" font-size="5px" font-family="Arial">Created by Author</text>',
    '<text x="0" y="52" fill="#000" font-size="5px" font-family="Arial">from the Noun Project</text>',
    '</svg>',
  ].join("");
  const report = await inspect(svgText, "exported-attribution.svg");

  assert.equal(report.status, "warning");
  assert.deepEqual(report.errors, []);
  assert.ok(report.renderable);
  assert.equal(report.renderable.geometryCount, 1);
  assert.match(report.renderable.svgText, /<path\b/);
  assert.match(report.renderable.svgText, /enable-background="new 0 0 32 32"/);
  assert.doesNotMatch(report.renderable.svgText, /<text\b|Created by|Noun Project/);
  assert.doesNotMatch(report.renderable.svgText, /\sx="0px"|\sy="0px"/);
  assert.ok(report.checks.normalizationApplied.includes("remove-svg-text"));
  assert.ok(report.checks.normalizationApplied.includes("remove-inert-svg-metadata"));
  assert.ok(report.warnings.some((entry) => entry.code === "ICON_SVG_TEXT_REMOVED"));
});

test("backend removes inert data-name export labels without dropping geometry", async () => {
  const report = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" data-name="Mesa de trabajo 7" viewBox="0 0 40 60"><g data-name="Artwork"><path fill="#123456" d="M5 5h30v40H5z"/></g><text x="0" y="55">Credit</text></svg>',
    "data-name-export.svg"
  );

  assert.equal(report.status, "warning");
  assert.deepEqual(report.errors, []);
  assert.ok(report.renderable);
  assert.equal(report.renderable.geometryCount, 1);
  assert.match(report.renderable.svgText, /<g><path[^>]*fill="#123456"/);
  assert.doesNotMatch(report.renderable.svgText, /data-name=|<text/);
  assert.ok(
    report.checks.normalizationApplied.includes("remove-inert-svg-element-metadata")
  );
});

test("backend does not hide CSS that depends on data-name while removing the label", async () => {
  const report = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>[data-name="art"]{fill:#f00}</style><path data-name="art" d="M0 0h24v24H0z"/></svg>',
    "data-name-dependent-style.svg"
  );

  assert.equal(report.status, "rejected");
  assert.equal(report.renderable, null);
  assert.ok(
    report.errors.some((entry) => entry.code === "ICON_SVG_UNSUPPORTED_STYLE")
  );
});

test("backend removes text-only CSS but keeps and materializes styles used by geometry", async () => {
  const svgText = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50000 62500" style="shape-rendering:geometricPrecision;text-rendering:geometricPrecision;image-rendering:optimizeQuality">',
    '<defs><style type="text/css">',
    '.fil0{fill:#123456;fill-rule:nonzero}',
    '.credit{font-family:Arial;font-size:5px}',
    'text{font-weight:bold}',
    '</style></defs>',
    '<path class="fil0" d="M5000 5000h40000v40000H5000z"/>',
    '<text class="credit" x="0" y="50015">Created by Author</text>',
    '</svg>',
  ].join("");
  const report = await inspect(svgText, "styled-attribution.svg");

  assert.equal(report.status, "warning");
  assert.deepEqual(report.errors, []);
  assert.ok(report.renderable);
  assert.match(report.renderable.svgText, /<path[^>]*fill="#123456"/);
  assert.match(report.renderable.svgText, /shape-rendering="geometricPrecision"/);
  assert.match(report.renderable.svgText, /text-rendering="geometricPrecision"/);
  assert.match(report.renderable.svgText, /image-rendering="optimizeQuality"/);
  assert.doesNotMatch(report.renderable.svgText, /<style|<text|\sclass=/);
  assert.ok(report.checks.normalizationApplied.includes("remove-svg-text-styles"));
  assert.ok(report.checks.normalizationApplied.includes("inline-simple-class-styles"));
});

test("text removal cannot make an empty icon active or hide styles that affect retained geometry", async () => {
  const textOnly = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="1" y="12">Only text</text></svg>'
  );
  assert.equal(textOnly.status, "rejected");
  assert.ok(textOnly.errors.some((entry) => entry.code === "ICON_SVG_EMPTY_GRAPHICS"));
  assert.equal(textOnly.renderable, null);

  const sharedUnsupportedStyle = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>.shared{font-family:Arial}</style><path class="shared" d="M0 0h24v24H0z"/><text class="shared" x="0" y="10">Credit</text></svg>'
  );
  assert.equal(sharedUnsupportedStyle.status, "rejected");
  assert.ok(
    sharedUnsupportedStyle.errors.some(
      (entry) => entry.code === "ICON_SVG_UNSUPPORTED_STYLE"
    )
  );
  assert.equal(sharedUnsupportedStyle.renderable, null);
});

test("backend does not trust arbitrary namespace prefixes or strip unsupported Inkscape constructs", async () => {
  const wrongNamespace = await inspect(
    '<svg:svg xmlns:svg="https://example.test/not-svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg:svg>'
  );
  assert.equal(wrongNamespace.status, "rejected");
  assert.ok(wrongNamespace.errors.some((entry) => entry.code === "ICON_SVG_MISSING_ROOT"));
  assert.equal(wrongNamespace.renderable, null);

  const unsupportedInkscape = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 24 24"><inkscape:path-effect effect="roughen"/><path fill="#000" d="M0 0h24v24H0z"/></svg>'
  );
  assert.equal(unsupportedInkscape.status, "rejected");
  assert.ok(
    unsupportedInkscape.errors.some(
      (entry) => entry.code === "ICON_SVG_UNSUPPORTED_ELEMENT"
    )
  );
  assert.equal(unsupportedInkscape.renderable, null);
});

test("simple class CSS preserves cascade order, inline precedence and multicolor paints", async () => {
  const cascaded = await inspect(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>.base{fill:#f00;stroke:#0f0}.override{fill:#00f}</style><path class="base override" style="stroke:#000" d="M2 2h20v20H2z"/></svg>'
  );
  assert.notEqual(cascaded.status, "rejected");
  assert.match(cascaded.renderable?.svgText || "", /fill="#00f"/);
  assert.match(cascaded.renderable?.svgText || "", /stroke="#000"/);
  assert.doesNotMatch(cascaded.renderable?.svgText || "", /<style|\sstyle=|\sclass=/);

  const multicolor = await inspectWithCurrentColorNormalization(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>.red,.also-red{fill:#f00}.blue{fill:#00f}</style><path class="red" d="M0 0h12v24H0z"/><path class="blue" d="M12 0h12v24H12z"/></svg>'
  );
  assert.notEqual(multicolor.status, "rejected");
  assert.match(multicolor.renderable?.svgText || "", /fill="#f00"/);
  assert.match(multicolor.renderable?.svgText || "", /fill="#00f"/);
  assert.ok(
    multicolor.warnings.some((entry) => entry.code === "ICON_SVG_MULTICOLOR_SKIP_CURRENTCOLOR")
  );
});

test("complex or unsafe stylesheets remain rejected instead of being partially stripped", async () => {
  const styles = [
    '.st0 path{fill:#000}',
    '.st0:hover{fill:#000}',
    '@import url("https://evil.test/icon.css"); .st0{fill:#000}',
    '.st0{filter:blur(2px)}',
    '.st0{fill:#000 !important}',
    '.st0{fill:url(https://evil.test/paint.svg)}',
  ];
  const reports = await Promise.all(
    styles.map((styleText) => inspect(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>${styleText}</style><path class="st0" d="M0 0h24v24H0z"/></svg>`
    ))
  );
  for (const report of reports) {
    assert.equal(report.status, "rejected");
    assert.equal(report.renderable, null);
    assert.ok(report.errors.length > 0);
  }
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
  assert.match(processorSource, /"ICON_SVG_FIXED_COLOR"/);
  assert.match(processorSource, /"ICON_SVG_MULTICOLOR_SKIP_CURRENTCOLOR"/);
  assert.match(processorSource, /"ICON_SVG_TEXT_REMOVED"/);
  assert.match(processorSource, /hasStrictBlockingWarning/);
  assert.doesNotMatch(processorSource, /ENFORCEMENT === "observe"\) return "active"/);
  assert.ok(
    serviceSource.indexOf("force: true") <
      serviceSource.indexOf("await restoreIconFromArchived({ iconId, uid })")
  );
});
