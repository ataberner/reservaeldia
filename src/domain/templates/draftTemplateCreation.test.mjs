import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplateCopyId,
  composeDraftTemplateCreationPayload,
} from "./draftTemplateCreation.js";

test("template copy ids are unique derivatives of the authorized draft slug", () => {
  assert.equal(
    buildTemplateCopyId({ draftSlug: "draft-1", timestamp: 1234 }),
    "draft-1-template-1234"
  );
  assert.equal(buildTemplateCopyId({ draftSlug: "", timestamp: 1234 }), "");
});

test("template creation overlays the live render snapshot on the authorized draft", () => {
  const calls = [];
  const result = composeDraftTemplateCreationPayload({
    draftData: {
      nombre: "Borrador original",
      objetos: [{ id: "stored" }],
      secciones: [{ id: "stored-section" }],
      templateAuthoringDraft: {
        status: { isReady: true },
        fieldsSchema: [{ key: "stored-field" }],
      },
    },
    liveEditorSnapshot: {
      objetos: [{ id: "live" }],
      secciones: [{ id: "live-section" }],
      rsvp: { enabled: true },
      gifts: { enabled: false },
    },
    runtimeAuthoringStatus: { isReady: true, issues: [] },
    runtimeAuthoringSnapshot: {
      fieldsSchema: [{ key: "runtime-field" }],
    },
    buildPayload: (input) => {
      calls.push(input);
      return { nombre: input.draftData.nombre };
    },
  });

  assert.deepEqual(result.preparedDraft.objetos, [{ id: "live" }]);
  assert.deepEqual(result.preparedDraft.secciones, [{ id: "live-section" }]);
  assert.deepEqual(result.authoringStatusToValidate, {
    isReady: true,
    issues: [],
  });
  assert.deepEqual(calls[0].authoringState, {
    fieldsSchema: [{ key: "runtime-field" }],
  });
  assert.deepEqual(result.payload, { nombre: "Borrador original" });
});

test("stored authoring remains the fallback when read-only runtime state is absent", () => {
  const storedAuthoring = {
    status: { isReady: true, issues: [] },
    fieldsSchema: [{ key: "stored-field" }],
  };
  const result = composeDraftTemplateCreationPayload({
    draftData: {
      templateAuthoringDraft: storedAuthoring,
      objetos: [],
      secciones: [],
    },
    buildPayload: ({ authoringState }) => ({ authoringState }),
  });

  assert.deepEqual(result.authoringStatusToValidate, storedAuthoring.status);
  assert.deepEqual(result.payload.authoringState, storedAuthoring);
});

test("template creation rejects duplicate identities from a read-only live snapshot", () => {
  assert.throws(
    () =>
      composeDraftTemplateCreationPayload({
        draftData: {
          objetos: [{ id: "stored-object", tipo: "texto" }],
          secciones: [],
        },
        liveEditorSnapshot: {
          objetos: [
            {
              id: "group-1",
              tipo: "grupo",
              children: [{ id: "duplicated-text", tipo: "texto" }],
            },
            { id: "duplicated-text", tipo: "texto" },
          ],
          secciones: [],
        },
        buildPayload: () => ({ nombre: "No debe crearse" }),
      }),
    /borrador contiene ids de objeto duplicados \(duplicated-text\)/
  );
});
