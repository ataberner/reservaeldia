import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESERVE_CANVAS_SELECTION_SELECTOR,
  PRESERVE_INLINE_EDIT_SELECTOR,
  shouldPreserveCanvasSelectionTarget,
  shouldPreserveInlineEditTarget,
} from "./selectionPreservationPolicy.js";

function createFakeTarget(activeSelectors = []) {
  const matches = new Set(activeSelectors);
  return {
    closest(selector) {
      const requestedSelectors = String(selector || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

      return requestedSelectors.some((entry) => matches.has(entry)) ? this : null;
    },
  };
}

test("inline overlay targets preserve inline editing", () => {
  const target = createFakeTarget(['[data-preserve-inline-edit="true"]']);

  assert.equal(
    shouldPreserveInlineEditTarget(target, PRESERVE_INLINE_EDIT_SELECTOR),
    true
  );
});

test("inline toolbar and picker targets preserve inline editing", () => {
  const toolbarTarget = createFakeTarget(['[data-preserve-inline-edit="true"]']);
  const pickerTarget = createFakeTarget(['[data-preserve-inline-edit="true"]']);

  assert.equal(
    shouldPreserveInlineEditTarget(toolbarTarget, PRESERVE_INLINE_EDIT_SELECTOR),
    true
  );
  assert.equal(
    shouldPreserveInlineEditTarget(pickerTarget, PRESERVE_INLINE_EDIT_SELECTOR),
    true
  );
});

test("dashboard sidebar targets do not preserve inline editing by default", () => {
  const sidebarTarget = createFakeTarget(['[data-dashboard-sidebar="true"]']);

  assert.equal(
    shouldPreserveCanvasSelectionTarget(sidebarTarget, PRESERVE_CANVAS_SELECTION_SELECTOR),
    true
  );
  assert.equal(
    shouldPreserveInlineEditTarget(sidebarTarget, PRESERVE_INLINE_EDIT_SELECTOR),
    false
  );
});

test("option button and layer menu targets do not preserve inline editing by default", () => {
  const optionButtonTarget = createFakeTarget(['[data-option-button="true"]']);
  const menuTarget = createFakeTarget([".menu-z-index"]);

  assert.equal(
    shouldPreserveCanvasSelectionTarget(
      optionButtonTarget,
      PRESERVE_CANVAS_SELECTION_SELECTOR
    ),
    true
  );
  assert.equal(
    shouldPreserveInlineEditTarget(optionButtonTarget, PRESERVE_INLINE_EDIT_SELECTOR),
    false
  );

  assert.equal(
    shouldPreserveCanvasSelectionTarget(menuTarget, PRESERVE_CANVAS_SELECTION_SELECTOR),
    true
  );
  assert.equal(
    shouldPreserveInlineEditTarget(menuTarget, PRESERVE_INLINE_EDIT_SELECTOR),
    false
  );
});

test("explicit canvas-preserve targets keep the current canvas selection", () => {
  const groupingActionTarget = createFakeTarget([
    '[data-preserve-canvas-selection="true"]',
  ]);

  assert.equal(
    shouldPreserveCanvasSelectionTarget(
      groupingActionTarget,
      PRESERVE_CANVAS_SELECTION_SELECTOR
    ),
    true
  );
  assert.equal(
    shouldPreserveInlineEditTarget(
      groupingActionTarget,
      PRESERVE_INLINE_EDIT_SELECTOR
    ),
    false
  );
});

test("selection-preserve and inline-preserve decisions can differ", () => {
  const selectionOnlyTarget = createFakeTarget(['[data-dashboard-sidebar="true"]']);
  const inlineOnlyTarget = createFakeTarget(['[data-preserve-inline-edit="true"]']);

  assert.deepEqual(
    {
      selection: shouldPreserveCanvasSelectionTarget(
        selectionOnlyTarget,
        PRESERVE_CANVAS_SELECTION_SELECTOR
      ),
      inline: shouldPreserveInlineEditTarget(
        selectionOnlyTarget,
        PRESERVE_INLINE_EDIT_SELECTOR
      ),
    },
    {
      selection: true,
      inline: false,
    }
  );

  assert.deepEqual(
    {
      selection: shouldPreserveCanvasSelectionTarget(
        inlineOnlyTarget,
        PRESERVE_CANVAS_SELECTION_SELECTOR
      ),
      inline: shouldPreserveInlineEditTarget(
        inlineOnlyTarget,
        PRESERVE_INLINE_EDIT_SELECTOR
      ),
    },
    {
      selection: false,
      inline: true,
    }
  );
});
