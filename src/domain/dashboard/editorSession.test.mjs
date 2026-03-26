import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardAsPathFromQuery,
  buildLegacyDraftNotice,
  createAdminDraftViewState,
  createDashboardEditorSession,
  createTemplateWorkspaceViewState,
  normalizeDashboardAsPath,
  normalizeTemplateWorkspaceFromDraft,
  recoverQueryFromCorruptedSlug,
  resolveCompatibleDraftForDashboardEditor,
} from "./editorSession.js";

test("dashboard path helpers keep shallow-router normalization stable", () => {
  assert.equal(normalizeDashboardAsPath("/dashboard/?b=2&a=1#hash"), "/dashboard?b=2&a=1");
  assert.equal(
    buildDashboardAsPathFromQuery({
      b: "2",
      a: "1",
      empty: " ",
    }),
    "/dashboard?a=1&b=2"
  );
});

test("dashboard editor session factories preserve current shapes", () => {
  assert.deepEqual(createAdminDraftViewState({ slug: "draft-1" }), {
    enabled: false,
    status: "idle",
    ownerUid: "",
    slug: "draft-1",
    draftData: null,
    draftName: "",
  });
  assert.deepEqual(createTemplateWorkspaceViewState({ templateId: "tpl-1" }), {
    enabled: false,
    status: "idle",
    templateId: "tpl-1",
    readOnly: false,
    draftName: "",
    templateName: "",
    estadoEditorial: "",
    permissions: {},
    initialData: null,
  });
  assert.deepEqual(createDashboardEditorSession({ kind: "template" }), {
    kind: "template",
    id: "",
  });
});

test("template workspace normalization preserves current template-edit detection", () => {
  const normalized = normalizeTemplateWorkspaceFromDraft({
    nombre: "Workspace draft",
    templateWorkspace: {
      templateId: "template-1",
      mode: "template_edit",
      readOnly: true,
      templateName: "Plantilla 1",
      estadoEditorial: "en_proceso",
      permissions: {
        readOnly: true,
      },
    },
  });

  assert.deepEqual(normalized, {
    enabled: true,
    templateId: "template-1",
    readOnly: true,
    draftName: "Workspace draft",
    templateName: "Plantilla 1",
    estadoEditorial: "en_proceso",
    permissions: {
      readOnly: true,
    },
  });
});

test("legacy draft notice and corrupted slug recovery keep compatibility messaging", () => {
  assert.deepEqual(buildLegacyDraftNotice("draft-legacy", { nombre: "Boda vieja" }), {
    slug: "draft-legacy",
    title: "Este borrador usa un formato antiguo",
    body: 'El borrador "Boda vieja" no se puede abrir en el dashboard actual porque no tiene estructura moderna de secciones y objetos.',
  });

  assert.deepEqual(
    recoverQueryFromCorruptedSlug("draft%20uno?adminView=1&ownerUid=user_123"),
    {
      adminView: "1",
      ownerUid: "user_123",
    }
  );
});

test("resolveCompatibleDraftForDashboardEditor preserves legacy detection and public->draft fallback", async () => {
  const drafts = new Map([
    [
      "draft-editable",
      {
        userId: "user-1",
        objetos: [{ id: "obj-1" }],
        secciones: [{ id: "sec-1" }],
      },
    ],
    [
      "draft-legacy",
      {
        userId: "user-1",
      },
    ],
  ]);
  const publications = new Map([
    [
      "public-slug",
      {
        userId: "user-1",
        borradorSlug: "draft-editable",
      },
    ],
  ]);

  const readDraftBySlug = async (slug) => ({
    id: slug,
    exists: () => drafts.has(slug),
    data: () => drafts.get(slug) || null,
  });
  const readPublicationBySlug = async (slug) => ({
    id: slug,
    exists: () => publications.has(slug),
    data: () => publications.get(slug) || null,
  });

  const viaPublication = await resolveCompatibleDraftForDashboardEditor({
    slug: "public-slug",
    uid: "user-1",
    readDraftBySlug,
    readPublicationBySlug,
  });
  assert.deepEqual(viaPublication, {
    status: "ok",
    slug: "draft-editable",
    draftData: {
      userId: "user-1",
      objetos: [{ id: "obj-1" }],
      secciones: [{ id: "sec-1" }],
    },
  });

  const legacy = await resolveCompatibleDraftForDashboardEditor({
    slug: "draft-legacy",
    uid: "user-1",
    readDraftBySlug,
    readPublicationBySlug,
  });
  assert.deepEqual(legacy, {
    status: "legacy",
    slug: "draft-legacy",
    draftData: {
      userId: "user-1",
    },
  });
});
