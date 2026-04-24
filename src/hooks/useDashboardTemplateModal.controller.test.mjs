import test from "node:test";
import assert from "node:assert/strict";

import {
  TEMPLATE_FORM_STATE_INITIAL,
  createDashboardTemplateModalControllerRuntime,
  resolveDashboardTemplateModalViewState,
} from "./useDashboardTemplateModal.js";

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createCatalogTemplate(overrides = {}) {
  return {
    id: "tpl-1",
    nombre: "Plantilla catalogo",
    tipo: "boda",
    ...overrides,
  };
}

function createFullTemplate(overrides = {}) {
  return {
    id: "tpl-1",
    nombre: "Plantilla completa",
    tipo: "boda",
    fieldsSchema: [
      {
        key: "event_name",
        label: "Nombre del evento",
        type: "text",
      },
    ],
    defaults: {
      event_name: "Evento default",
    },
    secciones: [
      {
        id: "sec-1",
        orden: 1,
        altura: 640,
        fondo: "#ffffff",
      },
    ],
    objetos: [
      {
        id: "obj-1",
        tipo: "texto",
        seccionId: "sec-1",
        texto: "Hola",
      },
    ],
    ...overrides,
  };
}

function snapshotControllerState(state) {
  const safeState = state && typeof state === "object" ? state : {};
  return {
    selectedTemplate: safeState.selectedTemplate
      ? cloneJson(safeState.selectedTemplate)
      : null,
    isTemplateModalOpen: safeState.isTemplateModalOpen === true,
    isOpeningTemplateEditor: safeState.isOpeningTemplateEditor === true,
    templatePreviewCacheById: cloneJson(
      safeState.templatePreviewCacheById || {}
    ),
    templatePreviewStatus: cloneJson(safeState.templatePreviewStatus || {}),
    templateFormState: cloneJson(
      safeState.templateFormState || TEMPLATE_FORM_STATE_INITIAL
    ),
  };
}

function createControllerHarness({
  userUid = "user-1",
  dependencyOverrides = {},
  openDraftInEditor,
} = {}) {
  let controllerState = {
    selectedTemplate: null,
    isTemplateModalOpen: false,
    isOpeningTemplateEditor: false,
    templatePreviewCacheById: {},
    templatePreviewStatus: {},
    templateFormState: TEMPLATE_FORM_STATE_INITIAL,
  };

  const snapshots = [snapshotControllerState(controllerState)];
  const openDraftInEditorCalls = [];
  const resolvedOpenDraftInEditor =
    typeof openDraftInEditor === "function"
      ? openDraftInEditor
      : (slug) => {
          openDraftInEditorCalls.push(slug);
        };

  const requestSequenceRef = { current: 0 };
  const activeSelectionRef = {
    current: {
      templateId: "",
      requestKey: "",
      isOpen: false,
    },
  };
  const selectedTemplateRef = { current: null };
  const templateFormStateRef = { current: TEMPLATE_FORM_STATE_INITIAL };
  const templatePreviewCacheRef = { current: {} };
  const isOpeningTemplateEditorRef = { current: false };

  const pushSnapshot = () => {
    snapshots.push(snapshotControllerState(controllerState));
  };

  const controller = createDashboardTemplateModalControllerRuntime({
    userUid,
    openDraftInEditor: resolvedOpenDraftInEditor,
    dependencyOverrides,
    requestSequenceRef,
    activeSelectionRef,
    selectedTemplateRef,
    templateFormStateRef,
    templatePreviewCacheRef,
    isOpeningTemplateEditorRef,
    setSelectedTemplate: (nextValue) => {
      selectedTemplateRef.current = nextValue;
      controllerState = {
        ...controllerState,
        selectedTemplate: nextValue,
      };
      pushSnapshot();
    },
    setIsTemplateModalOpen: (nextValue) => {
      controllerState = {
        ...controllerState,
        isTemplateModalOpen: nextValue === true,
      };
      pushSnapshot();
    },
    setIsOpeningTemplateEditor: (nextValue) => {
      const isOpening = nextValue === true;
      isOpeningTemplateEditorRef.current = isOpening;
      controllerState = {
        ...controllerState,
        isOpeningTemplateEditor: isOpening,
      };
      pushSnapshot();
    },
    setTemplateFormState: (nextValue) => {
      templateFormStateRef.current = nextValue;
      controllerState = {
        ...controllerState,
        templateFormState: nextValue,
      };
      pushSnapshot();
    },
    setTemplatePreviewStatus: (updater) => {
      controllerState = {
        ...controllerState,
        templatePreviewStatus:
          typeof updater === "function"
            ? updater(controllerState.templatePreviewStatus)
            : updater,
      };
      pushSnapshot();
    },
    setTemplatePreviewCacheById: (updater) => {
      const nextValue =
        typeof updater === "function"
          ? updater(controllerState.templatePreviewCacheById)
          : updater;
      templatePreviewCacheRef.current = nextValue;
      controllerState = {
        ...controllerState,
        templatePreviewCacheById: nextValue,
      };
      pushSnapshot();
    },
  });

  return {
    controller,
    snapshots,
    openDraftInEditorCalls,
    getState() {
      return snapshotControllerState(controllerState);
    },
    getDerivedViewState() {
      return resolveDashboardTemplateModalViewState({
        selectedTemplate: controllerState.selectedTemplate,
        templatePreviewCacheById: controllerState.templatePreviewCacheById,
        templatePreviewStatus: controllerState.templatePreviewStatus,
        templateFormState: controllerState.templateFormState,
      });
    },
  };
}

test("stale template detail loads cannot overwrite the latest selection session", async () => {
  const firstTemplateRequest = createDeferred();
  const secondTemplateRequest = createDeferred();
  const fullOldTemplate = createFullTemplate({
    id: "tpl-1",
    nombre: "Plantilla vieja",
    defaults: {
      event_name: "Vieja",
    },
  });
  const fullNewTemplate = createFullTemplate({
    id: "tpl-1",
    nombre: "Plantilla nueva",
    defaults: {
      event_name: "Nueva",
    },
  });
  let templateRequestCount = 0;
  const harness = createControllerHarness({
    dependencyOverrides: {
      getTemplateById: async () => {
        templateRequestCount += 1;
        return templateRequestCount === 1
          ? firstTemplateRequest.promise
          : secondTemplateRequest.promise;
      },
      generatePreviewHtml: async () => "<html>preview</html>",
      resolvePreviewSource: () => ({
        mode: "generated",
        previewUrl: null,
      }),
    },
  });

  harness.controller.openTemplateModal(createCatalogTemplate());
  harness.controller.openTemplateModal(
    createCatalogTemplate({
      nombre: "Plantilla catalogo reabierta",
    })
  );
  await flushMicrotasks();

  secondTemplateRequest.resolve(fullNewTemplate);
  await flushMicrotasks();

  assert.equal(harness.getState().selectedTemplate?.nombre, "Plantilla nueva");
  assert.deepEqual(harness.getDerivedViewState().selectedTemplateFormState, {
    rawValues: {
      event_name: "Nueva",
    },
    touchedKeys: [],
  });

  firstTemplateRequest.resolve(fullOldTemplate);
  await flushMicrotasks();

  assert.equal(harness.getState().selectedTemplate?.nombre, "Plantilla nueva");
  assert.deepEqual(harness.getDerivedViewState().selectedTemplateFormState, {
    rawValues: {
      event_name: "Nueva",
    },
    touchedKeys: [],
  });
});

test("preview html stays cached by template id across modal close and reopen", async () => {
  let previewGenerationCount = 0;
  const fullTemplate = createFullTemplate({
    id: "tpl-cache",
    nombre: "Plantilla cache",
  });
  const harness = createControllerHarness({
    dependencyOverrides: {
      getTemplateById: async () => fullTemplate,
      generatePreviewHtml: async () => {
        previewGenerationCount += 1;
        return "<html>cached-preview</html>";
      },
      resolvePreviewSource: () => ({
        mode: "generated",
        previewUrl: null,
      }),
    },
  });

  harness.controller.openTemplateModal(
    createCatalogTemplate({
      id: "tpl-cache",
      nombre: "Plantilla cache",
    })
  );
  await flushMicrotasks();

  assert.equal(previewGenerationCount, 1);
  assert.equal(
    harness.getDerivedViewState().selectedTemplatePreviewHtml,
    "<html>cached-preview</html>"
  );
  assert.deepEqual(
    harness.getDerivedViewState().selectedTemplatePreviewState,
    {
      status: "ready",
      error: "",
    }
  );

  harness.controller.closeTemplateModal();
  await flushMicrotasks();

  assert.equal(harness.getState().isTemplateModalOpen, false);

  harness.controller.openTemplateModal(
    createCatalogTemplate({
      id: "tpl-cache",
      nombre: "Plantilla cache",
    })
  );
  await flushMicrotasks();

  assert.equal(previewGenerationCount, 1);
  assert.equal(
    harness.getDerivedViewState().selectedTemplatePreviewHtml,
    "<html>cached-preview</html>"
  );
  assert.deepEqual(
    harness.getDerivedViewState().selectedTemplatePreviewState,
    {
      status: "ready",
      error: "",
    }
  );
});

test("preview html regenerates when the same template id changes CTA runtime inputs", async () => {
  let templateRequestCount = 0;
  let previewGenerationCount = 0;
  const firstTemplate = createFullTemplate({
    id: "tpl-rsvp",
    nombre: "Plantilla sin RSVP listo",
    objetos: [
      {
        id: "cta-rsvp",
        tipo: "rsvp-boton",
        seccionId: "sec-1",
        texto: "Confirmar asistencia",
      },
    ],
    rsvp: null,
  });
  const secondTemplate = createFullTemplate({
    id: "tpl-rsvp",
    nombre: "Plantilla con RSVP listo",
    objetos: [
      {
        id: "cta-rsvp",
        tipo: "rsvp-boton",
        seccionId: "sec-1",
        texto: "Confirmar asistencia",
      },
    ],
    rsvp: {
      enabled: true,
      title: "Confirmacion",
    },
  });
  const harness = createControllerHarness({
    dependencyOverrides: {
      getTemplateById: async () => {
        templateRequestCount += 1;
        return templateRequestCount === 1 ? firstTemplate : secondTemplate;
      },
      generatePreviewHtml: async (template) => {
        previewGenerationCount += 1;
        return template?.rsvp
          ? "<html><body><button data-rsvp-open>RSVP</button><div id=\"modal-rsvp\"></div></body></html>"
          : "<html><body><button class=\"rsvp-boton\">RSVP</button></body></html>";
      },
      resolvePreviewSource: () => ({
        mode: "generated",
        previewUrl: null,
      }),
    },
  });

  harness.controller.openTemplateModal(
    createCatalogTemplate({
      id: "tpl-rsvp",
      nombre: "Plantilla con RSVP",
    })
  );
  await flushMicrotasks();

  assert.equal(previewGenerationCount, 1);
  assert.equal(
    harness.getDerivedViewState().selectedTemplatePreviewHtml.includes(
      "modal-rsvp"
    ),
    false
  );

  harness.controller.closeTemplateModal();
  await flushMicrotasks();

  harness.controller.openTemplateModal(
    createCatalogTemplate({
      id: "tpl-rsvp",
      nombre: "Plantilla con RSVP",
    })
  );
  await flushMicrotasks();

  assert.equal(previewGenerationCount, 2);
  assert.equal(harness.getState().selectedTemplate?.rsvp?.enabled, true);
  assert.equal(
    harness.getDerivedViewState().selectedTemplatePreviewHtml.includes(
      "modal-rsvp"
    ),
    true
  );
});

test("opening the editor with changes preserves the current draft creation and handoff contract", async () => {
  const createDraftCalls = [];
  const reportCalls = [];
  const fullTemplate = createFullTemplate({
    id: "tpl-open-with",
    nombre: "Plantilla con cambios",
  });
  const harness = createControllerHarness({
    dependencyOverrides: {
      getTemplateById: async () => fullTemplate,
      generatePreviewHtml: async () => "<html>preview</html>",
      resolvePreviewSource: () => ({
        mode: "generated",
        previewUrl: null,
      }),
      createDraftFromTemplateWithInput: async (payload) => {
        createDraftCalls.push(payload);
        return {
          slug: "draft-with-changes",
        };
      },
      reportTemplateEditorOpened: (payload) => {
        reportCalls.push(payload);
      },
    },
  });

  harness.controller.openTemplateModal(
    createCatalogTemplate({
      id: "tpl-open-with",
      nombre: "Plantilla con cambios",
    })
  );
  await flushMicrotasks();

  await harness.controller.handleOpenEditorWithChanges({
    rawValues: {
      event_name: "Mara y Nico",
    },
    touchedKeys: ["event_name"],
    galleryFilesByField: {
      gallery_main: ["img-1"],
    },
    previewTextPositions: {
      "obj-1": {
        x: 10,
      },
    },
  });
  await flushMicrotasks();

  assert.deepEqual(createDraftCalls, [
    {
      template: fullTemplate,
      userId: "user-1",
      rawValues: {
        event_name: "Mara y Nico",
      },
      touchedKeys: ["event_name"],
      galleryFilesByField: {
        gallery_main: ["img-1"],
      },
      previewTextPositions: {
        "obj-1": {
          x: 10,
        },
      },
      applyChanges: true,
    },
  ]);
  assert.deepEqual(reportCalls, [
    {
      slug: "draft-with-changes",
      templateId: "tpl-open-with",
      applyChanges: true,
    },
  ]);
  assert.deepEqual(harness.openDraftInEditorCalls, ["draft-with-changes"]);
  assert.equal(harness.getState().isTemplateModalOpen, false);
  assert.equal(harness.getState().isOpeningTemplateEditor, false);
  assert.equal(harness.getState().selectedTemplate, null);
  assert.equal(
    harness.snapshots.some(
      (snapshot) => snapshot.isOpeningTemplateEditor === true
    ),
    true
  );
});

test("opening the editor without changes keeps the current payload normalization and source semantics", async () => {
  const createDraftCalls = [];
  const reportCalls = [];
  const fullTemplate = createFullTemplate({
    id: "tpl-open-without",
    nombre: "Plantilla sin cambios",
  });
  const harness = createControllerHarness({
    dependencyOverrides: {
      getTemplateById: async () => fullTemplate,
      generatePreviewHtml: async () => "<html>preview</html>",
      resolvePreviewSource: () => ({
        mode: "generated",
        previewUrl: null,
      }),
      createDraftFromTemplateWithInput: async (payload) => {
        createDraftCalls.push(payload);
        return {
          slug: "draft-without-changes",
        };
      },
      reportTemplateEditorOpened: (payload) => {
        reportCalls.push(payload);
      },
    },
  });

  harness.controller.openTemplateModal(
    createCatalogTemplate({
      id: "tpl-open-without",
      nombre: "Plantilla sin cambios",
    })
  );
  await flushMicrotasks();

  await harness.controller.handleOpenEditorWithoutChanges();
  await flushMicrotasks();

  assert.deepEqual(createDraftCalls, [
    {
      template: fullTemplate,
      userId: "user-1",
      rawValues: {},
      touchedKeys: [],
      galleryFilesByField: {},
      previewTextPositions: null,
      applyChanges: false,
    },
  ]);
  assert.deepEqual(reportCalls, [
    {
      slug: "draft-without-changes",
      templateId: "tpl-open-without",
      applyChanges: false,
    },
  ]);
  assert.deepEqual(harness.openDraftInEditorCalls, ["draft-without-changes"]);
});

test("draft creation failure keeps the modal open, preserves the alert copy, and blocks manual close while opening", async () => {
  const createDraftDeferred = createDeferred();
  const alertCalls = [];
  const fullTemplate = createFullTemplate({
    id: "tpl-failure",
    nombre: "Plantilla con error",
  });
  const harness = createControllerHarness({
    dependencyOverrides: {
      getTemplateById: async () => fullTemplate,
      generatePreviewHtml: async () => "<html>preview</html>",
      resolvePreviewSource: () => ({
        mode: "generated",
        previewUrl: null,
      }),
      createDraftFromTemplateWithInput: async () => createDraftDeferred.promise,
      showAlert: (message) => {
        alertCalls.push(message);
      },
      logTemplateEditorError: () => {},
    },
  });

  harness.controller.openTemplateModal(
    createCatalogTemplate({
      id: "tpl-failure",
      nombre: "Plantilla con error",
    })
  );
  await flushMicrotasks();

  const openPromise = harness.controller.handleOpenEditorWithoutChanges();
  await flushMicrotasks();

  assert.equal(harness.getState().isOpeningTemplateEditor, true);
  assert.equal(harness.getState().isTemplateModalOpen, true);

  harness.controller.closeTemplateModal();
  await flushMicrotasks();

  assert.equal(harness.getState().isTemplateModalOpen, true);

  createDraftDeferred.reject({});
  await openPromise;
  await flushMicrotasks();

  assert.deepEqual(alertCalls, [
    "No se pudo abrir la plantilla en el editor.",
  ]);
  assert.equal(harness.getState().isTemplateModalOpen, true);
  assert.equal(harness.getState().isOpeningTemplateEditor, false);
});
