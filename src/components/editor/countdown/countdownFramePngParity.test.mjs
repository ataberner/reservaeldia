import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCountdownCanvasPatchFromPreset } from "../../../domain/countdownPresets/toCanvasPatch.js";
import { estimateCountdownUnitHeight } from "../../../domain/countdownPresets/renderModel.js";

const konvaSource = readFileSync(
  new URL("./CountdownKonva.jsx", import.meta.url),
  "utf8"
);
const previewSource = readFileSync(
  new URL("./CountdownPreview.jsx", import.meta.url),
  "utf8"
);
const livePreviewSource = readFileSync(
  new URL("../../admin/countdown/CountdownPresetLivePreview.jsx", import.meta.url),
  "utf8"
);
const renderModelSource = readFileSync(
  new URL("../../../domain/countdownPresets/renderModel.js", import.meta.url),
  "utf8"
);
const formSectionsSource = readFileSync(
  new URL("../../admin/countdown/CountdownPresetFormSections.jsx", import.meta.url),
  "utf8"
);
const publishSource = readFileSync(
  new URL("../../../../functions/src/utils/generarHTMLDesdeObjetos.ts", import.meta.url),
  "utf8"
);
const insertDefaultsSource = readFileSync(
  new URL("../events/computeInsertDefaults.js", import.meta.url),
  "utf8"
);
const editorEventsSource = readFileSync(
  new URL("../events/useEditorEvents.js", import.meta.url),
  "utf8"
);
const applyToExistingSource = readFileSync(
  new URL(
    "../../../domain/countdownPresets/applyToExisting.js",
    import.meta.url
  ),
  "utf8"
);
const transformerSource = readFileSync(
  new URL(
    "../textSystem/render/konva/SelectionTransformer.jsx",
    import.meta.url
  ),
  "utf8"
);

test("canvas patch materializes PNG metadata without changing schema 2", () => {
  const patch = buildCountdownCanvasPatchFromPreset({
    presetId: "floral",
    activeVersion: 3,
    svgRef: {
      type: "png",
      mimeType: "image/png",
      downloadUrl: "https://cdn.example.com/floral.png",
      width: 1600,
      height: 1600,
      colorMode: "currentColor",
    },
  });
  assert.equal(patch.countdownSchemaVersion, 2);
  assert.equal(patch.frameSvgUrl, "https://cdn.example.com/floral.png");
  assert.equal(patch.frameAssetType, "png");
  assert.equal(patch.frameMimeType, "image/png");
  assert.equal(patch.frameIntrinsicWidth, 1600);
  assert.equal(patch.frameColorMode, "fixed");
});

test("old refs remain SVG/currentColor and every interactive surface protects PNG ratio", () => {
  const legacyPatch = buildCountdownCanvasPatchFromPreset({
    presetId: "legacy-svg",
    activeVersion: 1,
    svgRef: {
      storagePath: "assets/countdown/frame.svg",
      downloadUrl: "https://cdn.example.com/frame.svg",
      colorMode: "currentColor",
    },
  });
  assert.equal(legacyPatch.frameAssetType, "svg");
  assert.equal(legacyPatch.frameMimeType, "image/svg+xml");
  assert.equal(legacyPatch.frameColorMode, "currentColor");

  assert.match(konvaSource, /resolveContainedCountdownFrameRect/);
  assert.match(konvaSource, /!isPngFrame/);
  assert.match(previewSource, /isPngFrame \? "object-contain" : "object-fill"/);
  assert.match(livePreviewSource, /isPngFrame \? "object-contain" : "object-fill"/);
  assert.match(renderModelSource, /frameImageUrl/);
  assert.match(renderModelSource, /drawImageContain/);
});

test("frame scale is independent from content metrics and materializes in schema 2", () => {
  const patch = buildCountdownCanvasPatchFromPreset({
    presetId: "floral-scale",
    activeVersion: 4,
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: ["days", "hours"],
      framePadding: 10,
      frameScale: 1.5,
    },
    tamanoBase: 320,
    svgRef: {
      type: "png",
      mimeType: "image/png",
      downloadUrl: "https://cdn.example.com/floral.png",
    },
  });
  assert.equal(patch.countdownSchemaVersion, 2);
  assert.equal(patch.frameScale, 1.5);

  const oldPatch = buildCountdownCanvasPatchFromPreset({
    presetId: "old-schema-2",
    activeVersion: 1,
    layout: {},
  });
  assert.equal(oldPatch.frameScale, 1);

  assert.notEqual(
    estimateCountdownUnitHeight({
      tamanoBase: 320,
      distribution: "centered",
      unitsCount: 2,
    }),
    estimateCountdownUnitHeight({
      tamanoBase: 640,
      distribution: "centered",
      unitsCount: 2,
    })
  );
  assert.equal(patch.fontSize, 28);
  assert.equal(patch.labelSize, 12);
});

test("schema 2 materializes 200%, 300%, 400% and 500% without resizing content", () => {
  const scales = [2, 3, 4, 5];
  const patches = scales.map((frameScale) =>
    buildCountdownCanvasPatchFromPreset({
      presetId: `floral-scale-${frameScale}`,
      activeVersion: 4,
      layout: {
        type: "singleFrame",
        distribution: "centered",
        visibleUnits: ["days", "hours"],
        framePadding: 10,
        frameScale,
      },
      tipografia: {
        numberSize: 34,
        labelSize: 13,
      },
      tamanoBase: 320,
      svgRef: {
        type: "png",
        mimeType: "image/png",
        downloadUrl: "https://cdn.example.com/floral.png",
      },
    })
  );

  assert.deepEqual(
    patches.map((patch) => patch.frameScale),
    scales
  );
  assert.deepEqual(
    patches.map((patch) => [patch.fontSize, patch.labelSize, patch.chipWidth]),
    patches.map(() => [
      patches[0].fontSize,
      patches[0].labelSize,
      patches[0].chipWidth,
    ])
  );
});

test("existing size fields change content or its box but never become frame-only scale", () => {
  const base = {
    presetId: "field-effects",
    activeVersion: 1,
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: ["days", "hours"],
      framePadding: 10,
      chipWidth: 90,
    },
    tamanoBase: 320,
  };
  const original = buildCountdownCanvasPatchFromPreset(base);
  const largerPadding = buildCountdownCanvasPatchFromPreset({
    ...base,
    layout: { ...base.layout, framePadding: 30 },
  });
  const widerChips = buildCountdownCanvasPatchFromPreset({
    ...base,
    layout: { ...base.layout, chipWidth: 160 },
  });
  const largerBase = buildCountdownCanvasPatchFromPreset({
    ...base,
    layout: { ...base.layout, chipWidth: undefined },
    tamanoBase: 640,
  });

  assert.deepEqual(
    [original.frameScale, largerPadding.frameScale, widerChips.frameScale, largerBase.frameScale],
    [1, 1, 1, 1]
  );
  assert.notEqual(largerPadding.paddingX, original.paddingX);
  assert.notEqual(largerPadding.paddingY, original.paddingY);
  assert.notEqual(widerChips.chipWidth, original.chipWidth);
  assert.notEqual(largerBase.chipWidth, original.chipWidth);
});

test("builder, canvas, preview, publication and thumbnails share centered frame scaling", () => {
  assert.match(formSectionsSource, /Tamaño del frame/);
  assert.match(formSectionsSource, /type="range"/);
  assert.match(formSectionsSource, /Restablecer/);
  assert.match(formSectionsSource, /formState\.svgAsset \? \(/);
  assert.match(livePreviewSource, /resolveCountdownFrameVisualBounds/);
  assert.match(livePreviewSource, /transform: `scale\(\$\{frameScale\}\)`/);
  assert.match(konvaSource, /resolveCenteredScaledFrameRect/);
  assert.match(previewSource, /resolveCountdownFrameVisualBounds/);
  assert.match(previewSource, /transform: `scale\(\$\{frameScale\}\)`/);
  assert.match(renderModelSource, /resolveCenteredScaledFrameRect/);
  assert.match(publishSource, /normalizeCountdownFrameScale/);
  assert.match(publishSource, /data-frame-scale=/);
  assert.match(publishSource, /transform:scale\(/);
  assert.match(livePreviewSource, /viewportHeight \/ frameVisualBounds\.height/);
  assert.match(livePreviewSource, /constrainedTargetWidth \/ frameVisualBounds\.width/);
});

test("canvas selection uses visible content plus frame while resize keeps layout metrics", () => {
  assert.match(konvaSource, /resolveCountdownSelectionGeometry/);
  assert.match(konvaSource, /name="countdown-layout-metrics"/);
  assert.match(konvaSource, /x=\{interactiveBounds\.x\}/);
  assert.match(konvaSource, /width=\{interactiveBounds\.width\}/);
  assert.match(konvaSource, /countdownSchemaVersion \|\| 1/);
  assert.match(transformerSource, /\.countdown-layout-metrics/);
  assert.match(insertDefaultsSource, /resolveCountdownBoundsXWithinCanvas/);
  assert.match(insertDefaultsSource, /frameIntrinsicWidth/);
});

test("applying a preset recalculates stale countdown dimensions instead of preserving an oversized box", () => {
  assert.match(editorEventsSource, /applyCountdownPresetToExisting/);
  assert.match(applyToExistingSource, /x: currentCountdown\.x/);
  assert.match(applyToExistingSource, /y: currentCountdown\.y/);
  assert.match(
    applyToExistingSource,
    /preparedCountdown\.width,\s*currentCountdown\.width/
  );
  assert.match(
    applyToExistingSource,
    /preparedCountdown\.height,\s*currentCountdown\.height/
  );
});

test("PNG frame renderers never add a white decoration background", () => {
  assert.match(
    konvaSource,
    /isSchema2Countdown \? "transparent" : backgroundColor/
  );
  assert.match(previewSource, /isPngFrame \? "object-contain" : "object-fill"/);
  assert.match(
    publishSource,
    /object-fit:\$\{frameAssetType === "png" \? "contain" : "fill"\}/
  );
});
