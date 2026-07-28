import test from "node:test";
import assert from "node:assert/strict";

import generarHTMLDesdeSeccionesModule from "./lib/utils/generarHTMLDesdeSecciones.js";
import sectionDividerRuntime from "../shared/sectionDividerPresets.cjs";

const { generarHTMLDesdeSecciones } = generarHTMLDesdeSeccionesModule;
const { SECTION_DIVIDER_PRESETS } = sectionDividerRuntime;

function renderSections(divisores, { preview = false } = {}) {
  return generarHTMLDesdeSecciones(
    [
      {
        id: "first",
        orden: 0,
        altura: 600,
        altoModo: "fijo",
        fondo: "#f6d1e7",
        divisores,
      },
      {
        id: "second",
        orden: 1,
        altura: 600,
        altoModo: "fijo",
        fondo: "#26356f",
      },
    ],
    [
      {
        id: "title",
        tipo: "texto",
        seccionId: "first",
        x: 120,
        y: 180,
        width: 300,
        height: 80,
        texto: "Reserva el dia",
      },
    ],
    null,
    { isPreview: preview }
  );
}

function renderSharedBoundary({
  presetId,
  firstColor,
  secondColor,
  preview = false,
}) {
  return generarHTMLDesdeSecciones(
    [
      {
        id: "first",
        orden: 0,
        altura: 600,
        altoModo: "fijo",
        fondo: firstColor,
        divisores: {
          top: "none",
          bottom: presetId,
          height: 84,
        },
      },
      {
        id: "second",
        orden: 1,
        altura: 600,
        altoModo: "fijo",
        fondo: secondColor,
        divisores: {
          top: presetId,
          bottom: "none",
          height: 68,
        },
      },
    ],
    [],
    null,
    { isPreview: preview }
  );
}

function collectDividerSnapshot(html) {
  return Array.from(
    String(html).matchAll(
      /data-section-divider-slot="([^"]+)" data-section-divider-preset="([^"]+)"[\s\S]*?<path d="([^"]+)"/g
    )
  ).map((match) => ({
    slot: match[1],
    preset: match[2],
    path: match[3],
  }));
}

test("published renderer emits every shared wave preset", () => {
  SECTION_DIVIDER_PRESETS.filter((preset) => preset.id !== "none").forEach(
    (preset) => {
      const html = renderSections({
        top: preset.id,
        bottom: preset.id,
        height: 84,
      });
      const snapshot = collectDividerSnapshot(html);

      assert.deepEqual(
        snapshot.map((entry) => entry.preset),
        [preset.id, preset.id]
      );
      assert.deepEqual(
        snapshot.map((entry) => entry.path),
        [preset.path, preset.path]
      );
    }
  );
});

test("none keeps legacy output free of divider layers", () => {
  const legacyHtml = renderSections(undefined);
  const explicitNoneHtml = renderSections({
    top: "none",
    bottom: "none",
    height: 72,
  });

  assert.doesNotMatch(legacyHtml, /data-section-divider-slot=/);
  assert.doesNotMatch(explicitNoneHtml, /data-section-divider-slot=/);
});

test("preview and publication share divider geometry, colors and responsive scale", () => {
  const divisores = {
    top: "wave-soft",
    bottom: "wave-asymmetric",
    height: 96,
  };
  const previewHtml = renderSections(divisores, { preview: true });
  const publishHtml = renderSections(divisores);

  assert.deepEqual(
    collectDividerSnapshot(previewHtml),
    collectDividerSnapshot(publishHtml)
  );
  assert.match(previewHtml, /color:#ffffff/);
  assert.match(previewHtml, /color:#26356f/);
  assert.match(
    previewHtml,
    /height: calc\(var\(--sfinal, var\(--sx, 1\)\) \* var\(--section-divider-height, 72\) \* 1px\)/
  );
});

test("every wave preset keeps one owner at a shared boundary for equal and contrasting backgrounds", () => {
  for (const preset of SECTION_DIVIDER_PRESETS.filter(
    (entry) => entry.id !== "none"
  )) {
    for (const colors of [
      ["#26356f", "#26356f"],
      ["#f6d1e7", "#26356f"],
    ]) {
      const previewHtml = renderSharedBoundary({
        presetId: preset.id,
        firstColor: colors[0],
        secondColor: colors[1],
        preview: true,
      });
      const publishHtml = renderSharedBoundary({
        presetId: preset.id,
        firstColor: colors[0],
        secondColor: colors[1],
      });
      const previewSnapshot = collectDividerSnapshot(previewHtml);
      const publishSnapshot = collectDividerSnapshot(publishHtml);

      assert.deepEqual(previewSnapshot, publishSnapshot);
      assert.deepEqual(previewSnapshot, [
        {
          slot: "top",
          preset: preset.id,
          path: preset.path,
        },
      ]);
      assert.doesNotMatch(
        previewHtml,
        new RegExp(
          `data-section-divider-slot="bottom" data-section-divider-preset="${preset.id}"`
        )
      );
      assert.match(
        previewHtml,
        new RegExp(
          `data-section-divider-slot="top" data-section-divider-preset="${preset.id}"[^>]*style="[^"]*color:${colors[0]}`
        )
      );
    }
  }
});
