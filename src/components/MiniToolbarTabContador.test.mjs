import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS,
  resolveCountdownSidebarPreviewFrameDimensions,
  resolveCountdownSidebarPreviewHeight,
  resolveCountdownSidebarPreviewLayout,
  resolveCountdownSidebarPreviewTransform,
} from "./countdownSidebarPreviewLayout.js";

const source = readFileSync(
  new URL("./MiniToolbarTabContador.jsx", import.meta.url),
  "utf8"
);
const rendererSource = readFileSync(
  new URL("./editor/countdown/CountdownPreview.jsx", import.meta.url),
  "utf8"
);
const layoutHelperSource = readFileSync(
  new URL("./countdownSidebarPreviewLayout.js", import.meta.url),
  "utf8"
);

test("countdown tab reuses the existing accessible activation switch", () => {
  assert.match(source, /MiniToolbarTabRegalos\.module\.css/);
  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked=\{isCountdownActive\}/);
  assert.match(source, /cambios:\s*\{\s*mostrarCuentaRegresiva\s*\}/s);
  assert.match(source, /motion-reduce:transition-none/);
});

test("countdown tab is only the activation switch and preset selector", () => {
  assert.equal(source.match(/<section\b/g)?.length, 2);
  assert.match(source, /countdownPresets\.map\(\(p\) =>/);
  assert.match(source, /aria-pressed=\{isSelected\}/);
  assert.match(
    source,
    /new CustomEvent\("insertar-elemento"[\s\S]*presetId:\s*p\.id[\s\S]*presetProps:\s*presetPropsSafe/
  );
  assert.doesNotMatch(
    source,
    /UnifiedColorPicker|patchSelectedCountdown|selectedUI|canEditFrameSvgColor|countdownSel/
  );
  assert.doesNotMatch(
    source,
    /type="range"|Separacion entre chips|Color frame SVG|Fondo chip|Borde chip/
  );
});

test("countdown tab reads event details without keeping an editable date", () => {
  assert.match(source, /resolveEventDateSidebarBinding/);
  assert.match(source, /resolveEventTimesFromAuthoring/);
  assert.match(source, /buildCountdownTargetIsoFromLocalParts/);
  assert.doesNotMatch(source, /type="datetime-local"/);
  assert.doesNotMatch(source, />\s*Fecha del evento\s*</);
  assert.doesNotMatch(source, /setFechaEventoStr|fechaStrToISO/);
});

test("countdown catalog loading uses a content-shaped accessible skeleton", () => {
  assert.match(source, /function CountdownPresetCatalogSkeleton\(\)/);
  assert.match(source, /aria-label="Cargando presets de contador"/);
  assert.match(source, /aria-busy="true"/);
  assert.match(source, /Array\.from\(\{ length: 3 \}\)/);
  assert.match(source, /Array\.from\(\{ length: 4 \}\)/);
  assert.match(source, /motion-reduce:animate-none/);
  assert.match(
    source,
    /loadingCountdownPresets\s*&&\s*\(\s*<CountdownPresetCatalogSkeleton\s*\/>/
  );
  assert.doesNotMatch(source, />\s*Cargando presets\.\.\.\s*</);
});

test("countdown preset cards use adaptive visual geometry without changing selection states", () => {
  assert.doesNotMatch(source, /h-\[96px\]/);
  assert.doesNotMatch(source, /h-\[clamp\(132px,42vw,168px\)\]/);
  assert.match(source, /resolveCountdownSidebarPreviewHeight/);
  assert.match(source, /resolveCountdownSidebarPreviewTransform/);
  assert.match(source, /data-countdown-preview-viewport/);
  assert.match(source, /aspectRatio:/);
  assert.match(source, /transformOrigin:\s*"center"/);
  assert.match(source, /translate3d\([^)]*\) scale\(/);
  assert.match(source, /previewProps=\{presetPresentation\.previewProps\}/);
  assert.match(source, /className="h-full w-full object-contain"/);
  assert.match(source, /aria-pressed=\{isSelected\}/);
  assert.match(source, /<CountdownPresetThumbnail[\s\S]*<div className="mt-2 min-w-0">/);
});

const BASE_V2_PRESET = Object.freeze({
  countdownSchemaVersion: 2,
  tamanoBase: 320,
  layoutType: "singleFrame",
  visibleUnits: ["days", "hours", "minutes", "seconds"],
  gap: 8,
  framePadding: 0,
  frameScale: 1,
  chipWidth: 72,
  paddingX: 5,
  paddingY: 4,
  fontSize: 28,
  labelSize: 12,
  showLabels: true,
  boxRadius: 0,
});

const SHAPE_PRESETS = Object.freeze({
  circularFrame: {
    ...BASE_V2_PRESET,
    distribution: "centered",
    framePadding: 10,
    frameScale: 5,
    frameSvgUrl: "/frame.png",
    frameAssetType: "png",
    frameIntrinsicWidth: 800,
    frameIntrinsicHeight: 800,
  },
  vertical: {
    ...BASE_V2_PRESET,
    distribution: "vertical",
  },
  horizontal: {
    ...BASE_V2_PRESET,
    distribution: "centered",
  },
  compact: {
    ...BASE_V2_PRESET,
    distribution: "centered",
    visibleUnits: ["days", "hours"],
  },
});

test("adaptive height follows visual aspect ratio and respects common limits", () => {
  const availableWidth = 260;
  const heights = Object.fromEntries(
    Object.entries(SHAPE_PRESETS).map(([name, preset]) => {
      const layout = resolveCountdownSidebarPreviewLayout(preset);
      return [
        name,
        resolveCountdownSidebarPreviewHeight({ availableWidth, layout }),
      ];
    })
  );

  assert.equal(
    heights.horizontal,
    COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.min
  );
  assert.ok(heights.compact > heights.horizontal);
  assert.ok(heights.circularFrame > heights.compact);
  assert.equal(
    heights.vertical,
    COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.max
  );

  const extremeHorizontalHeight = resolveCountdownSidebarPreviewHeight({
    availableWidth: 320,
    layout: { viewportAspectRatio: 20 },
  });
  const extremeVerticalHeight = resolveCountdownSidebarPreviewHeight({
    availableWidth: 320,
    layout: { viewportAspectRatio: 0.1 },
  });
  assert.equal(
    extremeHorizontalHeight,
    COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.min
  );
  assert.equal(
    extremeVerticalHeight,
    COUNTDOWN_SIDEBAR_PREVIEW_HEIGHT_LIMITS.max
  );
});

test("maximum contain fit fills one axis without crop or deformation on desktop and mobile", () => {
  [240, 320].forEach((viewportWidth) => {
    Object.values(SHAPE_PRESETS).forEach((preset) => {
      const layout = resolveCountdownSidebarPreviewLayout(preset);
      const viewportHeight = resolveCountdownSidebarPreviewHeight({
        availableWidth: viewportWidth,
        layout,
      });
      const fit = resolveCountdownSidebarPreviewTransform({
        viewportWidth,
        viewportHeight,
        layout,
      });
      const expectedMaxWidth = viewportWidth * 0.95;
      const expectedMaxHeight = viewportHeight * 0.95;

      assert.ok(fit.renderedVisualWidth <= expectedMaxWidth + 1e-9);
      assert.ok(fit.renderedVisualHeight <= expectedMaxHeight + 1e-9);
      assert.ok(
        Math.abs(fit.renderedVisualWidth - expectedMaxWidth) < 1e-9 ||
          Math.abs(fit.renderedVisualHeight - expectedMaxHeight) < 1e-9
      );
      assert.ok(
        Math.abs(
          fit.renderedVisualWidth / fit.renderedVisualHeight -
            layout.visualBounds.width / layout.visualBounds.height
        ) < 1e-12
      );
    });
  });
});

test("contained intrinsic frames ignore oversized empty renderer bounds", () => {
  const layout = resolveCountdownSidebarPreviewLayout(
    SHAPE_PRESETS.circularFrame
  );
  const viewportWidth = 260;
  const viewportHeight = resolveCountdownSidebarPreviewHeight({
    availableWidth: viewportWidth,
    layout,
  });
  const fit = resolveCountdownSidebarPreviewTransform({
    viewportWidth,
    viewportHeight,
    layout,
  });

  assert.ok(layout.fullBounds.width > layout.visualBounds.width * 3);
  assert.ok(fit.zoom > 3);
  assert.ok(fit.renderedVisualWidth >= viewportWidth * 0.94);
});

test("async PNG load updates intrinsic geometry and keeps frame with countdown content", () => {
  const presetWithoutIntrinsicSize = {
    ...SHAPE_PRESETS.circularFrame,
    frameIntrinsicWidth: null,
    frameIntrinsicHeight: null,
  };
  const pendingFrame = resolveCountdownSidebarPreviewFrameDimensions({
    preset: presetWithoutIntrinsicSize,
  });
  const initialLayout = resolveCountdownSidebarPreviewLayout({
    ...presetWithoutIntrinsicSize,
    frameIntrinsicWidth: pendingFrame.width,
    frameIntrinsicHeight: pendingFrame.height,
  });

  assert.equal(pendingFrame.status, "pending");
  assert.equal(pendingFrame.width, 0);
  assert.equal(pendingFrame.height, 0);

  const loadedFrame = resolveCountdownSidebarPreviewFrameDimensions({
    preset: presetWithoutIntrinsicSize,
    loadedFrame: {
      source: "/frame.png",
      width: 1024,
      height: 1024,
    },
  });
  const loadedLayout = resolveCountdownSidebarPreviewLayout({
    ...presetWithoutIntrinsicSize,
    frameIntrinsicWidth: loadedFrame.width,
    frameIntrinsicHeight: loadedFrame.height,
  });

  assert.equal(loadedFrame.status, "loaded");
  assert.equal(loadedFrame.width, 1024);
  assert.equal(loadedFrame.height, 1024);
  assert.ok(initialLayout.visualAspectRatio > 3);
  assert.equal(loadedLayout.visualAspectRatio, 1);
  assert.notDeepEqual(loadedLayout.visualBounds, initialLayout.visualBounds);

  assert.match(source, /addEventListener\("load", handleFrameLoad, true\)/);
  assert.match(source, /frameIntrinsicWidth:\s*frameDimensions\.width/);
  assert.match(source, /\[&>div>div\]:!shrink-0/);
  assert.match(source, /<CountdownPreview[\s\S]*preset=\{preset\}/);
  assert.match(
    rendererSource,
    /isPngFrame \? "object-contain" : "object-fill"/
  );
  assert.match(
    rendererSource,
    /<div ref=\{wrapperRef\}[^>]*>\s*<div\s+ref=\{innerRef\}/s
  );
  assert.match(rendererSource, /className="relative z-\[1\]"/);
});

test("all countdown thumbnails use the same local preview surface", () => {
  const checkerboardRecipe =
    /linear-gradient\([^\n]+var\(--checker-2\)[^\n]+\)/g;

  assert.equal(source.match(checkerboardRecipe)?.length, 1);
  assert.match(source, /const COUNTDOWN_PREVIEW_SURFACE_CLASS_NAME\s*=/);
  assert.match(source, /const COUNTDOWN_PREVIEW_SURFACE_STYLE\s*=\s*Object\.freeze/);
  assert.match(source, /"--checker-1":\s*"#e1e4e8"/);
  assert.match(source, /"--checker-2":\s*"#c6cbd1"/);
  assert.match(source, /backgroundColor:\s*"var\(--checker-1\)"/);
  assert.match(source, /backgroundPosition:\s*"0 0, 0 8px, 8px -8px, -8px 0"/);
  assert.match(source, /backgroundSize:\s*"16px 16px"/);
  assert.match(source, /\.\.\.COUNTDOWN_PREVIEW_SURFACE_STYLE/);
  assert.doesNotMatch(source, /radial-gradient/);
  assert.match(source, /data-countdown-preview-surface="unified"/);
  assert.match(
    source,
    /data-countdown-preview-viewport=""[\s\S]*data-countdown-preview-surface="unified"[\s\S]*COUNTDOWN_PREVIEW_SURFACE_CLASS_NAME[\s\S]*<CountdownPreview/
  );
  assert.doesNotMatch(
    source,
    /resolveCountdownSidebarPreviewSurface|previewSurface\.mode|COUNTDOWN_PREVIEW_SURFACE_CLASSNAMES/
  );
  assert.doesNotMatch(
    layoutHelperSource,
    /parseLinearGradientColors|parseColorSamples|resolveRelativeLuminance|resolveContrastRatio|resolveCountdownSidebarPreviewSurface/
  );
});

test("unified preview surface preserves preset colors and supports PNG and SVG frames", () => {
  const presets = [
    {
      ...BASE_V2_PRESET,
      color: "#ffffff",
      labelColor: "rgb(248, 250, 252)",
      boxBg: "transparent",
      boxBorder: "transparent",
      frameSvgUrl: "/decorative-frame.png",
      frameAssetType: "png",
      frameIntrinsicWidth: 1024,
      frameIntrinsicHeight: 1024,
    },
    {
      ...BASE_V2_PRESET,
      color: "#111111",
      labelColor: "#692b9a",
      boxBg: "linear-gradient(135deg, #efdbff, #faf5ff)",
      boxBorder: "#773dbe",
      frameSvgUrl: "/decorative-frame.svg",
      frameAssetType: "svg",
      frameColorMode: "currentcolor",
      frameColor: "#ffffff",
    },
  ];
  const snapshots = structuredClone(presets);

  const layouts = presets.map((preset) =>
    resolveCountdownSidebarPreviewLayout(preset)
  );

  assert.deepEqual(presets, snapshots);
  layouts.forEach((layout) => {
    assert.ok(layout.visualBounds.width > 0);
    assert.ok(layout.visualBounds.height > 0);
  });
  assert.equal(presets[0].color, "#ffffff");
  assert.equal(presets[1].color, "#111111");
  assert.equal(presets[1].frameColor, "#ffffff");
  assert.match(source, /<CountdownPreview[\s\S]*preset=\{preset\}/);
  assert.doesNotMatch(source, /text-shadow|WebkitTextStroke|textStroke|filter:/);
});
