import test from "node:test";
import assert from "node:assert/strict";

import {
  decidePressSelection,
  decideSelectionGestureDispatch,
  isManualGroupDragEligible,
  resolveEffectiveSelectionState,
  resolveInteractionAccess,
  shouldArmPredragRelease,
  shouldArmSelectedTextPrimaryRelease,
} from "./elementInteractionDecisions.js";

test("manual group-drag eligibility only enables for selected multiselection outside edit modes", () => {
  assert.equal(
    isManualGroupDragEligible({
      isSelected: true,
      selectionCount: 2,
      editingMode: false,
      isInEditMode: false,
      inlineEditPointerActive: false,
    }),
    true
  );

  assert.equal(
    isManualGroupDragEligible({
      isSelected: false,
      selectionCount: 2,
      editingMode: false,
      isInEditMode: false,
      inlineEditPointerActive: false,
    }),
    false
  );

  assert.equal(
    isManualGroupDragEligible({
      isSelected: true,
      selectionCount: 1,
      editingMode: false,
      isInEditMode: false,
      inlineEditPointerActive: false,
    }),
    false
  );

  assert.equal(
    isManualGroupDragEligible({
      isSelected: true,
      selectionCount: 2,
      editingMode: true,
      isInEditMode: false,
      inlineEditPointerActive: false,
    }),
    false
  );
});

test("interaction access preserves follower suppression and drag/listening eligibility", () => {
  assert.deepEqual(
    resolveInteractionAccess({
      editingMode: false,
      isInEditMode: false,
      inlineEditPointerActive: false,
      isActiveGroupFollower: false,
      isManualGroupMember: false,
      manualGroupDragEligible: false,
    }),
    {
      draggable: true,
      listening: true,
      followerSuppressed: false,
    }
  );

  assert.deepEqual(
    resolveInteractionAccess({
      editingMode: false,
      isInEditMode: true,
      inlineEditPointerActive: false,
      isActiveGroupFollower: true,
      isManualGroupMember: true,
      manualGroupDragEligible: true,
    }),
    {
      draggable: false,
      listening: false,
      followerSuppressed: true,
    }
  );
});

test("selected-text release arming requires a single selected text without edit mode or modifiers", () => {
  assert.equal(
    shouldArmSelectedTextPrimaryRelease({
      tipo: "texto",
      effectiveIsSelected: true,
      effectiveSelectionCount: 1,
      editingMode: false,
      inlineEditPointerActive: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    }),
    true
  );

  assert.equal(
    shouldArmSelectedTextPrimaryRelease({
      tipo: "texto",
      effectiveIsSelected: true,
      effectiveSelectionCount: 2,
      editingMode: false,
      inlineEditPointerActive: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    }),
    false
  );

  assert.equal(
    shouldArmSelectedTextPrimaryRelease({
      tipo: "texto",
      effectiveIsSelected: true,
      effectiveSelectionCount: 1,
      editingMode: false,
      inlineEditPointerActive: false,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    }),
    false
  );
});

test("press-selection decision reports the existing skip reasons and same-gesture drag allowance", () => {
  assert.equal(
    decidePressSelection({
      hasOnSelect: false,
      effectiveIsSelected: false,
      effectiveSelectionCount: 0,
      inlineEditPointerActive: false,
      selectionGestureSuppressed: false,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    }).reason,
    "missing-onSelect"
  );

  assert.equal(
    decidePressSelection({
      hasOnSelect: true,
      effectiveIsSelected: true,
      effectiveSelectionCount: 1,
      inlineEditPointerActive: false,
      selectionGestureSuppressed: false,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    }).reason,
    "already-selected"
  );

  assert.equal(
    decidePressSelection({
      hasOnSelect: true,
      effectiveIsSelected: false,
      effectiveSelectionCount: 2,
      inlineEditPointerActive: false,
      selectionGestureSuppressed: false,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    }).reason,
    "multiselection-active"
  );

  assert.deepEqual(
    decidePressSelection({
      hasOnSelect: true,
      effectiveIsSelected: false,
      effectiveSelectionCount: 3,
      inlineEditPointerActive: false,
      selectionGestureSuppressed: false,
      button: 0,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
    }),
    {
      shouldSelectOnPress: true,
      allowSameGestureDrag: false,
      reason: "select-on-press",
    }
  );

  assert.equal(
    decidePressSelection({
      hasOnSelect: true,
      effectiveIsSelected: false,
      effectiveSelectionCount: 1,
      inlineEditPointerActive: true,
      selectionGestureSuppressed: false,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    }).reason,
    "inline-edit-pointer-active"
  );

  assert.equal(
    decidePressSelection({
      hasOnSelect: true,
      effectiveIsSelected: false,
      effectiveSelectionCount: 1,
      inlineEditPointerActive: false,
      selectionGestureSuppressed: true,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    }).reason,
    "selection-gesture-suppressed"
  );

  assert.equal(
    decidePressSelection({
      hasOnSelect: true,
      effectiveIsSelected: false,
      effectiveSelectionCount: 1,
      inlineEditPointerActive: false,
      selectionGestureSuppressed: false,
      button: 2,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    }).reason,
    "non-primary-button"
  );

  assert.deepEqual(
    decidePressSelection({
      hasOnSelect: true,
      effectiveIsSelected: false,
      effectiveSelectionCount: 1,
      inlineEditPointerActive: false,
      selectionGestureSuppressed: false,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    }),
    {
      shouldSelectOnPress: true,
      allowSameGestureDrag: true,
      reason: "select-on-press",
    }
  );
});

test("gesture dispatch decisions preserve release suppression, guard consumption, drag skip, and emit path", () => {
  assert.equal(
    decideSelectionGestureDispatch({
      gesture: "primary",
      suppressNativeClickUntilActive: true,
      pressSelectionGuardConsumed: false,
      selectionGestureSuppressed: false,
      hasDragged: false,
    }).reason,
    "manual-release-inline"
  );

  assert.equal(
    decideSelectionGestureDispatch({
      gesture: "primary",
      suppressNativeClickUntilActive: false,
      pressSelectionGuardConsumed: true,
      selectionGestureSuppressed: false,
      hasDragged: false,
    }).reason,
    "press-selection-guard"
  );

  assert.equal(
    decideSelectionGestureDispatch({
      gesture: "double",
      suppressNativeClickUntilActive: false,
      pressSelectionGuardConsumed: false,
      selectionGestureSuppressed: true,
      hasDragged: false,
    }).reason,
    "selection-gesture-suppressed"
  );

  assert.equal(
    decideSelectionGestureDispatch({
      gesture: "primary",
      suppressNativeClickUntilActive: false,
      pressSelectionGuardConsumed: false,
      selectionGestureSuppressed: false,
      hasDragged: true,
    }).reason,
    "drag-active"
  );

  assert.deepEqual(
    decideSelectionGestureDispatch({
      gesture: "double",
      suppressNativeClickUntilActive: false,
      pressSelectionGuardConsumed: false,
      selectionGestureSuppressed: false,
      hasDragged: false,
    }),
    {
      shouldEmit: true,
      reason: "emit",
    }
  );
});

test("predrag arming only applies to single-selection press paths outside manual group drag", () => {
  assert.equal(
    shouldArmPredragRelease({
      assumeSingleSelection: true,
      isSelected: false,
      selectionCount: 0,
      manualGroupDragEligible: false,
    }),
    true
  );

  assert.equal(
    shouldArmPredragRelease({
      assumeSingleSelection: false,
      isSelected: true,
      selectionCount: 1,
      manualGroupDragEligible: false,
    }),
    true
  );

  assert.equal(
    shouldArmPredragRelease({
      assumeSingleSelection: false,
      isSelected: true,
      selectionCount: 2,
      manualGroupDragEligible: true,
    }),
    false
  );
});

test("effective selection state prefers runtime ids over stale prop counts", () => {
  assert.deepEqual(
    resolveEffectiveSelectionState({
      elementId: "obj-2",
      isSelected: false,
      selectionCount: 1,
      runtimeSelectedIds: ["obj-1", "obj-2"],
    }),
    {
      runtimeSelectedIds: ["obj-1", "obj-2"],
      effectiveIsSelected: true,
      effectiveSelectionCount: 2,
    }
  );
});
