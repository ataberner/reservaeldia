import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureEventDateField,
  getEventDateFieldKey,
  resolveEventDateSidebarBinding,
} from "./date.js";
import {
  linkElementToField,
} from "../templates/authoring/model.js";
import {
  buildTemplateAuthoringTargetPatches,
} from "../templates/authoring/targetApplication.js";

test("event date predefined field links countdown and text targets", () => {
  const fieldKey = getEventDateFieldKey();
  const ensured = ensureEventDateField({ fieldsSchema: [] });
  const linkedCountdown = linkElementToField({
    fieldsSchema: ensured.fieldsSchema,
    fieldKey,
    elementId: "countdown-main",
    path: "fechaObjetivo",
  });
  const linkedText = linkElementToField({
    fieldsSchema: linkedCountdown.fieldsSchema,
    fieldKey,
    elementId: "date-text",
    path: "texto",
  });
  const field = linkedText.fieldsSchema.find((entry) => entry.key === fieldKey);

  assert.equal(field.key, "event_date");
  assert.equal(field.label, "Fecha del evento");
  assert.equal(field.type, "date");
  assert.deepEqual(
    field.applyTargets.map((target) => [target.id, target.path, target.transform?.kind]),
    [
      ["countdown-main", "fechaObjetivo", "date_to_countdown_iso"],
      ["date-text", "texto", "date_to_text"],
    ]
  );

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "2027-01-05T21:00:00.000Z",
    objetos: [
      {
        id: "countdown-main",
        tipo: "countdown",
        fechaObjetivo: "2026-12-13T21:00:00.000Z",
      },
      {
        id: "date-text",
        tipo: "texto",
        texto: "Fecha anterior",
        x: 100,
        y: 100,
        fontSize: 24,
      },
    ],
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto || entry.patch.fechaObjetivo]),
    [
      ["countdown-main", "2027-01-05T21:00:00.000Z"],
      ["date-text", "5 de enero de 2027"],
    ]
  );
});

test("event date sidebar binding prefers event_date text targets over legacy countdown fields", () => {
  const fieldsSchema = [
    {
      key: "legacy_countdown_date",
      type: "date",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown-main",
          path: "fechaObjetivo",
        },
      ],
    },
    {
      key: "event_date",
      label: "Fecha del evento",
      type: "date",
      applyTargets: [
        {
          scope: "objeto",
          id: "date-title",
          path: "texto",
        },
        {
          scope: "objeto",
          id: "date-subtitle",
          path: "texto",
        },
      ],
    },
  ];

  const binding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults: {
      event_date: "2027-01-05T21:00:00.000Z",
      legacy_countdown_date: "2026-12-13T21:00:00.000Z",
    },
    countdownDetails: {
      hasBinding: true,
      field: fieldsSchema[0],
      fieldKey: "legacy_countdown_date",
      targetISO: "2026-12-13T21:00:00.000Z",
    },
  });

  assert.equal(binding.fieldKey, "event_date");
  assert.equal(binding.field.key, "event_date");
  assert.equal(binding.targetISO, "2027-01-05T21:00:00.000Z");
  assert.equal(binding.hasEventDateField, true);
});

test("event date sidebar binding keeps existing named text field when canonical field only targets countdown", () => {
  const fieldsSchema = [
    {
      key: "event_date",
      label: "Fecha del evento",
      type: "date",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown-main",
          path: "fechaObjetivo",
        },
      ],
    },
    {
      key: "fecha_del_evento",
      label: "Fecha del evento",
      type: "date",
      applyTargets: [
        {
          scope: "objeto",
          id: "date-title",
          path: "texto",
        },
      ],
    },
  ];

  const binding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults: {
      event_date: "2026-12-13T21:00:00.000Z",
      fecha_del_evento: "2027-01-05T21:00:00.000Z",
    },
    countdownDetails: {
      hasBinding: true,
      field: fieldsSchema[0],
      fieldKey: "event_date",
      targetISO: "2026-12-13T21:00:00.000Z",
    },
  });

  assert.equal(binding.fieldKey, "fecha_del_evento");
  assert.equal(binding.field.key, "fecha_del_evento");
  assert.equal(binding.targetISO, "2027-01-05T21:00:00.000Z");
});
