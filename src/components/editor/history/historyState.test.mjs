import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DYNAMIC_VISUAL_HISTORY_STATE_VERSION,
  buildDynamicVisualHistoryState,
  evaluateEditorHistoryCapture,
  hasDynamicVisualHistoryChange,
  planRedoHistoryTransition,
  planUndoHistoryTransition,
  restoreDynamicVisualHistorySlice,
} from "./historyState.js";

test("dynamic visual history state is explicit, versioned and contains no values", () => {
  const state = buildDynamicVisualHistoryState({
    fieldsSchema: [
      {
        key: "event_date",
        applyTargets: [
          {
            scope: "objeto",
            id: "date-text",
            path: "texto",
            mode: "replace",
            transform: { name: "date_to_text", preset: "long" },
          },
          { scope: "documento", path: "eventDate" },
        ],
      },
      { key: "story", applyTargets: [] },
    ],
    detachedVisuals: { version: 1, nextSequence: 2, entries: [] },
  });

  assert.equal(state.version, DYNAMIC_VISUAL_HISTORY_STATE_VERSION);
  assert.deepEqual(state.fields, [
    {
      fieldKey: "event_date",
      hasApplyTargets: true,
      targets: [
        {
          scope: "objeto",
          id: "date-text",
          path: "texto",
          mode: "replace",
          transform: { name: "date_to_text", preset: "long" },
        },
      ],
    },
    { fieldKey: "story", hasApplyTargets: true, targets: [] },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(state, "values"), false);
});

test("missing, legacy and unsupported dynamic visual payloads are no-ops", () => {
  const fieldsSchema = [
    {
      key: "story",
      applyTargets: [{ scope: "objeto", id: "story-text", path: "texto" }],
    },
  ];
  const detachedVisuals = {
    version: 1,
    nextSequence: 3,
    entries: [{ id: "cached-story" }],
  };

  for (const historyState of [
    undefined,
    null,
    {},
    { fields: [] },
    { version: 99, fields: [], detachedVisuals: null },
  ]) {
    const restored = restoreDynamicVisualHistorySlice({
      historyState,
      fieldsSchema,
      detachedVisuals,
    });
    assert.equal(restored.applied, false);
    assert.strictEqual(restored.fieldsSchema, fieldsSchema);
    assert.strictEqual(restored.detachedVisuals, detachedVisuals);
  }
});

test("versioned restore preserves target shape and absent versus empty mappings", () => {
  const restored = restoreDynamicVisualHistorySlice({
    fieldsSchema: [
      {
        key: "event_date",
        applyTargets: [
          { scope: "documento", path: "eventDate" },
          { scope: "objeto", id: "current-date", path: "texto" },
        ],
      },
      {
        key: "story",
        applyTargets: [{ scope: "objeto", id: "story-text", path: "texto" }],
      },
      {
        key: "new_field",
        applyTargets: [{ scope: "objeto", id: "new-text", path: "texto" }],
      },
    ],
    detachedVisuals: { version: 1, nextSequence: 9, entries: [] },
    historyState: {
      version: DYNAMIC_VISUAL_HISTORY_STATE_VERSION,
      fields: [
        {
          fieldKey: "event_date",
          hasApplyTargets: false,
          targets: [],
        },
        {
          fieldKey: "story",
          hasApplyTargets: true,
          targets: [
            {
              scope: "objeto",
              id: "historic-story",
              path: "texto",
              mode: "replace",
              transform: { name: "identity" },
            },
          ],
        },
      ],
      detachedVisuals: {
        version: 1,
        nextSequence: 4,
        entries: [{ id: "historic-cache" }],
      },
    },
  });

  assert.equal(restored.applied, true);
  assert.deepEqual(restored.fieldsSchema[0].applyTargets, [
    { scope: "documento", path: "eventDate" },
  ]);
  assert.deepEqual(restored.fieldsSchema[1].applyTargets, [
    {
      scope: "objeto",
      id: "historic-story",
      path: "texto",
      mode: "replace",
      transform: { name: "identity" },
    },
  ]);
  assert.deepEqual(restored.fieldsSchema[2].applyTargets, []);
  assert.deepEqual(restored.detachedVisuals.entries, [{ id: "historic-cache" }]);
});

test("dynamic visual comparison ignores value-only data but detects mapping transforms", () => {
  const fieldsSchema = [
    {
      key: "event_date",
      applyTargets: [
        {
          scope: "objeto",
          id: "date-text",
          path: "texto",
          transform: { name: "date_to_text", preset: "short" },
        },
      ],
    },
  ];
  const detachedVisuals = { version: 1, nextSequence: 1, entries: [] };
  const before = buildDynamicVisualHistoryState({
    fieldsSchema,
    detachedVisuals,
    values: { event_date: "2026-09-02" },
  });
  const valueOnly = buildDynamicVisualHistoryState({
    fieldsSchema,
    detachedVisuals,
    values: { event_date: "2027-10-03" },
  });
  const nextTransform = structuredClone(before);
  nextTransform.fields[0].targets[0].transform.preset = "long";

  assert.equal(hasDynamicVisualHistoryChange(before, valueOnly), false);
  assert.equal(hasDynamicVisualHistoryChange(before, nextTransform), true);
});

test("history waits for authoring hydration and realigns its baseline after a guard", () => {
  const input = {
    cargado: true,
    objetos: [{ id: "text-1", texto: "actual" }],
    secciones: [{ id: "screen-1" }],
    dynamicVisualState: {
      version: DYNAMIC_VISUAL_HISTORY_STATE_VERSION,
      fields: [],
      detachedVisuals: null,
    },
  };
  const waiting = evaluateEditorHistoryCapture({
    ...input,
    authoringHydrated: false,
    lastSignature: "previous",
  });
  assert.equal(waiting.shouldCapture, false);
  assert.equal(waiting.nextBaselineSignature, "previous");

  const ready = evaluateEditorHistoryCapture({
    ...input,
    authoringHydrated: true,
  });
  assert.equal(ready.shouldCapture, true);

  const guarded = evaluateEditorHistoryCapture({
    ...input,
    authoringHydrated: true,
    suppressed: true,
    lastSignature: "previous",
  });
  assert.equal(guarded.shouldCapture, false);
  assert.equal(guarded.consumeSuppression, true);
  assert.notEqual(guarded.nextBaselineSignature, "previous");

  const afterGuard = evaluateEditorHistoryCapture({
    ...input,
    authoringHydrated: true,
    lastSignature: guarded.nextBaselineSignature,
  });
  assert.equal(afterGuard.shouldCapture, false);
  assert.equal(afterGuard.reason, "unchanged");
});

test("undo and redo transitions are pure and keep the bounded future order", () => {
  const first = { id: "first" };
  const second = { id: "second" };
  const third = { id: "third" };
  const history = [first, second];
  const future = [third];

  const undo = planUndoHistoryTransition({ history, future });
  assert.strictEqual(undo.targetSnapshot, first);
  assert.deepEqual(undo.history, [first]);
  assert.deepEqual(undo.future, [second, third]);
  assert.deepEqual(history, [first, second]);
  assert.deepEqual(future, [third]);

  const redo = planRedoHistoryTransition({
    history: undo.history,
    future: undo.future,
  });
  assert.strictEqual(redo.targetSnapshot, second);
  assert.deepEqual(redo.history, [first, second]);
  assert.deepEqual(redo.future, [third]);
});

test("history integration keeps effects outside history state updaters", () => {
  const actionsSource = readFileSync(
    new URL("../../../utils/editorActions.js", import.meta.url),
    "utf8"
  );
  const managerSource = readFileSync(
    new URL("./useHistoryManager.js", import.meta.url),
    "utf8"
  );
  const authoringSource = readFileSync(
    new URL("../templateAuthoring/useTemplateFieldAuthoring.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(actionsSource, /setHistorial\s*\(\s*\([^)]*\)\s*=>/);
  assert.match(managerSource, /authoringHydrated/);
  assert.match(managerSource, /decision\.nextBaselineSignature/);
  assert.match(authoringSource, /excludeFromHistory:\s*!recordsCanvasHistory/);
});
