import test from "node:test";
import assert from "node:assert/strict";

import { createSelectionClearPolicy } from "./selectionClearPolicy.js";

test("selection clear policy maps clearCanvasSelection to the full deselect intent", () => {
  const calls = [];
  const policy = createSelectionClearPolicy({
    clearSelectionState(options) {
      calls.push(options);
      return "ok";
    },
  });

  assert.equal(policy.clearCanvasSelection(), "ok");
  assert.deepEqual(calls, [
    {
      clearCommittedSelection: true,
      clearPreselection: true,
      clearMarquee: true,
      clearBackgroundEdit: true,
      clearBackgroundInteraction: true,
      clearPendingDrag: true,
      clearDragVisual: true,
      source: "selection-ui:clear",
    },
  ]);
});

test("selection clear policy maps the stage tap and marquee intents to their current resets", () => {
  const calls = [];
  const policy = createSelectionClearPolicy({
    clearSelectionState(options) {
      calls.push(options);
      return options.source;
    },
  });

  assert.equal(policy.clearForStageTap(), "stage-gestures:clear-selection");
  assert.equal(policy.resetMarquee(), "stage-gestures:reset-marquee");
  assert.deepEqual(calls, [
    {
      clearCommittedSelection: true,
      clearPreselection: false,
      clearMarquee: false,
      clearBackgroundEdit: false,
      clearBackgroundInteraction: false,
      clearPendingDrag: true,
      clearDragVisual: true,
      source: "stage-gestures:clear-selection",
    },
    {
      clearCommittedSelection: false,
      clearPreselection: true,
      clearMarquee: true,
      clearBackgroundEdit: false,
      clearBackgroundInteraction: false,
      clearPendingDrag: false,
      clearDragVisual: false,
      source: "stage-gestures:reset-marquee",
    },
  ]);
});

test("selection clear policy maps the background edit transitions to their current resets", () => {
  const calls = [];
  const policy = createSelectionClearPolicy({
    clearSelectionState(options) {
      calls.push(options);
      return options.source;
    },
  });

  assert.equal(
    policy.prepareForSectionBackgroundEdit(),
    "section-background:request-edit"
  );
  assert.equal(
    policy.prepareForBackgroundDecorationEdit(),
    "background-decoration-edit"
  );
  assert.deepEqual(calls, [
    {
      clearCommittedSelection: true,
      clearPreselection: true,
      clearMarquee: true,
      clearBackgroundEdit: false,
      clearBackgroundInteraction: true,
      clearPendingDrag: true,
      clearDragVisual: true,
      source: "section-background:request-edit",
    },
    {
      clearCommittedSelection: true,
      clearPreselection: true,
      clearMarquee: false,
      clearBackgroundEdit: false,
      clearBackgroundInteraction: false,
      clearPendingDrag: true,
      clearDragVisual: true,
      source: "background-decoration-edit",
    },
  ]);
});

test("selection clear policy safely no-ops without a clearSelectionState handler", () => {
  const policy = createSelectionClearPolicy({});

  assert.equal(policy.clearCanvasSelection(), null);
  assert.equal(policy.clearForStageTap(), null);
  assert.equal(policy.resetMarquee(), null);
  assert.equal(policy.prepareForSectionBackgroundEdit(), null);
  assert.equal(policy.prepareForBackgroundDecorationEdit(), null);
});
