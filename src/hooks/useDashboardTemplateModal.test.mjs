import test from "node:test";
import assert from "node:assert/strict";

import {
  TEMPLATE_FORM_STATE_INITIAL,
  TEMPLATE_PREVIEW_STATUS_IDLE,
  buildTemplatePreviewModalProps,
  canApplyTemplateModalSelectionSession,
  createTemplateModalSelectionSession,
  resolveDashboardTemplateModalViewState,
} from "./useDashboardTemplateModal.js";

test("stale template modal selection sessions cannot overwrite the active selection", () => {
  const firstSession = createTemplateModalSelectionSession({
    templateId: "tpl-floral",
    requestSequence: 1,
  });
  const secondSession = createTemplateModalSelectionSession({
    templateId: "tpl-floral",
    requestSequence: 2,
  });

  assert.equal(
    canApplyTemplateModalSelectionSession({
      activeSelection: {
        ...secondSession,
        isOpen: true,
      },
      session: firstSession,
    }),
    false
  );

  assert.equal(
    canApplyTemplateModalSelectionSession({
      activeSelection: {
        ...secondSession,
        isOpen: true,
      },
      session: secondSession,
    }),
    true
  );
});

test("template modal derived state stays keyed by the selected template id", () => {
  const derived = resolveDashboardTemplateModalViewState({
    selectedTemplate: {
      id: "tpl-b",
      nombre: "Plantilla B",
      tipo: "boda",
    },
    templatePreviewCacheById: {
      "tpl-a": "<html>A</html>",
      "tpl-b": "<html>B</html>",
    },
    templatePreviewStatus: {
      "tpl-a": {
        status: "ready",
        error: "",
      },
      "tpl-b": {
        status: "error",
        error: "Preview B failed",
      },
    },
    templateFormState: {
      rawValues: {
        event_name: "Mara y Nico",
      },
      touchedKeys: ["event_name"],
    },
  });

  assert.equal(derived.selectedTemplateId, "tpl-b");
  assert.equal(derived.selectedTemplatePreviewHtml, "<html>B</html>");
  assert.deepEqual(derived.selectedTemplatePreviewState, {
    status: "error",
    error: "Preview B failed",
  });
  assert.deepEqual(derived.selectedTemplateFormState, {
    rawValues: {
      event_name: "Mara y Nico",
    },
    touchedKeys: ["event_name"],
  });
});

test("template modal derived state falls back to the current idle defaults when no template is selected", () => {
  const derived = resolveDashboardTemplateModalViewState({
    selectedTemplate: null,
    templatePreviewCacheById: {
      "tpl-a": "<html>A</html>",
    },
    templatePreviewStatus: {
      "tpl-a": {
        status: "ready",
        error: "",
      },
    },
    templateFormState: {
      rawValues: {
        event_name: "Ignored",
      },
      touchedKeys: ["event_name"],
    },
  });

  assert.equal(derived.selectedTemplateId, "");
  assert.equal(derived.selectedTemplatePreviewHtml, "");
  assert.equal(
    derived.selectedTemplatePreviewState,
    TEMPLATE_PREVIEW_STATUS_IDLE
  );
  assert.equal(
    derived.selectedTemplateFormState,
    TEMPLATE_FORM_STATE_INITIAL
  );
});

test("template modal prop shaping preserves the current modal contract", () => {
  const onClose = () => {};
  const onOpenEditorWithChanges = () => {};
  const onOpenEditorWithoutChanges = () => {};
  const onFormStateChange = () => {};

  const props = buildTemplatePreviewModalProps({
    visible: true,
    template: {
      id: "tpl-1",
      nombre: "Plantilla 1",
    },
    metadata: {
      title: "Plantilla 1",
    },
    previewHtml: "<html>preview</html>",
    previewStatus: {
      status: "ready",
      error: "",
    },
    onClose,
    onOpenEditorWithChanges,
    onOpenEditorWithoutChanges,
    formState: {
      rawValues: {
        event_name: "Mara y Nico",
      },
      touchedKeys: ["event_name"],
    },
    onFormStateChange,
    openingEditor: true,
  });

  assert.deepEqual(Object.keys(props), [
    "visible",
    "template",
    "metadata",
    "previewHtml",
    "previewStatus",
    "onClose",
    "onOpenEditorWithChanges",
    "onOpenEditorWithoutChanges",
    "formState",
    "onFormStateChange",
    "openingEditor",
  ]);
  assert.equal(props.visible, true);
  assert.equal(props.onClose, onClose);
  assert.equal(props.onOpenEditorWithChanges, onOpenEditorWithChanges);
  assert.equal(
    props.onOpenEditorWithoutChanges,
    onOpenEditorWithoutChanges
  );
  assert.equal(props.onFormStateChange, onFormStateChange);
  assert.equal(props.openingEditor, true);
  assert.deepEqual(props.formState, {
    rawValues: {
      event_name: "Mara y Nico",
    },
    touchedKeys: ["event_name"],
  });
});
