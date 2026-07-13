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

  assert.equal(field.key, "event_ceremony_date");
  assert.equal(field.label, "Fecha de la ceremonia");
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

test("event date sidebar binding prefers ceremony date text targets over legacy countdown fields", () => {
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
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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
      event_ceremony_date: "2027-01-05T21:00:00.000Z",
      legacy_countdown_date: "2026-12-13T21:00:00.000Z",
    },
    countdownDetails: {
      hasBinding: true,
      field: fieldsSchema[0],
      fieldKey: "legacy_countdown_date",
      targetISO: "2026-12-13T21:00:00.000Z",
    },
  });

  assert.equal(binding.fieldKey, "event_ceremony_date");
  assert.equal(binding.field.key, "event_ceremony_date");
  assert.equal(binding.targetISO, "2027-01-05T21:00:00.000Z");
  assert.equal(binding.hasEventDateField, true);
});

test("event date sidebar binding keeps existing named text field when canonical field only targets countdown", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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
      key: "fecha_de_la_ceremonia",
      label: "Fecha de la ceremonia",
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
      event_ceremony_date: "2026-12-13T21:00:00.000Z",
      fecha_de_la_ceremonia: "2027-01-05T21:00:00.000Z",
    },
    countdownDetails: {
      hasBinding: true,
      field: fieldsSchema[0],
      fieldKey: "event_ceremony_date",
      targetISO: "2026-12-13T21:00:00.000Z",
    },
  });

  assert.equal(binding.fieldKey, "fecha_de_la_ceremonia");
  assert.equal(binding.field.key, "fecha_de_la_ceremonia");
  assert.equal(binding.targetISO, "2027-01-05T21:00:00.000Z");
});

test("event date sidebar binding reads long visible text target when defaults are empty", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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
    defaults: {},
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "13 de diciembre de 2026",
      },
    ],
  });

  assert.equal(binding.fieldKey, "event_ceremony_date");
  assert.equal(binding.targetISO, "2026-12-13");
});

test("event date sidebar binding uses a fresh payload before a stale bridge", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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

  const staleBinding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults: {},
    objetos: [],
  });
  const freshBinding = resolveEventDateSidebarBinding({
    fieldsSchema,
    defaults: {},
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "13 de diciembre de 2026",
      },
    ],
  });

  assert.equal(staleBinding.fieldKey, "event_ceremony_date");
  assert.equal(staleBinding.targetISO, "");
  assert.equal(freshBinding.fieldKey, "event_ceremony_date");
  assert.equal(freshBinding.targetISO, "2026-12-13");
});

test("event date sidebar binding reads short visible text target when defaults are empty", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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
    defaults: {},
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "13/12/2026",
      },
    ],
  });

  assert.equal(binding.fieldKey, "event_ceremony_date");
  assert.equal(binding.targetISO, "2026-12-13");
});

test("event date sidebar binding reads dotted visible text target when defaults are empty", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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
    defaults: {},
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "27 . 4 . 2026",
      },
    ],
  });

  assert.equal(binding.fieldKey, "event_ceremony_date");
  assert.equal(binding.targetISO, "2026-04-27");
});

test("event date sidebar binding reads pipe short year visible text target when defaults are empty", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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
    defaults: {},
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "26|08|27",
      },
    ],
  });

  assert.equal(binding.fieldKey, "event_ceremony_date");
  assert.equal(binding.targetISO, "2027-08-26");
});

test("event date sidebar binding does not infer missing year from visible text", () => {
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      label: "Fecha de la ceremonia",
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
      event_ceremony_date: "2027-01-05",
    },
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "13 de diciembre",
      },
    ],
  });

  assert.equal(binding.fieldKey, "event_ceremony_date");
  assert.equal(binding.targetISO, "2027-01-05");
});

test("event date target patches apply date-only values to visible text targets", () => {
  const field = {
    key: "event_ceremony_date",
    label: "Fecha de la ceremonia",
    type: "date",
    applyTargets: [
      {
        scope: "objeto",
        id: "date-title",
        path: "texto",
        mode: "set",
        transform: {
          kind: "date_to_text",
          preset: "event_date_long_es_ar",
        },
      },
    ],
  };

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "2026-12-13",
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "Fecha anterior",
        x: 100,
        y: 100,
        fontSize: 24,
      },
    ],
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto]),
    [["date-title", "13 de diciembre de 2026"]]
  );
});

test("event date target patches apply dotted date preset to visible text targets", () => {
  const field = {
    key: "event_ceremony_date",
    label: "Fecha de la ceremonia",
    type: "date",
    applyTargets: [
      {
        scope: "objeto",
        id: "date-title",
        path: "texto",
        mode: "set",
        transform: {
          kind: "date_to_text",
          preset: "event_date_dotted_es_ar",
        },
      },
    ],
  };

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "2026-04-27",
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "Fecha anterior",
        x: 100,
        y: 100,
        fontSize: 24,
      },
    ],
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto]),
    [["date-title", "27.4.2026"]]
  );
});

test("event date target patches apply pipe short year preset to visible text targets", () => {
  const field = {
    key: "event_ceremony_date",
    label: "Fecha de la ceremonia",
    type: "date",
    applyTargets: [
      {
        scope: "objeto",
        id: "date-title",
        path: "texto",
        mode: "set",
        transform: {
          kind: "date_to_text",
          preset: "event_date_pipe_short_year_es_ar",
        },
      },
    ],
  };

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "2027-08-26",
    objetos: [
      {
        id: "date-title",
        tipo: "texto",
        texto: "Fecha anterior",
        x: 100,
        y: 100,
        fontSize: 24,
      },
    ],
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto]),
    [["date-title", "26|08|27"]]
  );
});
