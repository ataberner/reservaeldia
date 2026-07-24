import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountdownPreviewScenario,
  countdownBuilderReducer,
  createCountdownBuilderFingerprint,
  createCountdownBuilderInitialState,
  createCountdownOperationId,
  filterCountdownPresetItems,
  isCountdownBuilderDirty,
  resolveCountdownPublishControls,
  resolveCountdownCatalogSelection,
  selectCountdownBuilderDirty,
} from "./builderState.js";

function state(overrides = {}) {
  return {
    nombre: "Preset",
    categoria: { event: "boda", style: "editorial" },
    config: {
      layout: { distribution: "editorial", visibleUnits: ["days", "hours"] },
      unidad: { boxShadow: true },
    },
    svgAsset: {
      isDirty: false,
      fileName: "frame.svg",
      colorMode: "currentColor",
      downloadUrl: "https://cdn.example/frame.svg",
      svgText: "",
    },
    ...overrides,
  };
}

test("dirty state ignores asynchronously loaded SVG text for an unchanged persisted asset", () => {
  const baseline = createCountdownBuilderFingerprint(state());
  const hydrated = state({
    svgAsset: {
      ...state().svgAsset,
      svgText: "<svg>loaded later</svg>",
    },
  });
  assert.equal(isCountdownBuilderDirty(hydrated, baseline), false);
});

test("dirty state detects content, design, and new SVG changes", () => {
  const baseline = createCountdownBuilderFingerprint(state());
  assert.equal(
    isCountdownBuilderDirty(state({ nombre: "Otro nombre" }), baseline),
    true
  );
  assert.equal(
    isCountdownBuilderDirty(
      state({
        config: {
          ...state().config,
          unidad: { boxShadow: false },
        },
      }),
      baseline
    ),
    true
  );
  assert.equal(
    isCountdownBuilderDirty(
      state({
        config: {
          ...state().config,
          layout: {
            ...state().config.layout,
            frameScale: 1.5,
          },
        },
      }),
      baseline
    ),
    true
  );
  assert.equal(
    isCountdownBuilderDirty(
      state({
        svgAsset: {
          ...state().svgAsset,
          isDirty: true,
          svgText: "<svg>nuevo</svg>",
        },
      }),
      baseline
    ),
    true
  );
});

test("dirty state fingerprints PNG bytes and intrinsic metadata", () => {
  const png = state({
    svgAsset: {
      isDirty: true,
      type: "png",
      mimeType: "image/png",
      fileName: "flores.png",
      assetBase64: "png-a",
      width: 1200,
      height: 1200,
      hasAlpha: true,
      colorMode: "fixed",
    },
  });
  const baseline = createCountdownBuilderFingerprint(png);
  assert.equal(
    isCountdownBuilderDirty(
      {
        ...png,
        svgAsset: { ...png.svgAsset, assetBase64: "png-b" },
      },
      baseline
    ),
    true
  );
});

test("publish controls block raw publish while dirty and expose save-and-publish", () => {
  assert.deepEqual(
    resolveCountdownPublishControls({
      presetId: "preset-a",
      draftVersion: 4,
      dirty: true,
      saving: false,
      publishing: false,
    }),
    {
      canPublishSaved: false,
      canSaveAndPublish: true,
      publishBlockedByDirty: true,
    }
  );
});

test("operation ids are explicit, typed, and stable for a supplied retry token", () => {
  const operationId = createCountdownOperationId(
    "save_and_publish",
    () => "fixed-retry-token"
  );
  assert.equal(operationId, "save_and_publish_fixed-retry-token");
  assert.match(operationId, /^[a-zA-Z0-9_-]{8,128}$/);
});

test("central reducer owns selection, form, metadata, validation, and dirty state", () => {
  let builder = createCountdownBuilderInitialState(state({ nombre: "" }));
  builder = countdownBuilderReducer(builder, {
    type: "selection/replaced",
    presetId: "preset-a",
    draftVersion: 3,
    formState: state(),
    validation: { valid: true, errors: [], fieldErrors: {} },
  });
  assert.equal(builder.selection.id, "preset-a");
  assert.equal(builder.editor.draftVersion, 3);
  assert.equal(selectCountdownBuilderDirty(builder), false);

  builder = countdownBuilderReducer(builder, {
    type: "editor/changed",
    formState: state({ nombre: "Cambio local" }),
    fieldId: "nombre",
    validation: { valid: true, errors: [], fieldErrors: {} },
  });
  assert.equal(selectCountdownBuilderDirty(builder), true);
  assert.deepEqual(builder.validation.touchedFields, ["nombre"]);

  builder = countdownBuilderReducer(builder, { type: "editor/discarded" });
  assert.equal(builder.editor.form.nombre, "Preset");
  assert.equal(selectCountdownBuilderDirty(builder), false);
});

test("late catalog and history responses cannot replace current data", () => {
  let builder = createCountdownBuilderInitialState(state());
  builder = countdownBuilderReducer(builder, {
    type: "catalog/load-started",
    requestId: 2,
  });
  const lateCatalog = countdownBuilderReducer(builder, {
    type: "catalog/load-succeeded",
    requestId: 1,
    items: [{ id: "stale" }],
  });
  assert.deepEqual(lateCatalog.catalog.items, []);

  builder = countdownBuilderReducer(builder, {
    type: "selection/replaced",
    presetId: "preset-b",
    draftVersion: 1,
    formState: state(),
  });
  builder = countdownBuilderReducer(builder, {
    type: "history/load-started",
    presetId: "preset-b",
    requestId: 4,
  });
  const lateHistory = countdownBuilderReducer(builder, {
    type: "history/load-succeeded",
    presetId: "preset-a",
    requestId: 3,
    items: [{ id: "1" }],
  });
  assert.deepEqual(lateHistory.history.items, []);
});

test("initial catalog response cannot wipe a dirty or explicitly created local preset", () => {
  const items = [{ id: "remote-a" }, { id: "remote-b" }];
  assert.deepEqual(
    resolveCountdownCatalogSelection({
      currentSelectionId: null,
      selectionEpoch: 1,
      dirty: true,
      nextItems: items,
    }),
    { shouldReplace: false, item: null }
  );
  assert.deepEqual(
    resolveCountdownCatalogSelection({
      currentSelectionId: null,
      selectionEpoch: 1,
      dirty: false,
      nextItems: items,
    }),
    { shouldReplace: false, item: null }
  );
  assert.equal(
    resolveCountdownCatalogSelection({
      currentSelectionId: null,
      selectionEpoch: 0,
      nextItems: items,
    }).item.id,
    "remote-a"
  );
});

test("save response updates the persisted baseline without overwriting newer edits", () => {
  let builder = createCountdownBuilderInitialState(state());
  builder = countdownBuilderReducer(builder, {
    type: "selection/replaced",
    presetId: "preset-a",
    draftVersion: 1,
    formState: state(),
  });
  const selectionEpoch = builder.selection.epoch;
  const requested = state({ nombre: "Guardado" });
  builder = countdownBuilderReducer(builder, {
    type: "editor/changed",
    formState: requested,
    fieldId: "nombre",
  });
  const requestFingerprint = createCountdownBuilderFingerprint(requested);
  builder = countdownBuilderReducer(builder, {
    type: "editor/changed",
    formState: state({ nombre: "Edición posterior" }),
    fieldId: "nombre",
  });
  builder = countdownBuilderReducer(builder, {
    type: "editor/mark-saved",
    selectionEpoch,
    requestFingerprint,
    savedForm: requested,
    presetId: "preset-a",
    draftVersion: 2,
  });
  assert.equal(builder.editor.form.nombre, "Edición posterior");
  assert.equal(builder.editor.persistedForm.nombre, "Guardado");
  assert.equal(builder.editor.draftVersion, 2);
  assert.equal(selectCountdownBuilderDirty(builder), true);
});

test("response from a previous selection is ignored", () => {
  let builder = createCountdownBuilderInitialState(state());
  builder = countdownBuilderReducer(builder, {
    type: "selection/replaced",
    presetId: "preset-a",
    formState: state(),
  });
  const oldEpoch = builder.selection.epoch;
  builder = countdownBuilderReducer(builder, {
    type: "selection/replaced",
    presetId: "preset-b",
    formState: state({ nombre: "Preset B" }),
  });
  const afterLateSave = countdownBuilderReducer(builder, {
    type: "editor/mark-saved",
    selectionEpoch: oldEpoch,
    requestFingerprint: createCountdownBuilderFingerprint(state()),
    savedForm: state({ nombre: "Preset A guardado" }),
    presetId: "preset-a",
    draftVersion: 9,
  });
  assert.equal(afterLateSave.selection.id, "preset-b");
  assert.equal(afterLateSave.editor.form.nombre, "Preset B");
});

test("operation errors are recoverable and retry starts without losing the form", () => {
  let builder = createCountdownBuilderInitialState(state());
  builder = countdownBuilderReducer(builder, {
    type: "operation/started",
    kind: "save",
  });
  builder = countdownBuilderReducer(builder, {
    type: "operation/failed",
    error: "Fallo remoto",
  });
  assert.equal(builder.editor.form.nombre, "Preset");
  assert.equal(builder.notice.type, "error");
  builder = countdownBuilderReducer(builder, {
    type: "operation/started",
    kind: "save",
  });
  assert.equal(builder.operation.error, "");
  assert.equal(builder.operation.active.kind, "save");
});

test("filters search, classify, and sort without changing selection", () => {
  const items = [
    {
      id: "z",
      nombre: "Minimal",
      estado: "draft",
      categoria: { event: "boda", label: "Boda" },
      activeVersion: 0,
      metadata: { updatedAt: "2026-01-01T00:00:00.000Z" },
    },
    {
      id: "a",
      nombre: "Editorial",
      estado: "published",
      categoria: { event: "quince", label: "Quince" },
      activeVersion: 3,
      metadata: { updatedAt: "2026-02-01T00:00:00.000Z" },
    },
  ];
  assert.deepEqual(
    filterCountdownPresetItems(items, { query: "editorial" }).map(
      (item) => item.id
    ),
    ["a"]
  );
  assert.deepEqual(
    filterCountdownPresetItems(items, {
      status: "published",
      category: "quince",
    }).map((item) => item.id),
    ["a"]
  );
  assert.deepEqual(
    filterCountdownPresetItems(items, { sort: "version-desc" }).map(
      (item) => item.id
    ),
    ["a", "z"]
  );
});

test("preview scenarios freeze a reproducible clock across all four states", () => {
  const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
  assert.equal(
    buildCountdownPreviewScenario("days", { nowMs }).targetISO,
    "2026-06-11T12:00:00.000Z"
  );
  assert.equal(
    buildCountdownPreviewScenario("hours", { nowMs }).targetISO,
    "2026-06-01T15:00:00.000Z"
  );
  assert.equal(
    buildCountdownPreviewScenario("seconds", { nowMs }).targetISO,
    "2026-06-01T12:00:10.000Z"
  );
  assert.ok(
    Date.parse(buildCountdownPreviewScenario("expired", { nowMs }).targetISO) <
      nowMs
  );
});
