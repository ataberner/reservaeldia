import test from "node:test";
import assert from "node:assert/strict";

import {
  planDynamicFieldVisualDeletion,
  preserveRecoveredTextBoxLayout,
  resolveNextDynamicFieldVisualRootId,
  resolveDynamicFieldVisualStatus,
  resolveDynamicFieldScrollTarget,
  resolveDynamicTextFieldForObject,
  resolveDynamicTextInlineEditDescriptor,
  normalizeDynamicInlineFieldValue,
  restoreDynamicFieldVisual,
} from "./dynamicFieldTargets.js";

test("dynamic field indicator cycles canvas roots and wraps to the first", () => {
  const rootObjectIds = ["first", "second", "third", "second"];
  const first = resolveNextDynamicFieldVisualRootId({ rootObjectIds });
  const second = resolveNextDynamicFieldVisualRootId({
    rootObjectIds,
    previousRootObjectId: first,
  });
  const third = resolveNextDynamicFieldVisualRootId({
    rootObjectIds,
    previousRootObjectId: second,
  });
  const wrapped = resolveNextDynamicFieldVisualRootId({
    rootObjectIds,
    previousRootObjectId: third,
  });

  assert.equal(first, "first");
  assert.equal(second, "second");
  assert.equal(third, "third");
  assert.equal(wrapped, "first");
  assert.equal(
    resolveNextDynamicFieldVisualRootId({
      rootObjectIds: ["second", "third"],
      previousRootObjectId: "first",
    }),
    "second"
  );
});

test("recovery keeps the archived text box width mode after insertion normalization", () => {
  const recoveredFixedBox = {
    id: "couple-names",
    tipo: "texto",
    width: 468,
    __autoWidth: false,
    textWrapMode: "word",
  };
  assert.deepEqual(
    preserveRecoveredTextBoxLayout({
      recoveredObject: recoveredFixedBox,
      normalizedObject: {
        ...recoveredFixedBox,
        width: 260,
        __autoWidth: true,
        textWrapMode: "char",
      },
    }),
    recoveredFixedBox
  );

  const recoveredAutoWidth = {
    id: "legacy-couple-names",
    tipo: "texto",
    width: 468,
  };
  const normalizedAutoWidth = preserveRecoveredTextBoxLayout({
    recoveredObject: recoveredAutoWidth,
    normalizedObject: {
      ...recoveredAutoWidth,
      __autoWidth: false,
      textWrapMode: "word",
    },
  });
  assert.equal(normalizedAutoWidth.width, 468);
  assert.equal(
    Object.prototype.hasOwnProperty.call(normalizedAutoWidth, "__autoWidth"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(normalizedAutoWidth, "textWrapMode"),
    false
  );
});

test("dynamic field scroll target returns null when the field has no targets", () => {
  const result = resolveDynamicFieldScrollTarget({
    fieldsSchema: [{ key: "event_ceremony_date", applyTargets: [] }],
    fieldKeys: "event_ceremony_date",
    objetos: [{ id: "date-text", tipo: "texto" }],
  });

  assert.equal(result, null);
});

test("dynamic field scroll target prefers textual targets over functional targets", () => {
  const result = resolveDynamicFieldScrollTarget({
    fieldsSchema: [
      {
        key: "event_ceremony_date",
        applyTargets: [
          { scope: "objeto", id: "countdown-1", path: "fechaObjetivo" },
          { scope: "objeto", id: "date-text", path: "texto" },
        ],
      },
    ],
    fieldKeys: "event_ceremony_date",
    objetos: [
      { id: "countdown-1", tipo: "countdown" },
      { id: "date-text", tipo: "texto" },
    ],
  });

  assert.equal(result?.objectId, "date-text");
  assert.equal(result?.isTextualTarget, true);
});

test("dynamic field scroll target uses the first canvas object when there are multiple textual targets", () => {
  const result = resolveDynamicFieldScrollTarget({
    fieldsSchema: [
      {
        key: "event_ceremony_venue_address",
        applyTargets: [
          { scope: "objeto", id: "address-late", path: "texto" },
          { scope: "objeto", id: "address-early", path: "texto" },
        ],
      },
    ],
    fieldKeys: "event_ceremony_venue_address",
    objetos: [
      { id: "address-early", tipo: "texto" },
      { id: "address-late", tipo: "texto" },
    ],
  });

  assert.equal(result?.objectId, "address-early");
});

test("dynamic field scroll target respects field key priority", () => {
  const result = resolveDynamicFieldScrollTarget({
    fieldsSchema: [
      {
        key: "event_primary_person_name",
        applyTargets: [{ scope: "objeto", id: "primary-text", path: "texto" }],
      },
      {
        key: "event_couple_names_and",
        applyTargets: [{ scope: "objeto", id: "couple-text", path: "texto" }],
      },
    ],
    fieldKeys: ["event_secondary_person_name", "event_couple_names_and"],
    objetos: [
      { id: "primary-text", tipo: "texto" },
      { id: "couple-text", tipo: "texto" },
    ],
  });

  assert.equal(result?.fieldKey, "event_couple_names_and");
  assert.equal(result?.objectId, "couple-text");
});

test("dynamic field scroll target skips hidden objects", () => {
  const result = resolveDynamicFieldScrollTarget({
    fieldsSchema: [
      {
        key: "texto_historia",
        applyTargets: [
          { scope: "objeto", id: "hidden-story", path: "texto" },
          { scope: "objeto", id: "visible-story", path: "texto" },
        ],
      },
    ],
    fieldKeys: "texto_historia",
    objetos: [
      { id: "hidden-story", tipo: "texto", hidden: true },
      { id: "visible-story", tipo: "texto" },
    ],
  });

  assert.equal(result?.objectId, "visible-story");
});

test("dynamic field status resolves recursive roots, key aliases, and deduplicated ids", () => {
  const result = resolveDynamicFieldVisualStatus({
    fieldsSchema: [
      {
        key: "event_couple_names_and",
        applyTargets: [
          { scope: "objeto", id: "names-child", path: "texto" },
          { scope: "objeto", id: "names-child", path: "texto" },
        ],
      },
    ],
    fieldKeys: ["missing-name-key", "event_couple_names_and"],
    objetos: [
      {
        id: "names-group",
        tipo: "grupo",
        children: [{ id: "names-child", tipo: "texto", texto: "Ana y Sol" }],
      },
    ],
  });

  assert.equal(result.status, "visible");
  assert.equal(result.fieldKey, "event_couple_names_and");
  assert.deepEqual(result.objectIds, ["names-child"]);
  assert.deepEqual(result.rootObjectIds, ["names-group"]);
  assert.equal(result.firstRootObjectId, "names-group");
  assert.equal(result.representations[0].rootObjectId, "names-group");
});

test("dynamic field status orders aliased representations by their canvas order", () => {
  const result = resolveDynamicFieldVisualStatus({
    fieldsSchema: [
      {
        key: "primary-name",
        applyTargets: [{ scope: "objeto", id: "third", path: "texto" }],
      },
      {
        key: "couple-names",
        applyTargets: [
          { scope: "objeto", id: "second", path: "texto" },
          { scope: "objeto", id: "first", path: "texto" },
        ],
      },
    ],
    fieldKeys: ["primary-name", "couple-names"],
    objetos: [
      { id: "first", tipo: "texto" },
      { id: "second", tipo: "texto" },
      { id: "third", tipo: "texto" },
    ],
  });

  assert.deepEqual(result.rootObjectIds, ["first", "second", "third"]);
});

test("dynamic field status distinguishes hidden and absent visual representations", () => {
  const fieldsSchema = [
    {
      key: "event_party_date",
      eventDetailsRole: "party_date",
      applyTargets: [{ scope: "objeto", id: "party-date", path: "texto" }],
    },
  ];
  const hidden = resolveDynamicFieldVisualStatus({
    fieldsSchema,
    fieldKey: "event_party_date",
    objetos: [
      {
        id: "party-root",
        tipo: "grupo",
        visible: false,
        children: [{ id: "party-date", tipo: "texto" }],
      },
    ],
  });
  const absent = resolveDynamicFieldVisualStatus({
    fieldsSchema,
    fieldKey: "event_party_date",
    objetos: [],
  });

  assert.equal(hidden.status, "hidden");
  assert.equal(absent.status, "absent");
});

test("targets with an invalid empty path never count as live views", () => {
  const result = resolveDynamicFieldVisualStatus({
    fieldsSchema: [
      {
        key: "story",
        applyTargets: [{ scope: "objeto", id: "existing", path: "" }],
      },
    ],
    fieldKey: "story",
    objetos: [{ id: "existing", tipo: "texto", texto: "No cuenta" }],
  });

  assert.equal(result.state, "absent");
  assert.equal(result.linkedCount, 0);
  assert.equal(result.canRestore, true);
});

test("countdown status ignores incompatible paths, transforms, field types, and object types", () => {
  const fieldsSchema = [
    {
      key: "wrong-path",
      type: "date",
      applyTargets: [{ scope: "objeto", id: "countdown", path: "texto" }],
    },
    {
      key: "wrong-transform",
      type: "date",
      applyTargets: [
        {
          scope: "objeto",
          id: "countdown",
          path: "fechaObjetivo",
          transform: { kind: "date_to_text" },
        },
      ],
    },
    {
      key: "wrong-field-type",
      type: "text",
      applyTargets: [
        { scope: "objeto", id: "countdown", path: "fechaObjetivo" },
      ],
    },
    {
      key: "wrong-object-type",
      type: "date",
      applyTargets: [
        { scope: "objeto", id: "ordinary-text", path: "fechaObjetivo" },
      ],
    },
  ];
  const objetos = [
    { id: "countdown", tipo: "countdown", mostrarCuentaRegresiva: true },
    { id: "ordinary-text", tipo: "texto", texto: "No es un countdown" },
  ];

  fieldsSchema.forEach((field) => {
    const result = resolveDynamicFieldVisualStatus({
      fieldsSchema,
      fieldKey: field.key,
      objetos,
      kind: "countdown",
    });
    assert.equal(result.state, "absent", field.key);
    assert.equal(result.linkedCount, 0, field.key);
    assert.equal(result.canRestore, true, field.key);
  });
});

test("event maps and countdowns are implicit views of explicit event-details roles", () => {
  const fieldsSchema = [
    {
      key: "party-name",
      eventDetailsRole: "party_venue_name",
      applyTargets: [],
    },
    {
      key: "party-address",
      eventDetailsRole: "party_venue_address",
      applyTargets: [],
    },
    {
      key: "party-date",
      type: "date",
      eventDetailsRole: "party_date",
      applyTargets: [
        { scope: "objeto", id: "party-countdown", path: "fechaObjetivo" },
      ],
    },
    {
      key: "party-time",
      type: "time",
      eventDetailsRole: "party_start_time",
      applyTargets: [],
    },
  ];
  const objetos = [
    {
      id: "party-map",
      tipo: "mapa-google",
      eventDetailsFeature: "party",
      googlePlaceId: "party-place",
      mostrarMapa: true,
    },
    {
      id: "party-countdown",
      tipo: "countdown",
      mostrarCuentaRegresiva: true,
    },
  ];

  const map = resolveDynamicFieldVisualStatus({
    fieldsSchema,
    fieldKeys: ["party-name", "party-address"],
    objetos,
  });
  const time = resolveDynamicFieldVisualStatus({
    fieldsSchema,
    fieldKey: "party-time",
    objetos,
  });

  assert.equal(map.status, "visible");
  assert.equal(map.state, "visible");
  assert.equal(map.linkedCount, 1);
  assert.equal(map.visibleCount, 1);
  assert.deepEqual(map.objectIds, ["party-map"]);
  assert.equal(map.representations[0].representationKind, "event-map");
  assert.equal(time.status, "visible");
  assert.deepEqual(time.objectIds, ["party-countdown"]);
  assert.equal(time.representations[0].representationKind, "countdown");

  const dateTextOnly = resolveDynamicFieldVisualStatus({
    fieldsSchema,
    fieldKey: "party-date",
    objetos: [
      ...objetos,
      { id: "party-date-text", tipo: "texto", texto: "10 de mayo" },
    ],
    kind: "text",
  });
  assert.equal(dateTextOnly.state, "absent");
  assert.equal(dateTextOnly.canRestore, true);
});

test("a map projection without a Place is linked but not visible", () => {
  const result = resolveDynamicFieldVisualStatus({
    fieldsSchema: [
      {
        key: "party-address",
        eventDetailsRole: "party_venue_address",
        applyTargets: [],
      },
    ],
    fieldKey: "party-address",
    objetos: [
      {
        id: "party-map",
        tipo: "mapa-google",
        eventDetailsFeature: "party",
        googlePlaceId: "",
        mostrarMapa: true,
      },
    ],
    kind: "map",
  });

  assert.equal(result.state, "hidden");
  assert.equal(result.linkedCount, 1);
  assert.equal(result.visibleCount, 0);
  assert.equal(result.canRestore, false);
});

test("a grouped map inherits its party phase from the wrapper", () => {
  const fieldsSchema = [
    {
      key: "ceremony-address",
      eventDetailsRole: "ceremony_venue_address",
      applyTargets: [],
    },
    {
      key: "party-address",
      eventDetailsRole: "party_venue_address",
      applyTargets: [],
    },
  ];
  const objetos = [
    {
      id: "party-group",
      tipo: "grupo",
      functionalAssociation: "party",
      children: [
        {
          id: "party-map-child",
          tipo: "mapa-google",
          googlePlaceId: "party-place",
          mostrarMapa: true,
        },
      ],
    },
  ];

  const party = resolveDynamicFieldVisualStatus({
    fieldsSchema,
    fieldKey: "party-address",
    objetos,
    kind: "map",
  });
  const ceremony = resolveDynamicFieldVisualStatus({
    fieldsSchema,
    fieldKey: "ceremony-address",
    objetos,
    kind: "map",
  });

  assert.equal(party.state, "visible");
  assert.deepEqual(party.objectIds, ["party-map-child"]);
  assert.deepEqual(party.rootObjectIds, ["party-group"]);
  assert.equal(ceremony.state, "absent");
});

test("functional render filtering makes standalone event-details views hidden", () => {
  const result = resolveDynamicFieldVisualStatus({
    fieldsSchema: [
      {
        key: "party-address",
        eventDetailsRole: "party_venue_address",
        applyTargets: [],
      },
    ],
    fieldKey: "party-address",
    secciones: [{ id: "shared", orden: 0, altura: 400 }],
    objetos: [
      {
        id: "party-map",
        tipo: "mapa-google",
        seccionId: "shared",
        eventDetailsFeature: "party",
        functionalAssociation: "party",
        mostrarMapa: true,
      },
    ],
    eventDetails: { mode: "single" },
  });

  assert.equal(result.status, "hidden");
  assert.deepEqual(result.rootObjectIds, ["party-map"]);
});

test("dynamic text lookup only returns explicit textual object targets", () => {
  const fieldsSchema = [
    {
      key: "event-date",
      applyTargets: [
        { scope: "objeto", id: "countdown", path: "fechaObjetivo" },
      ],
    },
    {
      key: "event-title",
      applyTargets: [
        {
          scope: "objeto",
          id: "title",
          path: "texto",
          transform: { kind: "date_to_text", preset: "event_date_short_es_ar" },
        },
      ],
    },
  ];

  assert.equal(
    resolveDynamicTextFieldForObject({ fieldsSchema, objectId: "countdown" }),
    null
  );
  assert.deepEqual(
    resolveDynamicTextFieldForObject({ fieldsSchema, objectId: "title" }),
    {
      fieldKey: "event-title",
      target: fieldsSchema[1].applyTargets[0],
    }
  );
});

test("dynamic inline descriptors preserve field, target, role and typed controls", () => {
  const target = {
    scope: "objeto",
    id: "date-label",
    path: "texto",
    mode: "set",
    transform: { kind: "date_to_text", preset: "event_date_day_month_es_ar" },
  };
  const fieldsSchema = [
    {
      key: "event-date",
      label: "Fecha",
      type: "date",
      eventDetailsRole: "ceremony_date",
      validation: { maxLength: 40 },
      applyTargets: [target],
    },
  ];

  assert.deepEqual(
    resolveDynamicTextInlineEditDescriptor({
      fieldsSchema,
      values: { "event-date": "2026-12-13T18:00" },
      objectId: "date-label",
    }),
    {
      fieldKey: "event-date",
      fieldType: "date",
      label: "Fecha",
      eventDetailsRole: "ceremony_date",
      eventDetailsFormat: null,
      target,
      controlKind: "date",
      dateTextFormatPreset: "event_date_day_month_es_ar",
      includesTime: false,
      openOnSelect: true,
      eventDetailsFeature: "ceremony",
      eventStartTimeFieldKey: "event_ceremony_start_time",
      multiline: false,
      maxLength: 40,
      value: "2026-12-13",
    }
  );
});

test("date inline controls follow the selected target preset without changing it", () => {
  const dateOnlyTarget = {
    scope: "objeto",
    id: "date-only",
    path: "texto",
    transform: { kind: "date_to_text", preset: "event_date_short_es_ar" },
  };
  const dateTimeTarget = {
    scope: "objeto",
    id: "date-time",
    path: "texto",
    transform: { kind: "date_to_text", preset: "event_datetime_short_es_ar" },
  };
  const fieldsSchema = [
    {
      key: "event_ceremony_date",
      type: "date",
      eventDetailsRole: "ceremony_date",
      dateTextFormatPreset: "event_datetime_long_es_ar",
      applyTargets: [dateOnlyTarget, dateTimeTarget],
    },
    {
      key: "event_ceremony_start_time",
      type: "time",
      eventDetailsRole: "ceremony_start_time",
      applyTargets: [],
    },
  ];
  const values = {
    event_ceremony_date: "2026-12-13",
    event_ceremony_start_time: "18:30",
  };

  const dateOnly = resolveDynamicTextInlineEditDescriptor({
    fieldsSchema,
    values,
    objectId: "date-only",
  });
  const dateTime = resolveDynamicTextInlineEditDescriptor({
    fieldsSchema,
    values,
    objectId: "date-time",
  });

  assert.equal(dateOnly.controlKind, "date");
  assert.equal(dateOnly.value, "2026-12-13");
  assert.equal(dateOnly.includesTime, false);
  assert.deepEqual(dateOnly.target.transform, dateOnlyTarget.transform);
  assert.equal(dateTime.controlKind, "datetime-local");
  assert.equal(dateTime.value, "2026-12-13T18:30");
  assert.equal(dateTime.includesTime, true);
  assert.equal(dateTime.eventStartTimeFieldKey, "event_ceremony_start_time");
  assert.deepEqual(dateTime.target.transform, dateTimeTarget.transform);
});

test("dynamic inline descriptors resolve grouped child ids from their explicit targets", () => {
  const target = {
    scope: "objeto",
    id: "group-child-title",
    path: "texto",
    transform: { kind: "identity" },
  };
  const descriptor = resolveDynamicTextInlineEditDescriptor({
    fieldsSchema: [
      {
        key: "event-title",
        type: "text",
        applyTargets: [target],
      },
    ],
    defaults: { "event-title": "Fiesta" },
    objectId: "group-child-title",
  });

  assert.equal(descriptor.fieldKey, "event-title");
  assert.equal(descriptor.value, "Fiesta");
  assert.deepEqual(descriptor.target, target);
});

test("dynamic inline value normalization constrains short text without changing textarea", () => {
  assert.equal(
    normalizeDynamicInlineFieldValue({
      descriptor: { fieldType: "text", maxLength: 12 },
      value: "Cena\n  y baile largo",
    }),
    "Cena y baile"
  );
  assert.equal(
    normalizeDynamicInlineFieldValue({
      descriptor: { fieldType: "textarea" },
      value: "Una linea\r\nOtra linea",
    }),
    "Una linea\nOtra linea"
  );
  assert.equal(
    normalizeDynamicInlineFieldValue({
      descriptor: {
        fieldType: "text",
        eventDetailsRole: "couple_names",
        eventDetailsFormat: "linebreak",
      },
      value: "Ana\nLuis\nGomez",
    }),
    "Ana\nLuis Gomez"
  );
  assert.equal(
    normalizeDynamicInlineFieldValue({
      descriptor: { fieldType: "date", controlKind: "datetime-local" },
      value: "2027-04-12T19:45",
    }),
    "2027-04-12T19:45"
  );
});

test("deletion archives exact root targets without retaining dynamic values", () => {
  const target = {
    scope: "objeto",
    id: "date-text",
    path: "texto",
    mode: "set",
    transform: { kind: "date_to_text", preset: "event_date_short_es_ar" },
  };
  const result = planDynamicFieldVisualDeletion({
    fieldsSchema: [{ key: "event-date", type: "date", applyTargets: [target] }],
    objetos: [
      { id: "before", tipo: "texto", texto: "Before" },
      {
        id: "date-text",
        tipo: "texto",
        seccionId: "details",
        x: 180,
        y: 90,
        width: 320,
        fontSize: 28,
        texto: "13/12/2026",
      },
    ],
    selectedRootIds: ["date-text"],
    detachedVisuals: { version: 1, nextSequence: 4, entries: [] },
  });

  assert.deepEqual(result.nextObjetos.map((object) => object.id), ["before"]);
  assert.deepEqual(result.nextFieldsSchema[0].applyTargets, []);
  assert.equal(result.nextDetachedVisuals.nextSequence, 5);
  assert.equal(result.nextDetachedVisuals.entries[0].sequence, 4);
  assert.equal(result.nextDetachedVisuals.entries[0].object.texto, "");
  assert.equal(result.nextDetachedVisuals.entries[0].object.fontSize, 28);
  assert.deepEqual(result.nextDetachedVisuals.entries[0].targets, [
    { fieldKey: "event-date", target },
  ]);
  assert.equal(result.affected.hasLinkedVisuals, true);
});

test("combined couple-name deletion and restore stay linked to both sidebar fields", () => {
  const primaryKey = "event_primary_person_name";
  const secondaryKey = "event_secondary_person_name";
  const coupleKey = "event_couple_names_ampersand";
  const coupleTarget = {
    scope: "objeto",
    id: "couple-names",
    path: "texto",
    mode: "set",
  };
  const fieldsSchema = [
    {
      key: primaryKey,
      eventDetailsRole: "primary_person_name",
      applyTargets: [],
    },
    {
      key: secondaryKey,
      eventDetailsRole: "secondary_person_name",
      applyTargets: [],
    },
    {
      key: coupleKey,
      eventDetailsRole: "couple_names",
      eventDetailsFormat: "ampersand",
      applyTargets: [coupleTarget],
    },
  ];
  const deletion = planDynamicFieldVisualDeletion({
    fieldsSchema,
    objetos: [
      {
        id: "couple-names",
        tipo: "texto",
        seccionId: "cover",
        x: 80,
        y: 120,
        width: 300,
        fontSize: 34,
        texto: "Sofia & Mateo",
      },
    ],
    secciones: [{ id: "cover", altura: 500 }],
    selectedRootIds: ["couple-names"],
  });

  assert.deepEqual(deletion.nextFieldsSchema.map((field) => field.applyTargets), [
    [],
    [],
    [],
  ]);
  assert.deepEqual(deletion.nextDetachedVisuals.entries[0].fieldKeys, [
    coupleKey,
    primaryKey,
    secondaryKey,
  ]);
  assert.deepEqual(deletion.nextDetachedVisuals.entries[0].targets, [
    { fieldKey: coupleKey, target: coupleTarget },
  ]);

  const primaryStatus = resolveDynamicFieldVisualStatus({
    fieldsSchema: deletion.nextFieldsSchema,
    fieldKeys: [primaryKey, coupleKey],
    objetos: deletion.nextObjetos,
    detachedVisuals: deletion.nextDetachedVisuals,
  });
  const secondaryStatus = resolveDynamicFieldVisualStatus({
    fieldsSchema: deletion.nextFieldsSchema,
    fieldKeys: [secondaryKey, coupleKey],
    objetos: deletion.nextObjetos,
    detachedVisuals: deletion.nextDetachedVisuals,
  });

  assert.equal(primaryStatus.state, "absent");
  assert.equal(secondaryStatus.state, "absent");
  assert.equal(primaryStatus.hasRecoverableVisual, true);
  assert.equal(secondaryStatus.hasRecoverableVisual, true);
  assert.equal(primaryStatus.restoreFieldKey, coupleKey);
  assert.equal(secondaryStatus.restoreFieldKey, coupleKey);

  const restored = restoreDynamicFieldVisual({
    fieldKey: primaryStatus.restoreFieldKey,
    representationKind: "auto",
    fieldsSchema: deletion.nextFieldsSchema,
    objetos: deletion.nextObjetos,
    secciones: [{ id: "cover", altura: 500 }],
    activeSection: "cover",
    detachedVisuals: deletion.nextDetachedVisuals,
  });

  assert.equal(restored.reason, "restored");
  assert.equal(restored.nextObjetos[0].id, "couple-names");
  assert.equal(restored.nextObjetos[0].fontSize, 34);
  assert.equal(restored.nextObjetos[0].width, 300);
  assert.deepEqual(restored.nextFieldsSchema[0].applyTargets, []);
  assert.deepEqual(restored.nextFieldsSchema[1].applyTargets, []);
  assert.deepEqual(restored.nextFieldsSchema[2].applyTargets, [coupleTarget]);
  assert.deepEqual(restored.nextDetachedVisuals.entries, []);

  const restoredPrimaryStatus = resolveDynamicFieldVisualStatus({
    fieldsSchema: restored.nextFieldsSchema,
    fieldKeys: [primaryKey, coupleKey],
    objetos: restored.nextObjetos,
  });
  const restoredSecondaryStatus = resolveDynamicFieldVisualStatus({
    fieldsSchema: restored.nextFieldsSchema,
    fieldKeys: [secondaryKey, coupleKey],
    objetos: restored.nextObjetos,
  });
  assert.equal(restoredPrimaryStatus.state, "visible");
  assert.equal(restoredSecondaryStatus.state, "visible");
  assert.deepEqual(restoredPrimaryStatus.objectIds, ["couple-names"]);
  assert.deepEqual(restoredSecondaryStatus.objectIds, ["couple-names"]);
});

test("sidebar aliases can recover a legacy combined-name cache entry", () => {
  const primaryKey = "event_primary_person_name";
  const coupleKey = "event_couple_names_ampersand";
  const status = resolveDynamicFieldVisualStatus({
    fieldsSchema: [
      { key: primaryKey, applyTargets: [] },
      { key: coupleKey, applyTargets: [] },
    ],
    fieldKeys: [primaryKey, coupleKey],
    objetos: [],
    detachedVisuals: {
      version: 1,
      nextSequence: 2,
      entries: [
        {
          id: "legacy-combined-name",
          sequence: 1,
          fieldKeys: [coupleKey],
          object: { id: "couple-names", tipo: "texto", texto: "" },
          targets: [
            {
              fieldKey: coupleKey,
              target: { scope: "objeto", id: "couple-names", path: "texto" },
            },
          ],
          source: { kind: "root", rootId: "couple-names", rootIndex: 0 },
        },
      ],
    },
  });

  assert.equal(status.hasRecoverableVisual, true);
  assert.equal(status.recoverableEntryId, "legacy-combined-name");
  assert.equal(status.restoreFieldKey, coupleKey);
});

test("deletion materializes only a targeted group child as a recoverable standalone root", () => {
  const result = planDynamicFieldVisualDeletion({
    fieldsSchema: [
      {
        key: "party-address",
        applyTargets: [
          { scope: "objeto", id: "address-child", path: "texto" },
        ],
      },
    ],
    objetos: [
      {
        id: "party-group",
        tipo: "grupo",
        seccionId: "party",
        functionalAssociation: "party",
        x: 100,
        y: 200,
        children: [
          { id: "sibling", tipo: "icono", x: 0, y: 0 },
          {
            id: "address-child",
            tipo: "texto",
            x: 35,
            y: 45,
            width: 260,
            texto: "Dirección anterior",
          },
        ],
      },
    ],
    secciones: [{ id: "party", orden: 0, altura: 500, altoModo: "fijo" }],
    selectedRootIds: ["party-group"],
  });
  const entry = result.nextDetachedVisuals.entries[0];

  assert.equal(entry.source.kind, "group-child");
  assert.equal(entry.source.rootId, "party-group");
  assert.equal(entry.source.childIndex, 1);
  assert.equal(entry.object.id, "address-child");
  assert.equal(entry.object.tipo, "texto");
  assert.equal(entry.object.x, 135);
  assert.equal(entry.object.y, 245);
  assert.equal(entry.object.seccionId, "party");
  assert.equal(entry.object.functionalAssociation, "party");
  assert.equal("children" in entry.object, false);
});

test("deletion keeps only the latest visual configuration per field", () => {
  const result = planDynamicFieldVisualDeletion({
    fieldsSchema: [
      {
        key: "story",
        applyTargets: [
          { scope: "objeto", id: "story-a", path: "texto" },
          { scope: "objeto", id: "story-b", path: "texto" },
        ],
      },
    ],
    objetos: [
      { id: "story-a", tipo: "texto", texto: "A", fontSize: 20 },
      { id: "story-b", tipo: "texto", texto: "B", fontSize: 30 },
    ],
    selectedRootIds: ["story-a", "story-b"],
    detachedVisuals: {
      version: 1,
      nextSequence: 9,
      entries: [
        {
          id: "older",
          sequence: 8,
          fieldKeys: ["story"],
          object: { id: "story-old", tipo: "texto" },
          targets: [
            {
              fieldKey: "story",
              target: { scope: "objeto", id: "story-old", path: "texto" },
            },
          ],
          source: { kind: "root", rootId: "story-old", rootIndex: 0 },
        },
      ],
    },
  });

  assert.equal(result.nextDetachedVisuals.entries.length, 1);
  assert.equal(result.nextDetachedVisuals.entries[0].object.id, "story-b");
  assert.equal(result.nextDetachedVisuals.entries[0].object.fontSize, 30);
  assert.equal(result.nextDetachedVisuals.entries[0].sequence, 10);
  assert.equal(result.nextDetachedVisuals.nextSequence, 11);
});

test("deletion retains only the latest configuration per field across visual kinds", () => {
  const result = planDynamicFieldVisualDeletion({
    fieldsSchema: [
      {
        key: "date",
        type: "date",
        eventDetailsRole: "ceremony_date",
        applyTargets: [
          { scope: "objeto", id: "date-text", path: "texto" },
          { scope: "objeto", id: "countdown", path: "fechaObjetivo" },
        ],
      },
      {
        key: "start-time",
        type: "time",
        eventDetailsRole: "ceremony_start_time",
        applyTargets: [],
      },
    ],
    objetos: [
      { id: "date-text", tipo: "texto", texto: "10 de mayo" },
      {
        id: "countdown",
        tipo: "countdown",
        fechaObjetivo: "2030-05-10T20:00:00.000Z",
      },
    ],
    selectedRootIds: ["date-text", "countdown"],
  });

  assert.deepEqual(
    result.nextDetachedVisuals.entries.map((entry) => entry.object.tipo),
    ["countdown"]
  );
  assert.deepEqual(result.nextDetachedVisuals.entries[0].fieldKeys, [
    "date",
    "start-time",
  ]);
});

test("deletion strips map, countdown, and gallery data while preserving visual configuration", () => {
  const fieldsSchema = [
    {
      key: "address",
      eventDetailsRole: "ceremony_venue_address",
      applyTargets: [{ scope: "objeto", id: "map", path: "googlePlaceId" }],
    },
    {
      key: "date",
      eventDetailsRole: "ceremony_date",
      applyTargets: [{ scope: "objeto", id: "countdown", path: "fechaObjetivo" }],
    },
    {
      key: "start-time",
      eventDetailsRole: "ceremony_start_time",
      applyTargets: [],
    },
    {
      key: "photos",
      type: "images",
      applyTargets: [{ scope: "objeto", id: "gallery", path: "cells" }],
    },
  ];
  const result = planDynamicFieldVisualDeletion({
    fieldsSchema,
    objetos: [
      {
        id: "map",
        tipo: "mapa-google",
        width: 361,
        height: 220,
        googleMapZoom: 15,
        googlePlaceId: "place-id",
        googleDisplayName: "Salón",
        googleFormattedAddress: "Calle 1",
        googleAddressComponents: [{ type: "route" }],
        googleLat: -34,
        googleLng: -58,
      },
      {
        id: "countdown",
        tipo: "countdown",
        preset: "minimal",
        fechaObjetivo: "2030-01-01T00:00:00.000Z",
        targetISO: "legacy-target",
        fechaISO: "legacy-date",
      },
      {
        id: "gallery",
        tipo: "galeria",
        rows: 1,
        cols: 1,
        cells: [
          {
            id: "cell-1",
            mediaUrl: "https://cdn.test/photo.jpg",
            storagePath: "images/photo.jpg",
            assetId: "photo",
            fit: "contain",
            crop: { x: 0.2, y: 0.3 },
          },
        ],
      },
    ],
    selectedRootIds: ["map", "countdown", "gallery"],
  });
  const byId = new Map(
    result.nextDetachedVisuals.entries.map((entry) => [entry.object.id, entry])
  );

  assert.equal(byId.get("map").source.kind, "event-map");
  assert.equal(byId.get("map").object.googlePlaceId, "");
  assert.deepEqual(byId.get("map").object.googleAddressComponents, []);
  assert.equal(byId.get("map").object.googleLat, null);
  assert.equal(byId.get("map").object.googleMapZoom, 15);
  assert.equal(byId.get("countdown").object.fechaObjetivo, "");
  assert.equal(byId.get("countdown").object.targetISO, "");
  assert.equal(byId.get("countdown").object.fechaISO, "");
  assert.equal(byId.get("countdown").object.preset, "minimal");
  assert.deepEqual(byId.get("countdown").fieldKeys, ["date", "start-time"]);
  assert.equal(byId.get("gallery").object.cells[0].mediaUrl, null);
  assert.equal(byId.get("gallery").object.cells[0].storagePath, undefined);
  assert.equal(byId.get("gallery").object.cells[0].fit, "contain");
  assert.deepEqual(byId.get("gallery").object.cells[0].crop, { x: 0.2, y: 0.3 });

  const restoredFromTime = restoreDynamicFieldVisual({
    fieldKey: "start-time",
    representationKind: "countdown",
    fieldsSchema: result.nextFieldsSchema,
    objetos: result.nextObjetos,
    detachedVisuals: result.nextDetachedVisuals,
  });
  assert.equal(restoredFromTime.reason, "restored");
  assert.equal(restoredFromTime.restoredRootId, "countdown");
  assert.equal(
    restoredFromTime.nextFieldsSchema.find((field) => field.key === "date")
      .applyTargets[0].id,
    "countdown"
  );
});

test("implicit map deletion caches its visual without inventing an applyTarget", () => {
  const result = planDynamicFieldVisualDeletion({
    fieldsSchema: [
      {
        key: "ceremony-address",
        eventDetailsRole: "ceremony_venue_address",
        applyTargets: [],
      },
    ],
    objetos: [
      {
        id: "map",
        tipo: "mapa-google",
        eventDetailsFeature: "ceremony",
        mostrarMapa: true,
      },
    ],
    selectedRootIds: ["map"],
  });

  assert.equal(result.affected.hasLinkedTargets, false);
  assert.equal(result.affected.hasLinkedVisuals, true);
  assert.deepEqual(result.affected.fieldKeys, ["ceremony-address"]);
  assert.equal(result.nextDetachedVisuals.entries.length, 1);
  assert.deepEqual(result.nextDetachedVisuals.entries[0].fieldKeys, [
    "ceremony-address",
  ]);
  assert.deepEqual(result.nextDetachedVisuals.entries[0].targets, []);
  assert.equal(result.nextDetachedVisuals.entries[0].source.kind, "event-map");

  const restored = restoreDynamicFieldVisual({
    fieldKey: "ceremony-address",
    representationKind: "map",
    fieldsSchema: result.nextFieldsSchema,
    objetos: result.nextObjetos,
    secciones: [{ id: "details", altura: 500 }],
    activeSection: "details",
    detachedVisuals: result.nextDetachedVisuals,
  });
  assert.equal(restored.reason, "restored");
  assert.equal(restored.nextObjetos[0].tipo, "mapa-google");
  assert.deepEqual(restored.nextFieldsSchema[0].applyTargets, []);
  assert.deepEqual(restored.nextDetachedVisuals.entries, []);
});

test("restore recovers exact target config, remaps collisions, and consumes its entry", () => {
  const target = {
    scope: "objeto",
    id: "date-text",
    path: "texto",
    mode: "replace",
    transform: { kind: "date_to_text", preset: "event_date_pipe_short_year_es_ar" },
  };
  const result = restoreDynamicFieldVisual({
    fieldKey: "event-date",
    representationKind: "auto",
    fieldsSchema: [{ key: "event-date", type: "date", applyTargets: [] }],
    objetos: [{ id: "date-text", tipo: "icono", seccionId: "active" }],
    secciones: [{ id: "active", altura: 500 }],
    activeSection: "active",
    detachedVisuals: {
      version: 1,
      nextSequence: 3,
      entries: [
        {
          id: "detached-date",
          sequence: 2,
          fieldKeys: ["event-date"],
          object: {
            id: "date-text",
            tipo: "texto",
            seccionId: "removed-section",
            x: 90,
            y: 120,
            width: 280,
            fontSize: 32,
            texto: "",
          },
          targets: [{ fieldKey: "event-date", target }],
          source: {
            kind: "group-child",
            rootId: "former-group",
            rootIndex: 0,
            childIndex: 1,
            sectionId: "removed-section",
          },
        },
      ],
    },
  });

  assert.equal(result.reason, "restored");
  assert.equal(result.restoredRootId, "date-text-restored");
  assert.equal(result.nextObjetos[0].tipo, "texto");
  assert.equal(result.nextObjetos[0].seccionId, "active");
  assert.equal(result.nextObjetos[0].fontSize, 32);
  assert.deepEqual(result.nextFieldsSchema[0].applyTargets, [
    { ...target, id: "date-text-restored" },
  ]);
  assert.deepEqual(result.nextDetachedVisuals.entries, []);
});

test("restore uses a supplied consistent default and does not duplicate hidden links", () => {
  const defaultResult = restoreDynamicFieldVisual({
    fieldKey: "story",
    kind: "text",
    fieldsSchema: [{ key: "story", applyTargets: [] }],
    objetos: [],
    secciones: [{ id: "details", altura: 500 }],
    activeSection: { id: "details" },
    defaultObject: {
      id: "story-default",
      tipo: "texto",
      x: 80,
      y: 80,
      width: 320,
      texto: "",
    },
    defaultTarget: {
      scope: "objeto",
      id: "story-default",
      path: "texto",
      mode: "set",
    },
  });
  assert.equal(defaultResult.reason, "default-inserted");
  assert.equal(defaultResult.nextObjetos[0].seccionId, "details");
  assert.equal(defaultResult.nextFieldsSchema[0].applyTargets[0].id, "story-default");

  const hiddenResult = restoreDynamicFieldVisual({
    fieldKey: "story",
    fieldsSchema: [
      {
        key: "story",
        applyTargets: [{ scope: "objeto", id: "story-hidden", path: "texto" }],
      },
    ],
    objetos: [{ id: "story-hidden", tipo: "texto", hidden: true }],
    detachedVisuals: defaultResult.nextDetachedVisuals,
    defaultObject: { id: "second", tipo: "texto" },
    defaultTarget: { scope: "objeto", id: "second", path: "texto" },
  });
  assert.equal(hiddenResult.reason, "field-already-linked");
  assert.equal(hiddenResult.restoredRootId, null);
});
