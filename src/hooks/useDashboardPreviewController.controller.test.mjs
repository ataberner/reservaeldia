import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPreviewDisplayUrl,
  createPublicationPreviewState,
  PREVIEW_AUTHORITY,
} from "../domain/dashboard/previewSession.js";
import { createDashboardPreviewControllerRuntime } from "./useDashboardPreviewController.js";

const DEFAULT_TEST_OPTIONS = Object.freeze({
  slugInvitacion: "draft-1",
  modoEditor: "edicion",
  editorSession: {
    kind: "draft",
    id: "draft-1",
  },
});

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
}

function snapshotPreviewState(previewState, slugInvitacion) {
  const normalizedPreviewState = createPublicationPreviewState(previewState);

  return {
    ...normalizedPreviewState,
    previewDisplayUrl: buildPreviewDisplayUrl({
      isTemplateEditorSession: false,
      urlPublicadaReciente: normalizedPreviewState.urlPublicadaReciente,
      urlPublicaVistaPrevia: normalizedPreviewState.urlPublicaVistaPrevia,
      slugPublicoVistaPrevia: normalizedPreviewState.slugPublicoVistaPrevia,
      slugInvitacion,
    }),
  };
}

function createExpectedDraftControllerState({
  slugInvitacion = DEFAULT_TEST_OPTIONS.slugInvitacion,
  overrides = {},
} = {}) {
  return snapshotPreviewState(overrides, slugInvitacion);
}

function createTestDependencies(overrides = {}) {
  return {
    runInlineCriticalBoundary: async () => ({
      ok: true,
      settled: true,
      handled: false,
      activeId: null,
    }),
    runCriticalActionFlush: async () => ({ ok: true }),
    runPreviewPipeline: async () => ({
      status: "success",
      htmlGenerado: "<html>preview</html>",
      urlPublicaDetectada: "",
      slugPublicoDetectado: "",
      publicacionNoVigenteDetectada: false,
    }),
    runPublishValidation: async () => null,
    resolvePublishAction: () => ({ status: "ready" }),
    schedulePublishedAuditCapture: () => {},
    showAlert: () => {},
    ...overrides,
  };
}

function compactPendingSequence(snapshots) {
  const sequence = [];

  snapshots.forEach((snapshot) => {
    const nextValue = Boolean(snapshot?.publishValidationPending);
    if (sequence[sequence.length - 1] !== nextValue) {
      sequence.push(nextValue);
    }
  });

  return sequence;
}

function createControllerHarness({
  options = DEFAULT_TEST_OPTIONS,
  dependencyOverrides = {},
} = {}) {
  let previewState = createPublicationPreviewState();
  const previewStateRef = {
    current: previewState,
  };
  const snapshots = [snapshotPreviewState(previewState, options.slugInvitacion)];
  const controller = createDashboardPreviewControllerRuntime({
    ...options,
    dependencyOverrides,
    previewStateRef,
    setPreviewState: (updater) => {
      previewState =
        typeof updater === "function" ? updater(previewState) : updater;
      previewStateRef.current = previewState;
      snapshots.push(snapshotPreviewState(previewState, options.slugInvitacion));
      return previewState;
    },
  });

  return {
    controller,
    snapshots,
    getState() {
      return snapshotPreviewState(previewState, options.slugInvitacion);
    },
  };
}

test("preview open success keeps the preview visible before html generation settles and then patches the resolved preview state", async () => {
  const previewPipeline = createDeferred();
  const showAlertCalls = [];
  const inlineBoundaryCalls = [];
  const flushCalls = [];
  const previewPipelineCalls = [];
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runInlineCriticalBoundary: async (input) => {
        inlineBoundaryCalls.push(input);
        return {
          ok: true,
          settled: true,
          handled: true,
          activeId: "text-1",
        };
      },
      runCriticalActionFlush: async (input) => {
        assert.equal(inlineBoundaryCalls.length, 1);
        flushCalls.push(input);
        return {
          ok: true,
          compatibilitySnapshot: {
            source: "flush-boundary",
          },
        };
      },
      runPreviewPipeline: async (input) => {
        previewPipelineCalls.push(input);
        return previewPipeline.promise;
      },
      showAlert: (message) => {
        showAlertCalls.push(message);
      },
    }),
  });

  const previewPromise = harness.controller.generarVistaPrevia();
  await flushMicrotasks();

  assert.deepEqual(inlineBoundaryCalls, [
    {
      slugInvitacion: "draft-1",
      modoEditor: "edicion",
      editorSession: {
        kind: "draft",
        id: "draft-1",
      },
      reason: "preview-before-open",
      maxWaitMs: 120,
    },
  ]);
  assert.deepEqual(flushCalls.map((call) => call.reason), ["preview-before-open"]);
  assert.equal(previewPipelineCalls.length, 1);
  assert.deepEqual(previewPipelineCalls[0].previewBoundarySnapshot, {
    source: "flush-boundary",
  });
  assert.equal(harness.getState().mostrarVistaPrevia, true);
  assert.equal(harness.getState().htmlVistaPrevia, null);
  assert.equal(
    harness.snapshots.some(
      (snapshot) =>
        snapshot.mostrarVistaPrevia === true && snapshot.htmlVistaPrevia === null
    ),
    true
  );

  previewPipeline.resolve({
    status: "success",
    previewAuthority: PREVIEW_AUTHORITY.DRAFT_AUTHORITATIVE,
    htmlGenerado: "<html>preview-open</html>",
    urlPublicaDetectada: "https://reservaeldia.com.ar/i/publico-1",
    slugPublicoDetectado: "publico-1",
    publicacionNoVigenteDetectada: false,
  });
  await previewPromise;
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-open</html>",
        previewAuthority: PREVIEW_AUTHORITY.DRAFT_AUTHORITATIVE,
        urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/publico-1",
        slugPublicoVistaPrevia: "publico-1",
        puedeActualizarPublicacion: true,
      },
    })
  );
  assert.deepEqual(showAlertCalls, []);
});

test("preview open failure on flush keeps the preview closed and preserves the controller error path", async () => {
  let previewPipelineCalled = false;
  const showAlertCalls = [];
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runCriticalActionFlush: async () => ({
        ok: false,
        error: "No se pudo sincronizar",
      }),
      runPreviewPipeline: async () => {
        previewPipelineCalled = true;
        return {
          status: "success",
        };
      },
      showAlert: (message) => {
        showAlertCalls.push(message);
      },
    }),
  });

  await harness.controller.generarVistaPrevia();
  await flushMicrotasks();

  assert.equal(previewPipelineCalled, false);
  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        publicacionVistaPreviaError: "No se pudo sincronizar",
      },
    })
  );
  assert.deepEqual(showAlertCalls, []);
});

test("preview open with prepared-render blockers closes the preview and stores validation", async () => {
  const validation = {
    canPublish: false,
    blockers: [{ code: "missing-section-reference" }],
    warnings: [],
    summary: {
      blockerCount: 1,
      warningCount: 0,
      blockingMessage: "No se puede publicar todavia: falta una seccion.",
      warningMessage: "",
    },
  };
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runPreviewPipeline: async () => ({
        status: "blocked",
        previewAuthority: PREVIEW_AUTHORITY.DRAFT_AUTHORITATIVE,
        validation,
        blockingMessage: validation.summary.blockingMessage,
      }),
      resolvePublishAction: ({ validationResult }) => {
        assert.equal(validationResult, validation);
        return {
          status: "blocked",
          blockingMessage: validation.summary.blockingMessage,
        };
      },
    }),
  });

  await harness.controller.generarVistaPrevia();
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        publicacionVistaPreviaError:
          "No se puede publicar todavia: falta una seccion.",
        previewAuthority: PREVIEW_AUTHORITY.DRAFT_AUTHORITATIVE,
        publishValidationResult: validation,
      },
    })
  );
});

test("inline boundary failure stops preview before flush and preserves the controller error path", async () => {
  let flushCalled = false;
  let previewPipelineCalled = false;
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runInlineCriticalBoundary: async () => ({
        ok: false,
        settled: false,
        handled: true,
        activeId: "text-1",
        reason: "inline-session-still-active",
        error: "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente.",
      }),
      runCriticalActionFlush: async () => {
        flushCalled = true;
        return { ok: true };
      },
      runPreviewPipeline: async () => {
        previewPipelineCalled = true;
        return {
          status: "success",
        };
      },
    }),
  });

  await harness.controller.generarVistaPrevia();
  await flushMicrotasks();

  assert.equal(flushCalled, false);
  assert.equal(previewPipelineCalled, false);
  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        publicacionVistaPreviaError:
          "No se pudo cerrar la edicion de texto en curso. Intenta nuevamente.",
      },
    })
  );
});

test("stale preview completions cannot overwrite a newer preview-open session", async () => {
  const firstPreview = createDeferred();
  const secondPreview = createDeferred();
  const previewCalls = [];
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runPreviewPipeline: async (input) => {
        previewCalls.push(input);
        return previewCalls.length === 1 ? firstPreview.promise : secondPreview.promise;
      },
    }),
  });

  const firstPreviewPromise = harness.controller.generarVistaPrevia();
  await flushMicrotasks();
  const secondPreviewPromise = harness.controller.generarVistaPrevia();
  await flushMicrotasks();

  assert.equal(previewCalls.length, 2);

  firstPreview.resolve({
    status: "success",
    htmlGenerado: "<html>preview-stale</html>",
    urlPublicaDetectada: "https://reservaeldia.com.ar/i/publico-stale",
    slugPublicoDetectado: "publico-stale",
    publicacionNoVigenteDetectada: false,
  });
  await firstPreviewPromise;
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
      },
    })
  );

  secondPreview.resolve({
    status: "success",
    htmlGenerado: "<html>preview-current</html>",
    urlPublicaDetectada: "https://reservaeldia.com.ar/i/publico-current",
    slugPublicoDetectado: "publico-current",
    publicacionNoVigenteDetectada: false,
  });
  await secondPreviewPromise;
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-current</html>",
        urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/publico-current",
        slugPublicoVistaPrevia: "publico-current",
        puedeActualizarPublicacion: true,
      },
    })
  );
});

test("preview success refreshes publish validation and preserves the current pending-to-settled sequence", async () => {
  const validationDeferred = createDeferred();
  const validationCalls = [];
  const validationResult = {
    blockers: [],
    warnings: [
      {
        code: "warning-preview",
      },
    ],
  };
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runPreviewPipeline: async () => ({
        status: "success",
        htmlGenerado: "<html>preview-validation</html>",
        urlPublicaDetectada: "",
        slugPublicoDetectado: "",
        publicacionNoVigenteDetectada: false,
      }),
      runPublishValidation: async (input) => {
        validationCalls.push(input);
        return validationDeferred.promise;
      },
    }),
  });

  const previewPromise = harness.controller.generarVistaPrevia();
  await previewPromise;
  await flushMicrotasks();

  assert.deepEqual(validationCalls, [
    {
      draftSlug: "draft-1",
      canUsePublishCompatibility: true,
    },
  ]);
  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-validation</html>",
        publishValidationPending: true,
      },
    })
  );

  validationDeferred.resolve(validationResult);
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-validation</html>",
        publishValidationResult: validationResult,
      },
    })
  );
  assert.deepEqual(compactPendingSequence(harness.snapshots), [false, true, false]);
});

test("checkout opens in update mode from preview and closeCheckout only hides the checkout modal", async () => {
  const inlineBoundaryCalls = [];
  const flushCalls = [];
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runInlineCriticalBoundary: async (input) => {
        inlineBoundaryCalls.push(input);
        return {
          ok: true,
          settled: true,
          handled: true,
          activeId: "text-1",
        };
      },
      runCriticalActionFlush: async (input) => {
        assert.equal(inlineBoundaryCalls.length, flushCalls.length + 1);
        flushCalls.push(input);
        return {
          ok: true,
        };
      },
      runPreviewPipeline: async () => ({
        status: "success",
        htmlGenerado: "<html>preview-checkout</html>",
        urlPublicaDetectada: "https://reservaeldia.com.ar/i/existente-1",
        slugPublicoDetectado: "existente-1",
        publicacionNoVigenteDetectada: false,
      }),
    }),
  });

  await harness.controller.generarVistaPrevia();
  await flushMicrotasks();
  await harness.controller.publicarDesdeVistaPrevia();
  await flushMicrotasks();

  assert.deepEqual(flushCalls.map((call) => call.reason), [
    "preview-before-open",
    "checkout-before-open",
  ]);
  assert.deepEqual(
    inlineBoundaryCalls.map((call) => call.reason),
    ["preview-before-open", "checkout-before-open"]
  );
  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-checkout</html>",
        urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/existente-1",
        slugPublicoVistaPrevia: "existente-1",
        puedeActualizarPublicacion: true,
        mostrarCheckoutPublicacion: true,
        operacionCheckoutPublicacion: "update",
      },
    })
  );

  harness.controller.closeCheckout();
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-checkout</html>",
        urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/existente-1",
        slugPublicoVistaPrevia: "existente-1",
        puedeActualizarPublicacion: true,
        operacionCheckoutPublicacion: "update",
      },
    })
  );
});

test("handleCheckoutPublished preserves the current new and update success patch semantics and audit fallback html", async () => {
  const auditCalls = [];
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runPreviewPipeline: async () => ({
        status: "success",
        htmlGenerado: "<html>preview-published</html>",
        urlPublicaDetectada: "",
        slugPublicoDetectado: "",
        publicacionNoVigenteDetectada: false,
      }),
      schedulePublishedAuditCapture: (payload) => {
        auditCalls.push(payload);
      },
    }),
  });

  await harness.controller.generarVistaPrevia();
  await flushMicrotasks();

  harness.controller.handleCheckoutPublished({
    operation: "new",
    publicUrl: "https://reservaeldia.com.ar/i/publicado-1",
    publicSlug: "publicado-1",
  });
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-published</html>",
        urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/publicado-1",
        slugPublicoVistaPrevia: "publicado-1",
        puedeActualizarPublicacion: true,
        publicacionVistaPreviaOk: "Invitacion publicada correctamente.",
        urlPublicadaReciente: "https://reservaeldia.com.ar/i/publicado-1",
      },
    })
  );

  harness.controller.handleCheckoutPublished({
    operation: "update",
    publicUrl: "https://reservaeldia.com.ar/i/publicado-1",
    publicSlug: "publicado-1",
  });
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-published</html>",
        urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/publicado-1",
        slugPublicoVistaPrevia: "publicado-1",
        puedeActualizarPublicacion: true,
        publicacionVistaPreviaOk: "Invitacion actualizada correctamente.",
        urlPublicadaReciente: "https://reservaeldia.com.ar/i/publicado-1",
      },
    })
  );
  assert.deepEqual(auditCalls, [
    {
      publicUrl: "https://reservaeldia.com.ar/i/publicado-1",
      fallbackHtml: "<html>preview-published</html>",
    },
    {
      publicUrl: "https://reservaeldia.com.ar/i/publicado-1",
      fallbackHtml: "<html>preview-published</html>",
    },
  ]);
});

test("post-publish preview state keeps the final public URL after the checkout success modal closes", async () => {
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runPreviewPipeline: async () => ({
        status: "success",
        htmlGenerado: "<html>preview-post-publish</html>",
        urlPublicaDetectada: "",
        slugPublicoDetectado: "",
        publicacionNoVigenteDetectada: false,
      }),
    }),
  });

  await harness.controller.generarVistaPrevia();
  await flushMicrotasks();
  await harness.controller.publicarDesdeVistaPrevia();
  await flushMicrotasks();

  assert.equal(harness.getState().mostrarCheckoutPublicacion, true);
  assert.equal(harness.getState().operacionCheckoutPublicacion, "new");

  harness.controller.handleCheckoutPublished({
    operation: "new",
    publicUrl: "https://reservaeldia.com.ar/i/publicado-final",
    publicSlug: "publicado-final",
  });
  await flushMicrotasks();

  harness.controller.closeCheckout();
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
        htmlVistaPrevia: "<html>preview-post-publish</html>",
        urlPublicaVistaPrevia: "https://reservaeldia.com.ar/i/publicado-final",
        slugPublicoVistaPrevia: "publicado-final",
        puedeActualizarPublicacion: true,
        publicacionVistaPreviaOk: "Invitacion publicada correctamente.",
        urlPublicadaReciente: "https://reservaeldia.com.ar/i/publicado-final",
        operacionCheckoutPublicacion: "new",
      },
    })
  );
  assert.equal(
    harness.getState().previewDisplayUrl,
    "https://reservaeldia.com.ar/i/publicado-final"
  );
});

test("closePreview fully resets the controller state after preview, validation, checkout, and publish success", async () => {
  const validationResult = {
    blockers: [],
    summary: {
      blockingMessage: "",
    },
  };
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runPreviewPipeline: async () => ({
        status: "success",
        htmlGenerado: "<html>preview-reset</html>",
        urlPublicaDetectada: "https://reservaeldia.com.ar/i/publico-reset",
        slugPublicoDetectado: "publico-reset",
        publicacionNoVigenteDetectada: false,
      }),
      runPublishValidation: async () => validationResult,
    }),
  });

  await harness.controller.generarVistaPrevia();
  await flushMicrotasks();
  await harness.controller.publicarDesdeVistaPrevia();
  await flushMicrotasks();

  harness.controller.handleCheckoutPublished({
    operation: "update",
    publicUrl: "https://reservaeldia.com.ar/i/publico-reset",
    publicSlug: "publico-reset",
  });
  await flushMicrotasks();

  assert.equal(harness.getState().mostrarVistaPrevia, true);
  assert.equal(harness.getState().mostrarCheckoutPublicacion, true);
  assert.deepEqual(harness.getState().publishValidationResult, validationResult);
  assert.equal(
    harness.getState().publicacionVistaPreviaOk,
    "Invitacion actualizada correctamente."
  );

  harness.controller.closePreview();
  await flushMicrotasks();

  assert.deepEqual(harness.getState(), createExpectedDraftControllerState());
});

test("closePreview invalidates the active preview session so late async completions cannot repopulate the state", async () => {
  const previewPipeline = createDeferred();
  const harness = createControllerHarness({
    dependencyOverrides: createTestDependencies({
      runPreviewPipeline: async () => previewPipeline.promise,
    }),
  });

  const previewPromise = harness.controller.generarVistaPrevia();
  await flushMicrotasks();

  assert.deepEqual(
    harness.getState(),
    createExpectedDraftControllerState({
      overrides: {
        mostrarVistaPrevia: true,
      },
    })
  );

  harness.controller.closePreview();
  await flushMicrotasks();

  assert.deepEqual(harness.getState(), createExpectedDraftControllerState());

  previewPipeline.resolve({
    status: "success",
    htmlGenerado: "<html>preview-late</html>",
    urlPublicaDetectada: "https://reservaeldia.com.ar/i/publico-late",
    slugPublicoDetectado: "publico-late",
    publicacionNoVigenteDetectada: false,
  });
  await previewPromise;
  await flushMicrotasks();

  assert.deepEqual(harness.getState(), createExpectedDraftControllerState());
});
