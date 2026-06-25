import test from "node:test";
import assert from "node:assert/strict";

import {
  createEditorSessionPersistence,
} from "./editorSessionPersistenceCore.js";

test("draft snapshot persistence writes a borradores patch with draft metadata", async () => {
  const writes = [];
  const persistence = createEditorSessionPersistence({
    writeDraftPatch: async (entry) => writes.push(entry),
    createTimestamp: () => "ts",
  });

  await persistence.persistEditorSessionSnapshot({
    state: {
      slug: "draft-1",
      editorSession: { kind: "draft", id: "draft-1" },
    },
    reason: "autosave",
    patch: {
      objetos: [{ id: "obj-1" }],
      secciones: [{ id: "sec-1" }],
      rsvp: null,
      gifts: null,
    },
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].draftId, "draft-1");
  assert.equal(writes[0].patch.draftContentMeta.lastWriter, "canvas");
  assert.equal(writes[0].patch.draftContentMeta.lastReason, "autosave");
  assert.equal(writes[0].patch.draftContentMeta.updatedAt, "ts");
  assert.equal(writes[0].patch.ultimaEdicion, "ts");
});

test("template snapshot persistence uses template callable payload and never writes draft", async () => {
  const draftWrites = [];
  const templateWrites = [];
  const persistence = createEditorSessionPersistence({
    writeDraftPatch: async (entry) => draftWrites.push(entry),
    writeTemplateDocument: async (entry) => templateWrites.push(entry),
  });

  await persistence.persistEditorSessionSnapshot({
    state: {
      slug: "template-1",
      editorSession: { kind: "template", id: "template-1" },
    },
    reason: "autosave",
    patch: {
      objetos: [{ id: "obj-1" }],
      secciones: [{ id: "sec-1" }],
      draftContentMeta: { lastReason: "autosave" },
      ultimaEdicion: "ts",
    },
  });

  assert.equal(draftWrites.length, 0);
  assert.deepEqual(templateWrites, [
    {
      templateId: "template-1",
      document: {
        objetos: [{ id: "obj-1" }],
        secciones: [{ id: "sec-1" }],
      },
    },
  ]);
});

test("template read uses editor document callable and never draft read", async () => {
  const draftReads = [];
  const templateReads = [];
  const persistence = createEditorSessionPersistence({
    readDraftDocument: async (entry) => {
      draftReads.push(entry);
      return null;
    },
    readTemplateEditorDocument: async (entry) => {
      templateReads.push(entry);
      return {
        editorDocument: {
          objetos: [{ id: "obj-1" }],
        },
      };
    },
  });

  const result = await persistence.readEditorSessionDocument({
    session: { kind: "template", id: "template-1" },
    slug: "template-1",
  });

  assert.equal(result.exists, true);
  assert.deepEqual(result.data.objetos, [{ id: "obj-1" }]);
  assert.equal(draftReads.length, 0);
  assert.deepEqual(templateReads, [{ templateId: "template-1" }]);
});

test("unsupported editor sessions fail closed before persistence", async () => {
  const writes = [];
  const persistence = createEditorSessionPersistence({
    writeDraftPatch: async (entry) => writes.push(entry),
    writeTemplateDocument: async (entry) => writes.push(entry),
  });

  await assert.rejects(
    () =>
      persistence.persistEditorSessionPatch({
        session: { kind: "preview", id: "preview-1" },
        slug: "preview-1",
        patch: {
          secciones: [],
        },
      }),
    {
      code: "unsupported-session-kind",
    }
  );
  assert.equal(writes.length, 0);
});

test("draft persistence strips undefined values before writing", async () => {
  const writes = [];
  const persistence = createEditorSessionPersistence({
    writeDraftPatch: async (entry) => writes.push(entry),
    createTimestamp: () => "ts",
  });

  await persistence.persistEditorSessionPatch({
    session: { kind: "draft", id: "draft-1" },
    slug: "draft-1",
    reason: "undefined-strip",
    patch: {
      nombre: undefined,
      objetos: [
        {
          id: "obj-1",
          optional: undefined,
        },
      ],
    },
  });

  assert.equal("nombre" in writes[0].patch, false);
  assert.equal("optional" in writes[0].patch.objetos[0], false);
  assert.equal(writes[0].patch.draftContentMeta.lastReason, "undefined-strip");
});
