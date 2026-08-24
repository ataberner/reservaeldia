import test from "node:test";
import assert from "node:assert/strict";
import { installFirebaseStorageMock } from "./testUtils/firebaseStorageMock.mjs";
import { requireBuiltModule } from "./testUtils/requireBuiltModule.mjs";

const { prepareTemplateEditorPreview } = requireBuiltModule(
  "lib/templates/templateEditorPreview.js"
);

test("template editor preview uses the prepared render pipeline for valid HTML", async (t) => {
  const storageMock = installFirebaseStorageMock();
  t.after(() => storageMock.restore());

  const result = await prepareTemplateEditorPreview({
    templateId: "template-prepared-valid",
    includeDebugPayload: true,
    editorDocument: {
      objetos: [
        {
          id: "hero-title",
          tipo: "texto",
          seccionId: "hero",
          x: 80,
          y: 120,
          width: 420,
          height: 80,
          texto: "Nos casamos",
          fontSize: 42,
        },
      ],
      secciones: [
        {
          id: "hero",
          orden: 1,
          altoModo: "pantalla",
          altura: 500,
          fondo: "#faf5ff",
        },
      ],
      eventDetails: { mode: "single" },
    },
  });

  assert.equal(result.blocked, false);
  assert.equal(result.validation.canPublish, true);
  assert.match(result.htmlGenerado, /data-loader-ready="0"/);
  assert.match(result.htmlGenerado, /CRITICAL_READY_TIMEOUT_MS/);
  assert.deepEqual(result.previewPayload.objetos.map((item) => item.id), [
    "hero-title",
  ]);
});

test("template editor preview omits the duplicated debug payload by default", async (t) => {
  const storageMock = installFirebaseStorageMock();
  t.after(() => storageMock.restore());

  const result = await prepareTemplateEditorPreview({
    templateId: "template-compact-response",
    previewTimingSessionId: "template-timing",
    editorDocument: {
      objetos: [],
      secciones: [{ id: "hero", orden: 1, altura: 600, fondo: "#fff" }],
    },
  });

  assert.equal(Object.hasOwn(result, "previewPayload"), false);
  assert.equal(result.previewTiming.sessionId, "template-timing");
  assert.ok(result.previewTiming.prepareRenderPayloadMs >= 0);
  assert.ok(result.previewTiming.generateHtmlMs >= 0);
});

test("template editor preview blocks invalid prepared render state without local HTML", async (t) => {
  const storageMock = installFirebaseStorageMock();
  t.after(() => storageMock.restore());

  const result = await prepareTemplateEditorPreview({
    templateId: "template-prepared-blocked",
    editorDocument: {
      objetos: [
        {
          id: "orphan-title",
          tipo: "texto",
          seccionId: "missing-section",
          texto: "Sin seccion",
        },
      ],
      secciones: [{ id: "hero", orden: 1, altura: 600 }],
    },
  });

  assert.equal(result.blocked, true);
  assert.equal(result.validation.canPublish, false);
  assert.equal(result.htmlGenerado, "");
  assert.ok(
    result.validation.blockers.some(
      (issue) => issue.code === "missing-section-reference"
    )
  );
});
