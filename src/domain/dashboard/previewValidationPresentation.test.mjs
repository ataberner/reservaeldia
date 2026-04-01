import test from "node:test";
import assert from "node:assert/strict";

import { buildPreviewPublishNoticePresentation } from "./previewValidationPresentation.js";

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
      warnings: [{ code: "gift-no-usable-methods" }],
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
