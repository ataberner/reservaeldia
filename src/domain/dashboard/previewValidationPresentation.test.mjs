import test from "node:test";
import assert from "node:assert/strict";

import { buildPreviewPublishNoticePresentation } from "./previewValidationPresentation.js";

const COMPATIBILITY_WARNING_CODES = [
  "legacy-countdown-schema-v1-frozen",
  "legacy-icono-svg-frozen",
  "countdown-target-compat-alias",
];

for (const code of COMPATIBILITY_WARNING_CODES) {
  test(`does not show a notice for the supported compatibility warning ${code}`, () => {
    const presentation = buildPreviewPublishNoticePresentation({
      validation: { blockers: [], warnings: [{ code }] },
    });

    assert.deepEqual(presentation.notices, []);
  });

  test(`keeps a blocking notice if ${code} is reported as a blocker`, () => {
    const presentation = buildPreviewPublishNoticePresentation({
      validation: { blockers: [{ code }], warnings: [{ code }] },
    });

    assert.equal(presentation.notices.length, 1);
    assert.equal(presentation.notices[0].severity, "error");
    assert.equal(presentation.notices[0].source, "validation-blocker");
    assert.match(presentation.notices[0].text, /impide publicar/);
  });
}

test("keeps actionable date, asset and other issues without changing validation diagnostics", () => {
  const validation = {
    canPublish: false,
    blockers: [
      { code: "countdown-target-missing", objectId: "countdown-without-date" },
      { code: "countdown-target-invalid", objectId: "countdown-invalid-date" },
      { code: "countdown-frame-unresolved", objectId: "countdown-frame" },
      { code: "image-asset-unresolved", objectId: "image" },
    ],
    warnings: [
      { code: "legacy-countdown-schema-v1-frozen", objectId: "countdown-without-date" },
      { code: "countdown-target-compat-alias", objectId: "countdown-alias" },
      { code: "legacy-icono-svg-frozen", objectId: "icon" },
      { code: "gift-modal-field-incomplete" },
      { code: "gift-modal-field-incomplete" },
      { code: "pantalla-ynorm-drift" },
      { code: "unknown-warning" },
    ],
    summary: { blockingCount: 4, warningCount: 7 },
  };
  const originalValidation = structuredClone(validation);
  const presentation = buildPreviewPublishNoticePresentation({ validation });
  const notices = presentation.notices;

  assert.deepEqual(validation, originalValidation);
  assert.equal(notices.length, 6);
  assert.deepEqual(
    notices.filter((notice) => notice.severity === "error").map(({ text, count }) => ({ text, count })),
    [
      { text: "Configura la fecha de la cuenta regresiva antes de publicar.", count: 1 },
      { text: "Revisa la fecha de la cuenta regresiva: no es una fecha valida.", count: 1 },
      { text: "Todavia falta preparar una imagen o recurso antes de publicar.", count: 2 },
    ]
  );
  assert.deepEqual(
    notices.filter((notice) => notice.severity === "warning").map(({ text, count }) => ({ text, count })),
    [
      { text: "Hay algo para revisar antes de publicar.", count: 1 },
      { text: "Hay datos de regalos visibles que todavia faltan completar.", count: 2 },
      { text: "La posicion de un elemento puede cambiar un poco al publicar.", count: 1 },
    ]
  );
});

test("maps validation codes to friendly user copy without exposing technical terms", () => {
  const presentation = buildPreviewPublishNoticePresentation({
    validation: {
      blockers: [
        {
          code: "rsvp-disabled-with-button",
          objectId: "rsvp-1774796624802",
          message:
            'rsvp-boton "rsvp-1774796624802" requiere RSVP habilitado en raiz para que el HTML publicado tenga un modal funcional.',
        },
      ],
      warnings: [
        {
          code: "rsvp-missing-root-config",
          objectId: "rsvp-1774796624802",
          message:
            'rsvp-boton "rsvp-1774796624802" necesita rsvp en raiz para que el CTA publicado sea funcional.',
        },
      ],
    },
  });

  assert.deepEqual(
    presentation.notices.map((notice) => notice.text),
    [
      "Activa Confirmar asistencia para poder publicar este boton.",
      "Completa la configuracion de Confirmar asistencia para que este boton funcione al publicar.",
    ]
  );
  assert.equal(
    presentation.notices.some((notice) => /rsvp|rsvp-boton|1774796624802/i.test(notice.text)),
    false
  );
});

test("dedupes repeated warning messages and keeps a count for the floating notices", () => {
  const presentation = buildPreviewPublishNoticePresentation({
    validation: {
      blockers: [],
      warnings: [
        { code: "gift-modal-field-incomplete" },
        { code: "gift-modal-field-incomplete" },
        { code: "gift-modal-field-incomplete" },
      ],
    },
  });

  assert.deepEqual(presentation.notices, [
    {
      id: "warning|Hay datos de regalos visibles que todavia faltan completar.",
      severity: "warning",
      text: "Hay datos de regalos visibles que todavia faltan completar.",
      count: 3,
      source: "validation-warning",
    },
  ]);
});

test("suppresses duplicate publish errors when blockers already explain the issue", () => {
  const presentation = buildPreviewPublishNoticePresentation({
    publishError:
      "No se puede publicar todavia: rsvp-boton necesita rsvp en raiz. Hay 1 incompatibilidades mas.",
    validation: {
      blockers: [{ code: "rsvp-disabled-with-button" }],
      warnings: [],
      summary: {
        blockingMessage:
          "No se puede publicar todavia: rsvp-boton necesita rsvp en raiz. Hay 1 incompatibilidades mas.",
      },
    },
  });

  assert.deepEqual(
    presentation.notices.map((notice) => notice.text),
    ["Activa Confirmar asistencia para poder publicar este boton."]
  );
});

test("keeps pending and friendly generic publish errors when they are not validation duplicates", () => {
  const presentation = buildPreviewPublishNoticePresentation({
    pending: true,
    validation: {
      blockers: [],
      warnings: COMPATIBILITY_WARNING_CODES.map((code) => ({ code })),
    },
    publishError:
      "No se pudo validar la compatibilidad de publish. Intenta nuevamente.",
  });

  assert.deepEqual(
    presentation.notices.map((notice) => notice.text),
    [
      "Revisando detalles antes de publicar...",
      "No pudimos revisar la invitacion antes de publicar. Intenta nuevamente.",
    ]
  );
});

test("prioritizes the success notice once publication finishes", () => {
  const presentation = buildPreviewPublishNoticePresentation({
    publishSuccess: "Invitacion publicada correctamente.",
    pending: true,
    publishError: "No se pudo sincronizar",
    validation: {
      blockers: [{ code: "shape-figure-unsupported-for-publish" }],
      warnings: [
        { code: "gift-no-usable-methods" },
        ...COMPATIBILITY_WARNING_CODES.map((code) => ({ code })),
      ],
    },
  });

  assert.deepEqual(presentation.notices, [
    {
      id: "success|Invitacion publicada correctamente.",
      severity: "success",
      text: "Invitacion publicada correctamente.",
      count: 1,
      source: "publish-success",
    },
  ]);
});
