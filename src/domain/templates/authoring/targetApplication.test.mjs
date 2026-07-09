import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTemplateAuthoringTargetPatches,
  resolveFieldValueFromLinkedCountdown,
  resolveFieldValueFromLinkedDateTargets,
  updateFieldDateTextFormatInSchema,
} from "./targetApplication.js";
import {
  ensureEventDateField,
  getEventDateFieldKey,
} from "../../eventDetails/date.js";
import {
  linkElementToField,
} from "./model.js";
import {
  getStoryTextFieldKey,
} from "../storyText.js";
import {
  buildSuggestedTemplateTargetTransform,
  formatTemplateDateTextValue,
  resolveTemplateTargetValue,
} from "../fieldValueResolver.js";

test("formats date and datetime fields for textual targets", () => {
  const iso = "2026-12-13T21:00:00.000Z";
  const dateField = { key: "event_date", type: "date" };
  const datetimeField = { key: "event_datetime", type: "datetime" };
  const target = {
    scope: "objeto",
    id: "text-date",
    path: "texto",
    transform: { kind: "date_to_text" },
  };

  assert.equal(formatTemplateDateTextValue(iso), "13 de diciembre de 2026");
  assert.equal(
    resolveTemplateTargetValue({ field: dateField, target, value: iso }),
    "13 de diciembre de 2026"
  );
  assert.equal(
    resolveTemplateTargetValue({ field: datetimeField, target, value: iso }),
    "13 de diciembre de 2026, 18:00"
  );
});

test("date text presets format event dates in supported display styles", () => {
  const iso = "2026-12-13T21:00:00.000Z";

  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_long_es_ar", "date"),
    "13 de diciembre de 2026"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_short_es_ar", "date"),
    "13/12/2026"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_dotted_es_ar", "date"),
    "13.12.2026"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_pipe_short_year_es_ar", "date"),
    "13|12|26"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_short_es_ar", "datetime"),
    "13/12/2026"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_date_day_month_es_ar", "date"),
    "13 de diciembre"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_datetime_long_es_ar", "date"),
    "13 de diciembre de 2026, 18:00"
  );
  assert.equal(
    formatTemplateDateTextValue(iso, "event_datetime_short_es_ar", "date"),
    "13/12/2026, 18:00"
  );
});

test("text targets for date fields use date_to_text transform", () => {
  assert.deepEqual(buildSuggestedTemplateTargetTransform({
    fieldType: "date",
    path: "texto",
  }), {
    kind: "date_to_text",
    preset: "event_date_long_es_ar",
  });
  assert.deepEqual(buildSuggestedTemplateTargetTransform({
    fieldType: "datetime",
    path: "texto",
  }), {
    kind: "date_to_text",
    preset: "event_datetime_long_es_ar",
  });
  assert.deepEqual(buildSuggestedTemplateTargetTransform({
    field: {
      type: "date",
      dateTextFormatPreset: "event_date_short_es_ar",
    },
    path: "texto",
  }), {
    kind: "date_to_text",
    preset: "event_date_short_es_ar",
  });
});

test("authoring target patches prefer linked countdown date when linking text", () => {
  const field = {
    key: "event_datetime",
    type: "datetime",
    applyTargets: [
      {
        scope: "objeto",
        id: "countdown-main",
        path: "fechaObjetivo",
        mode: "set",
        transform: { kind: "date_to_countdown_iso" },
      },
      {
        scope: "objeto",
        id: "text-date",
        path: "texto",
        mode: "set",
        transform: {
          kind: "date_to_text",
          preset: "event_datetime_long_es_ar",
        },
      },
    ],
  };
  const objetos = [
    {
      id: "countdown-main",
      tipo: "countdown",
      fechaObjetivo: "2026-12-13T21:00:00.000Z",
    },
    {
      id: "text-date",
      tipo: "texto",
      texto: "Fecha anterior",
      x: 100,
      y: 100,
      fontSize: 24,
    },
  ];

  const value = resolveFieldValueFromLinkedCountdown({
    field,
    objetos,
    fallbackValue: "2026-01-01T03:00:00.000Z",
  });
  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value,
    objetos,
  });

  assert.equal(value, "2026-12-13T21:00:00.000Z");
  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto || entry.patch.fechaObjetivo]),
    [["text-date", "13 de diciembre de 2026, 18:00"]]
  );
});

test("event date authoring link initializes from visible linked text target", () => {
  const fieldKey = getEventDateFieldKey();
  const ensured = ensureEventDateField({ fieldsSchema: [] });
  const linked = linkElementToField({
    fieldsSchema: ensured.fieldsSchema,
    fieldKey,
    elementId: "date-title",
    path: "texto",
  });
  const field = linked.fieldsSchema.find((entry) => entry.key === fieldKey);

  assert.equal(
    resolveFieldValueFromLinkedDateTargets({
      field,
      objetos: [
        {
          id: "date-title",
          tipo: "texto",
          texto: "13 de diciembre de 2026",
        },
      ],
      fallbackValue: "",
    }),
    "2026-12-13"
  );
});

test("authoring target patches update countdown and linked text for a new event details value", () => {
  const field = {
    key: "event_date",
    type: "date",
    applyTargets: [
      {
        scope: "objeto",
        id: "countdown-main",
        path: "fechaObjetivo",
        mode: "set",
        transform: { kind: "date_to_countdown_iso" },
      },
      {
        scope: "objeto",
        id: "text-date",
        path: "texto",
        mode: "set",
        transform: {
          kind: "date_to_text",
          preset: "event_date_long_es_ar",
        },
      },
    ],
  };
  const objetos = [
    {
      id: "countdown-main",
      tipo: "countdown",
      fechaObjetivo: "2026-12-13T21:00:00.000Z",
    },
    {
      id: "text-date",
      tipo: "texto",
      texto: "Fecha anterior",
      x: 100,
      y: 100,
      fontSize: 24,
    },
  ];

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "2027-01-05T21:00:00.000Z",
    objetos,
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto || entry.patch.fechaObjetivo]),
    [
      ["countdown-main", "2027-01-05T21:00:00.000Z"],
      ["text-date", "5 de enero de 2027"],
    ]
  );
});

test("authoring target patches resolve targets nested in preserved groups", () => {
  const field = {
    key: "event_names",
    type: "text",
    applyTargets: [
      {
        scope: "objeto",
        id: "grouped-couple-title",
        path: "texto",
        mode: "set",
      },
    ],
  };
  const objetos = [
    {
      id: "group-hero",
      tipo: "grupo",
      seccionId: "hero",
      x: 80,
      y: 100,
      width: 320,
      height: 180,
      children: [
        {
          id: "grouped-couple-title",
          tipo: "texto",
          texto: "Sofia y Mateo",
          x: 20,
          y: 24,
          width: 220,
          __autoWidth: false,
          fontSize: 32,
        },
      ],
    },
  ];

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: "Mara y Nico",
    objetos,
  });

  assert.deepEqual(patches, [
    {
      objectId: "grouped-couple-title",
      patch: {
        texto: "Mara y Nico",
      },
    },
  ]);
});

test("date text format update changes textual targets without changing countdown target", () => {
  const fieldsSchema = [
    {
      key: "event_date",
      type: "date",
      label: "Fecha del evento",
      group: "Datos principales",
      optional: false,
      dateTextFormatPreset: "event_date_long_es_ar",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown-main",
          path: "fechaObjetivo",
          mode: "set",
          transform: { kind: "date_to_countdown_iso" },
        },
        {
          scope: "objeto",
          id: "text-date",
          path: "texto",
          mode: "set",
          transform: {
            kind: "date_to_text",
            preset: "event_date_long_es_ar",
          },
        },
      ],
    },
  ];
  const result = updateFieldDateTextFormatInSchema({
    fieldsSchema,
    fieldKey: "event_date",
    preset: "event_datetime_short_es_ar",
  });

  assert.equal(result.changed, true);
  assert.equal(result.field.dateTextFormatPreset, "event_datetime_short_es_ar");
  assert.deepEqual(result.field.applyTargets[0].transform, {
    kind: "date_to_countdown_iso",
  });
  assert.deepEqual(result.field.applyTargets[1].transform, {
    kind: "date_to_text",
    preset: "event_datetime_short_es_ar",
  });
  assert.deepEqual(result.targetObjectIds, ["text-date"]);

  const patches = buildTemplateAuthoringTargetPatches({
    field: result.field,
    value: "2026-12-13T21:00:00.000Z",
    targetObjectIds: result.targetObjectIds,
    objetos: [
      {
        id: "countdown-main",
        tipo: "countdown",
        fechaObjetivo: "2026-01-01T03:00:00.000Z",
      },
      {
        id: "text-date",
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
    [["text-date", "13/12/2026, 18:00"]]
  );
});

test("venue address text targets are projected as fixed-width wrapped text boxes", () => {
  const field = {
    key: "event_venue_address",
    type: "location",
    eventDetailsRole: "venue_address",
    applyTargets: [
      {
        scope: "objeto",
        id: "address-text",
        path: "texto",
        mode: "set",
      },
      {
        scope: "objeto",
        id: "address-without-width",
        path: "texto",
        mode: "set",
      },
    ],
  };
  const longAddress =
    "Avenida Corrientes 1234, C1043 Ciudad Autonoma de Buenos Aires, Argentina";

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: longAddress,
    objetos: [
      {
        id: "address-text",
        tipo: "texto",
        texto: "Direccion anterior",
        width: 240,
        fontSize: 18,
      },
      {
        id: "address-without-width",
        tipo: "texto",
        texto: longAddress,
        fontSize: 18,
      },
    ],
  });

  assert.deepEqual(patches, [
    {
      objectId: "address-text",
      patch: {
        texto: longAddress,
        __autoWidth: false,
        textWrapMode: "word",
      },
    },
    {
      objectId: "address-without-width",
      patch: {
        __autoWidth: false,
        width: 360,
        textWrapMode: "word",
      },
    },
  ]);
});

test("story text targets keep the linked text box width and alignment when projected", () => {
  const field = {
    key: getStoryTextFieldKey(),
    label: "Texto historia",
    type: "textarea",
    group: "Datos principales",
    applyTargets: [
      {
        scope: "objeto",
        id: "story-text",
        path: "texto",
        mode: "set",
      },
      {
        scope: "objeto",
        id: "story-legacy-align",
        path: "texto",
        mode: "set",
      },
    ],
  };
  const longStory =
    "Nos conocimos en una tarde larga y desde entonces elegimos caminar juntos.";

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value: longStory,
    objetos: [
      {
        id: "story-text",
        tipo: "texto",
        texto: "Historia anterior",
        width: 260,
        align: "center",
        fontSize: 18,
      },
      {
        id: "story-legacy-align",
        tipo: "texto",
        texto: "Historia anterior",
        width: 220,
        textAlign: "right",
        fontSize: 18,
      },
    ],
  });

  assert.deepEqual(patches, [
    {
      objectId: "story-text",
      patch: {
        texto: longStory,
        __autoWidth: false,
        textWrapMode: "word",
      },
    },
    {
      objectId: "story-legacy-align",
      patch: {
        texto: longStory,
        __autoWidth: false,
        textWrapMode: "word",
        align: "right",
      },
    },
  ]);

  const mergedStory = {
    id: "story-text",
    tipo: "texto",
    texto: "Historia anterior",
    width: 260,
    align: "center",
    ...patches[0].patch,
  };
  assert.equal(mergedStory.width, 260);
  assert.equal(mergedStory.align, "center");
});
