import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardPreviewDebugSummary,
  runDashboardPreviewPipeline,
} from "./previewPipeline.js";

function createSnapshotRecord(id, data, exists = true) {
  return {
    id,
    exists: () => exists,
    data: () => data,
  };
}

test("draft preview pipeline rereads persisted data, prefers the boundary snapshot, and generates html with the detected public slug", async () => {
  let liveSnapshotReads = 0;
  let publicationLookupSlug = "";
  let slugOriginalQueries = 0;
  let generatorCall = null;
  let debugPayload = null;

  const previewResult = await runDashboardPreviewPipeline({
    slugInvitacion: "draft-preview-1",
    canUsePublishCompatibility: true,
    previewBoundarySnapshot: {
      objetos: [
        {
          id: "live-text-1",
          seccionId: "hero",
          tipo: "texto",
        },
      ],
      secciones: [
        {
          id: "hero",
        },
      ],
      rsvp: {
        enabled: true,
        title: "RSVP live",
      },
      gifts: {
        enabled: true,
        title: "Mesa live",
      },
    },
    readDraftDocument: async () =>
      createSnapshotRecord("draft-preview-1", {
        nombre: "Borrador persistido",
        publicationLifecycle: {
          activePublicSlug: "Mi Slug Publico",
        },
        objetos: [
          {
            id: "persisted-text-1",
            seccionId: "persisted",
            tipo: "texto",
          },
        ],
        secciones: [
          {
            id: "persisted",
          },
        ],
        rsvp: {
          enabled: false,
        },
      }),
    readLiveEditorSnapshot: () => {
      liveSnapshotReads += 1;
      return {
        objetos: [{ id: "ignored" }],
        secciones: [{ id: "ignored" }],
      };
    },
    readPublicationBySlug: async (publicSlug) => {
      publicationLookupSlug = publicSlug;
      return createSnapshotRecord(publicSlug, {
        urlPublica: "https://reservaeldia.com.ar/i/mi-slug-publico",
      });
    },
    queryPublicationBySlugOriginal: async () => {
      slugOriginalQueries += 1;
      return null;
    },
    onBeforeGenerateHtml: ({ previewPayload }) => {
      debugPayload = previewPayload;
    },
    generateHtmlFromSections: async (
      secciones,
      objetos,
      rsvpPreviewConfig,
      generatorOptions
    ) => {
      generatorCall = {
        secciones,
        objetos,
        rsvpPreviewConfig,
        generatorOptions,
      };
      return "<html>preview-draft</html>";
    },
  });

  assert.equal(previewResult.status, "success");
  assert.equal(previewResult.htmlGenerado, "<html>preview-draft</html>");
  assert.equal(
    previewResult.urlPublicaDetectada,
    "https://reservaeldia.com.ar/i/mi-slug-publico"
  );
  assert.equal(previewResult.slugPublicoDetectado, "mi-slug-publico");
  assert.equal(previewResult.publicacionNoVigenteDetectada, false);
  assert.equal(liveSnapshotReads, 0);
  assert.equal(publicationLookupSlug, "mi-slug-publico");
  assert.equal(slugOriginalQueries, 0);
  assert.equal(generatorCall.generatorOptions.slug, "mi-slug-publico");
  assert.deepEqual(generatorCall.secciones, [{ id: "hero" }]);
  assert.deepEqual(generatorCall.objetos, [
    {
      id: "live-text-1",
      seccionId: "hero",
      tipo: "texto",
    },
  ]);
  assert.equal(generatorCall.rsvpPreviewConfig.enabled, true);
  assert.equal(debugPayload.objetos[0].id, "live-text-1");
});

test("draft preview pipeline rereads persisted data and overlays the live editor snapshot when no boundary snapshot is available", async () => {
  let draftReads = 0;
  let liveSnapshotReads = 0;
  let generatorCall = null;

  const previewResult = await runDashboardPreviewPipeline({
    slugInvitacion: "draft-preview-live-overlay",
    readDraftDocument: async () => {
      draftReads += 1;
      return createSnapshotRecord("draft-preview-live-overlay", {
        objetos: [
          {
            id: "persisted-text-1",
            seccionId: "persisted",
            tipo: "texto",
          },
        ],
        secciones: [
          {
            id: "persisted",
          },
        ],
        rsvp: {
          enabled: false,
        },
      });
    },
    readLiveEditorSnapshot: () => {
      liveSnapshotReads += 1;
      return {
        objetos: [
          {
            id: "live-text-1",
            seccionId: "hero",
            tipo: "texto",
          },
        ],
        secciones: [
          {
            id: "hero",
          },
        ],
        rsvp: {
          enabled: true,
          title: "RSVP live overlay",
        },
      };
    },
    generateHtmlFromSections: async (
      secciones,
      objetos,
      rsvpPreviewConfig,
      generatorOptions
    ) => {
      generatorCall = {
        secciones,
        objetos,
        rsvpPreviewConfig,
        generatorOptions,
      };
      return "<html>preview-live-overlay</html>";
    },
  });

  assert.equal(previewResult.status, "success");
  assert.equal(previewResult.htmlGenerado, "<html>preview-live-overlay</html>");
  assert.equal(draftReads, 1);
  assert.equal(liveSnapshotReads, 1);
  assert.deepEqual(generatorCall.secciones, [{ id: "hero" }]);
  assert.deepEqual(generatorCall.objetos, [
    {
      id: "live-text-1",
      seccionId: "hero",
      tipo: "texto",
    },
  ]);
  assert.equal(generatorCall.rsvpPreviewConfig.enabled, true);
  assert.equal(generatorCall.generatorOptions.slug, "draft-preview-live-overlay");
});

test("template preview pipeline reads the template document and skips publication compatibility lookups", async () => {
  let liveSnapshotReads = 0;
  let publicationLookupCalls = 0;
  let slugOriginalQueries = 0;
  let generatorCall = null;

  const previewResult = await runDashboardPreviewPipeline({
    slugInvitacion: "template-workspace-1",
    isTemplateSession: true,
    canUsePublishCompatibility: false,
    readTemplateEditorDocument: async ({ templateId }) => {
      assert.equal(templateId, "template-workspace-1");
      return {
        editorDocument: {
          objetos: [
            {
              id: "template-text-1",
              seccionId: "hero",
              tipo: "texto",
            },
          ],
          secciones: [
            {
              id: "hero",
            },
          ],
        },
      };
    },
    readLiveEditorSnapshot: () => {
      liveSnapshotReads += 1;
      return null;
    },
    readPublicationBySlug: async () => {
      publicationLookupCalls += 1;
      return null;
    },
    queryPublicationBySlugOriginal: async () => {
      slugOriginalQueries += 1;
      return null;
    },
    generateHtmlFromSections: async (
      secciones,
      objetos,
      rsvpPreviewConfig,
      generatorOptions
    ) => {
      generatorCall = {
        secciones,
        objetos,
        rsvpPreviewConfig,
        generatorOptions,
      };
      return "<html>preview-template</html>";
    },
  });

  assert.equal(previewResult.status, "success");
  assert.equal(previewResult.htmlGenerado, "<html>preview-template</html>");
  assert.equal(previewResult.slugPublicoDetectado, "");
  assert.equal(previewResult.urlPublicaDetectada, "");
  assert.equal(previewResult.publicacionNoVigenteDetectada, false);
  assert.equal(liveSnapshotReads, 1);
  assert.equal(publicationLookupCalls, 0);
  assert.equal(slugOriginalQueries, 0);
  assert.equal(generatorCall.generatorOptions.slug, "template-workspace-1");
  assert.deepEqual(generatorCall.secciones, [{ id: "hero" }]);
  assert.deepEqual(generatorCall.objetos, [
    {
      id: "template-text-1",
      seccionId: "hero",
      tipo: "texto",
    },
  ]);
});

test("preview pipeline returns missing-template when the template editor document cannot be read", async () => {
  const previewResult = await runDashboardPreviewPipeline({
    slugInvitacion: "template-workspace-1",
    isTemplateSession: true,
    readTemplateEditorDocument: async () => null,
  });

  assert.deepEqual(previewResult, {
    status: "missing-template",
  });
});

test("preview pipeline returns missing-draft when the draft document cannot be read", async () => {
  const previewResult = await runDashboardPreviewPipeline({
    slugInvitacion: "draft-preview-1",
    readDraftDocument: async () => ({
      exists: () => false,
    }),
  });

  assert.deepEqual(previewResult, {
    status: "missing-draft",
  });
});

test("preview pipeline keeps the inactive publication warning signal when the linked publication is no longer readable", async () => {
  let generatorCall = null;

  const previewResult = await runDashboardPreviewPipeline({
    slugInvitacion: "draft-preview-1",
    canUsePublishCompatibility: true,
    readDraftDocument: async () =>
      createSnapshotRecord("draft-preview-1", {
        publicationLifecycle: {
          activePublicSlug: "mi-slug-vencido",
        },
        objetos: [
          {
            id: "persisted-text-1",
            seccionId: "hero",
            tipo: "texto",
          },
        ],
        secciones: [
          {
            id: "hero",
          },
        ],
      }),
    readPublicationBySlug: async (publicSlug) =>
      createSnapshotRecord(publicSlug, {
        estado: "finalizada",
        urlPublica: "https://reservaeldia.com.ar/i/mi-slug-vencido",
      }),
    queryPublicationBySlugOriginal: async () => null,
    generateHtmlFromSections: async (
      secciones,
      objetos,
      rsvpPreviewConfig,
      generatorOptions
    ) => {
      generatorCall = {
        secciones,
        objetos,
        rsvpPreviewConfig,
        generatorOptions,
      };
      return "<html>preview-inactive</html>";
    },
  });

  assert.equal(previewResult.status, "success");
  assert.equal(previewResult.publicacionNoVigenteDetectada, true);
  assert.equal(previewResult.slugPublicoDetectado, "");
  assert.equal(previewResult.urlPublicaDetectada, "");
  assert.equal(generatorCall.generatorOptions.slug, "draft-preview-1");
});

test("preview debug summary keeps the current section aggregation format", () => {
  const summary = buildDashboardPreviewDebugSummary({
    previewPayload: {
      objetos: [
        { seccionId: "hero", tipo: "texto" },
        { seccionId: "hero", tipo: "texto" },
        { seccionId: "details", tipo: "imagen" },
      ],
    },
    viewportWidth: 375,
    viewportHeight: 812,
    devicePixelRatio: 3,
    userAgent: "Mozilla/5.0 (iPhone)",
  });

  assert.equal(
    summary,
    `[PREVIEW] objetos por seccion (abierto)\n` +
      `viewport=375x812 dpr=3.00 mobileViewport=true desktopMobilePreview=false mobileUA=Mozilla/5.0 (iPhone)\n` +
      `secciones=2 objetos=3\n` +
      `hero | total=2 | tipos=texto:2\n` +
      `details | total=1 | tipos=imagen:1`
  );
});
