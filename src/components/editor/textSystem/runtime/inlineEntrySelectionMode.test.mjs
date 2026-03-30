import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInlineEntrySelectionPlan,
  INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT,
  INLINE_ENTRY_SELECTION_MODE_SELECT_ALL,
  normalizeInlineEntrySelectionMode,
} from "./inlineEntrySelectionMode.js";

test("normalizeInlineEntrySelectionMode defaults to caret-from-point when a valid point exists", () => {
  const mode = normalizeInlineEntrySelectionMode(null, {
    initialCaretClientPoint: {
      clientX: 120,
      clientY: 48,
    },
  });

  assert.equal(mode, INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT);
});

test("normalizeInlineEntrySelectionMode defaults to select-all when no valid point exists", () => {
  const mode = normalizeInlineEntrySelectionMode(null, {
    initialCaretClientPoint: null,
  });

  assert.equal(mode, INLINE_ENTRY_SELECTION_MODE_SELECT_ALL);
});

test("normalizeInlineEntrySelectionMode preserves explicit select-all even when a point exists", () => {
  const mode = normalizeInlineEntrySelectionMode(
    INLINE_ENTRY_SELECTION_MODE_SELECT_ALL,
    {
      initialCaretClientPoint: {
        clientX: 120,
        clientY: 48,
      },
    }
  );

  assert.equal(mode, INLINE_ENTRY_SELECTION_MODE_SELECT_ALL);
});

test("buildInlineEntrySelectionPlan prefers point placement before restore in caret-from-point mode", () => {
  const plan = buildInlineEntrySelectionPlan({
    entrySelectionMode: INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT,
    initialCaretClientPoint: {
      clientX: 120,
      clientY: 48,
    },
  });

  assert.deepEqual(plan, {
    mode: INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT,
    primaryAction: "point",
    fallbackAction: "restore",
    consumesInitialCaretPoint: true,
  });
});

test("buildInlineEntrySelectionPlan falls back to restore without select-all for caret mode", () => {
  const plan = buildInlineEntrySelectionPlan({
    entrySelectionMode: INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT,
    initialCaretClientPoint: null,
  });

  assert.deepEqual(plan, {
    mode: INLINE_ENTRY_SELECTION_MODE_CARET_FROM_POINT,
    primaryAction: "restore",
    fallbackAction: null,
    consumesInitialCaretPoint: false,
  });
});

test("buildInlineEntrySelectionPlan keeps select-all mode from consuming a pending point", () => {
  const plan = buildInlineEntrySelectionPlan({
    entrySelectionMode: INLINE_ENTRY_SELECTION_MODE_SELECT_ALL,
    initialCaretClientPoint: {
      clientX: 120,
      clientY: 48,
    },
  });

  assert.deepEqual(plan, {
    mode: INLINE_ENTRY_SELECTION_MODE_SELECT_ALL,
    primaryAction: "select-all",
    fallbackAction: "restore",
    consumesInitialCaretPoint: false,
  });
});
