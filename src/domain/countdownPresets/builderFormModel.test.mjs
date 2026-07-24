import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountdownPresetFormState,
  compareCountdownVersionToDraft,
  markCountdownPresetFormSaved,
  replaceCountdownPresetFrameAsset,
  validateCountdownPresetFormState,
} from "./builderFormModel.js";

test("schema 2 form blocks empty name and empty visible units without normalizing them away", () => {
  const form = buildCountdownPresetFormState(null);
  form.config.layout.visibleUnits = [];
  const validation = validateCountdownPresetFormState(form);
  assert.equal(validation.valid, false);
  assert.equal(validation.firstField, "nombre");
  assert.match(validation.fieldErrors.nombre, /obligatorio/i);
  assert.match(validation.fieldErrors["layout.visibleUnits"], /al menos una/i);
  assert.deepEqual(form.config.layout.visibleUnits, []);
});

test("out-of-range values are actionable blockers while the normalized payload stays bounded", () => {
  const form = buildCountdownPresetFormState(null);
  form.nombre = "Fuera de rango";
  form.config.layout.gap = 99;
  form.config.tipografia.numberSize = 4;
  const validation = validateCountdownPresetFormState(form);
  assert.equal(validation.valid, false);
  assert.match(validation.fieldErrors["layout.gap"], /entre 0 y 48/i);
  assert.match(
    validation.fieldErrors["tipografia.numberSize"],
    /entre 10 y 120/i
  );
  assert.equal(validation.normalized.config.layout.gap, 48);
  assert.equal(validation.normalized.config.tipografia.numberSize, 10);
});

test("frame scale defaults old presets to 100% and rejects invalid UI values", () => {
  const legacySchema2Form = buildCountdownPresetFormState({
    nombre: "Schema 2 anterior",
    layout: {
      type: "singleFrame",
      distribution: "centered",
      visibleUnits: ["days", "hours"],
      gap: 8,
      framePadding: 10,
    },
  });
  assert.equal(legacySchema2Form.config.layout.frameScale, 1);

  for (const acceptedScale of [0.5, 1, 2, 3, 4, 5]) {
    legacySchema2Form.config.layout.frameScale = acceptedScale;
    const acceptedValidation =
      validateCountdownPresetFormState(legacySchema2Form);
    assert.equal(acceptedValidation.valid, true);
    assert.equal(
      acceptedValidation.normalized.config.layout.frameScale,
      acceptedScale
    );
  }

  legacySchema2Form.config.layout.frameScale = 5.5;
  let validation = validateCountdownPresetFormState(legacySchema2Form);
  assert.equal(validation.valid, false);
  assert.match(
    validation.fieldErrors["layout.frameScale"],
    /entre 0\.5 y 5/i
  );
  assert.equal(validation.normalized.config.layout.frameScale, 5);

  legacySchema2Form.config.layout.frameScale = 0.45;
  validation = validateCountdownPresetFormState(legacySchema2Form);
  assert.equal(validation.valid, false);
  assert.match(
    validation.fieldErrors["layout.frameScale"],
    /entre 0\.5 y 5/i
  );
  assert.equal(validation.normalized.config.layout.frameScale, 0.5);

  legacySchema2Form.config.layout.frameScale = Number.NaN;
  validation = validateCountdownPresetFormState(legacySchema2Form);
  assert.equal(validation.valid, false);
  assert.match(
    validation.fieldErrors["layout.frameScale"],
    /debe ser un número/i
  );
});

test("invalid SVG reports the inspection reason and preserves the local asset", () => {
  const form = buildCountdownPresetFormState(null);
  form.nombre = "SVG inválido";
  form.svgAsset = {
    valid: false,
    fileName: "unsafe.svg",
    svgText: "<svg><script /></svg>",
    isDirty: true,
    inspection: {
      criticalErrors: ["El SVG contiene <script>."],
      warnings: [],
      checks: {},
    },
  };
  const validation = validateCountdownPresetFormState(form);
  assert.equal(validation.valid, false);
  assert.equal(validation.fieldErrors.svgAsset, "El SVG contiene <script>.");
  assert.equal(form.svgAsset.fileName, "unsafe.svg");
});

test("saving clears only mutable asset dirtiness", () => {
  const form = buildCountdownPresetFormState(null);
  form.nombre = "Con frame";
  form.svgAsset = { isDirty: true, svgText: "<svg />" };
  const saved = markCountdownPresetFormSaved(form);
  assert.equal(saved.svgAsset.isDirty, false);
  assert.equal(form.svgAsset.isDirty, true);
});

test("replacing a frame preserves scale and removing it resets unused scale", () => {
  const form = buildCountdownPresetFormState(null);
  form.config.layout.frameScale = 1.5;
  form.svgAsset = { type: "png", fileName: "flores.png" };

  const replaced = replaceCountdownPresetFrameAsset(form, {
    type: "svg",
    fileName: "lineas.svg",
  });
  assert.equal(replaced.config.layout.frameScale, 1.5);
  assert.equal(replaced.svgAsset.type, "svg");

  const removed = replaceCountdownPresetFrameAsset(replaced, null);
  assert.equal(removed.config.layout.frameScale, 1);
  assert.equal(removed.svgAsset, null);
  assert.equal(replaced.config.layout.frameScale, 1.5);
});

test("hydrates additive PNG metadata and keeps legacy refs readable as SVG", () => {
  const pngForm = buildCountdownPresetFormState({
    nombre: "Floral",
    svgRef: {
      type: "png",
      mimeType: "image/png",
      storagePath: "assets/countdown/frames/floral/frame.png",
      downloadUrl: "https://cdn.example.com/frame.png",
      width: 1600,
      height: 1600,
      hasAlpha: true,
      hasTransparency: true,
      colorMode: "currentColor",
    },
  });
  assert.equal(pngForm.svgAsset.type, "png");
  assert.equal(pngForm.svgAsset.mimeType, "image/png");
  assert.equal(pngForm.svgAsset.colorMode, "fixed");
  assert.equal(pngForm.svgAsset.width, 1600);
  assert.equal(pngForm.svgAsset.hasAlpha, true);
  assert.equal(pngForm.svgAsset.hasTransparency, true);

  const legacySvgForm = buildCountdownPresetFormState({
    nombre: "Legacy SVG",
    svgRef: {
      storagePath: "assets/countdown/frames/legacy/frame.svg",
      downloadUrl: "https://cdn.example.com/frame.svg",
      colorMode: "currentColor",
    },
  });
  assert.equal(legacySvgForm.svgAsset.type, "svg");
  assert.equal(legacySvgForm.svgAsset.mimeType, "image/svg+xml");
  assert.equal(legacySvgForm.svgAsset.colorMode, "currentColor");
});

test("history comparison identifies changed schema 2 sections without mutating either side", () => {
  const form = buildCountdownPresetFormState(null);
  form.nombre = "Draft";
  const version = {
    nombre: "Publicado",
    categoria: form.categoria,
    layout: form.config.layout,
    tipografia: form.config.tipografia,
    colores: form.config.colores,
    animaciones: form.config.animaciones,
    unidad: form.config.unidad,
    tamanoBase: form.config.tamanoBase,
    svgRef: null,
  };
  assert.deepEqual(compareCountdownVersionToDraft(version, form), [
    "Información",
  ]);
  assert.equal(version.nombre, "Publicado");
});
