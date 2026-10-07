import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_COUPLE_NAME_FORMATS,
  EVENT_PERSON_NAME_ROLES,
  buildEventPersonNameDefaults,
  ensureEventPersonNameFields,
  formatEventCoupleNames,
  getEventPersonNameFieldKey,
  inferEventCoupleNamesFormat,
  resolveEventCoupleNamesConnector,
  resolveEventCoupleNamesInlineEdit,
  resolveEventPersonNameVisualFieldKeys,
  resolveEventPersonNamesState,
  resolveEventPersonNamesFromAuthoring,
  resolveEventPersonNameBindingsFromAuthoring,
  splitEventCoupleNamesText,
} from "./personNames.js";
import {
  buildTemplateAuthoringTargetPatches,
} from "../templates/authoring/targetApplication.js";

const customPersonFields = [
  { key: "first_guest", type: "text", eventDetailsRole: "primary_person_name", applyTargets: [{ scope: "objeto", id: "first-name", path: "texto" }] },
  { key: "second_guest", type: "text", eventDetailsRole: "secondary_person_name", applyTargets: [{ scope: "objeto", id: "second-name", path: "texto" }] },
];

test("semantic person roles read their declared keys before canonical aliases or stale canvas text", () => {
  const input = { fieldsSchema: customPersonFields,
    defaults: { first_guest: "Ana", second_guest: "Luz", event_primary_person_name: "Alias anterior", event_secondary_person_name: "Otro alias" },
    objetos: [{ id: "first-name", texto: "Vista anterior" }, { id: "second-name", texto: "Otra vista" }] };
  assert.deepEqual(resolveEventPersonNamesFromAuthoring(input), { primaryName: "Ana", secondaryName: "Luz" });
  assert.deepEqual(resolveEventPersonNameBindingsFromAuthoring(input), {
    names: { primaryName: "Ana", secondaryName: "Luz" },
    fieldKeys: { primaryName: "first_guest", secondaryName: "second_guest" },
  });
  input.defaults.first_guest = "";
  assert.deepEqual(resolveEventPersonNamesFromAuthoring(input), { primaryName: "", secondaryName: "Luz" }, "an explicit empty custom field remains authoritative");
});

test("custom person fields round trip through the existing writer without canvas targets", () => {
  const fieldsSchema = customPersonFields.map(field => ({ ...field, applyTargets: [] }));
  const defaults = buildEventPersonNameDefaults({ fieldsSchema, defaults: { first_guest: "Ana", second_guest: "Luz" },
    names: { primaryName: "Sol", secondaryName: "Mar" } });
  assert.deepEqual(defaults, { first_guest: "Sol", second_guest: "Mar" });
  assert.deepEqual(resolveEventPersonNamesFromAuthoring({ fieldsSchema, defaults }), { primaryName: "Sol", secondaryName: "Mar" });
});

test("person bindings identify only the combined source actually used for a missing individual value", () => {
  const fieldsSchema = [...customPersonFields,
    { key: "couple_title", type: "text", eventDetailsRole: "couple_names", applyTargets: [] }];
  assert.deepEqual(resolveEventPersonNameBindingsFromAuthoring({ fieldsSchema,
    defaults: { first_guest: "Sol", couple_title: "Ana y Luz" } }), {
    names: { primaryName: "Sol", secondaryName: "Luz" },
    fieldKeys: { primaryName: "first_guest", secondaryName: "couple_title" },
  });
  assert.deepEqual(resolveEventPersonNameBindingsFromAuthoring({ fieldsSchema,
    defaults: { first_guest: "Sol", second_guest: "", couple_title: "Ana y Luz" } }), {
    names: { primaryName: "Sol", secondaryName: "" },
    fieldKeys: { primaryName: "first_guest", secondaryName: "second_guest" },
  });
});

test("combined person-name visuals depend on both structured name fields", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
    coupleFormats: [EVENT_COUPLE_NAME_FORMATS.AMPERSAND],
  });
  const coupleField = ensured.fieldsSchema.find(
    (field) => field.eventDetailsRole === EVENT_PERSON_NAME_ROLES.COUPLE
  );

  assert.deepEqual(
    resolveEventPersonNameVisualFieldKeys({
      field: coupleField,
      fieldsSchema: ensured.fieldsSchema,
    }),
    [
      getEventPersonNameFieldKey(
        EVENT_PERSON_NAME_ROLES.COUPLE,
        EVENT_COUPLE_NAME_FORMATS.AMPERSAND
      ),
      getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY),
      getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY),
    ]
  );
});

test("infers and splits couple names from common separators", () => {
  assert.equal(
    inferEventCoupleNamesFormat("Sofia & Mateo"),
    EVENT_COUPLE_NAME_FORMATS.AMPERSAND
  );
  assert.deepEqual(splitEventCoupleNamesText("Sofia & Mateo"), {
    primaryName: "Sofia",
    secondaryName: "Mateo",
    format: EVENT_COUPLE_NAME_FORMATS.AMPERSAND,
  });
  assert.deepEqual(splitEventCoupleNamesText("Sofia y Mateo"), {
    primaryName: "Sofia",
    secondaryName: "Mateo",
    format: EVENT_COUPLE_NAME_FORMATS.AND,
  });
  assert.deepEqual(splitEventCoupleNamesText("Sofia\nMateo"), {
    primaryName: "Sofia",
    secondaryName: "Mateo",
    format: EVENT_COUPLE_NAME_FORMATS.LINEBREAK,
  });
});

test("keeps both structured names while an inline connector is being replaced", () => {
  assert.deepEqual(
    resolveEventCoupleNamesInlineEdit({
      text: "Sofia  Mateo",
      currentNames: {
        primaryName: "Sofia",
        secondaryName: "Mateo",
      },
      currentValue: "Sofia & Mateo",
      field: { eventDetailsFormat: EVENT_COUPLE_NAME_FORMATS.AMPERSAND },
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
      format: EVENT_COUPLE_NAME_FORMATS.AMPERSAND,
      connector: "&",
    }
  );
  assert.deepEqual(
    resolveEventCoupleNamesInlineEdit({
      text: "Sofia y Mateo",
      currentNames: {
        primaryName: "Sofia",
        secondaryName: "Mateo",
      },
      currentValue: "Sofia & Mateo",
      field: { eventDetailsFormat: EVENT_COUPLE_NAME_FORMATS.AMPERSAND },
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
      format: EVENT_COUPLE_NAME_FORMATS.AND,
      connector: "y",
    }
  );
  assert.deepEqual(
    resolveEventCoupleNamesInlineEdit({
      text: "Sofia con Mateo",
      currentNames: {
        primaryName: "Sofia",
        secondaryName: "Mateo",
      },
      currentValue: "Sofia y Mateo",
      field: { eventDetailsFormat: EVENT_COUPLE_NAME_FORMATS.AND },
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
      format: EVENT_COUPLE_NAME_FORMATS.AND,
      connector: "con",
    }
  );
  assert.deepEqual(
    resolveEventCoupleNamesInlineEdit({
      text: "Sofi con Mateo",
      currentNames: {
        primaryName: "Sofia",
        secondaryName: "Mateo",
      },
      currentValue: "Sofia con Mateo",
      field: { eventDetailsFormat: EVENT_COUPLE_NAME_FORMATS.AND },
    }),
    {
      primaryName: "Sofi",
      secondaryName: "Mateo",
      format: EVENT_COUPLE_NAME_FORMATS.AND,
      connector: "con",
    }
  );
});

test("ensures event person fields and computes defaults by format", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
    coupleFormats: [EVENT_COUPLE_NAME_FORMATS.AMPERSAND],
  });
  const defaults = buildEventPersonNameDefaults({
    fieldsSchema: ensured.fieldsSchema,
    defaults: {},
    names: {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    },
  });

  assert.equal(ensured.changed, true);
  assert.equal(
    defaults[getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY)],
    "Sofia"
  );
  assert.equal(
    defaults[getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY)],
    "Mateo"
  );
  assert.equal(
    defaults[
      getEventPersonNameFieldKey(
        EVENT_PERSON_NAME_ROLES.COUPLE,
        EVENT_COUPLE_NAME_FORMATS.AMPERSAND
      )
    ],
    "Sofia & Mateo"
  );
});

test("preserves a personalized couple connector when sidebar names change", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
    coupleFormats: [EVENT_COUPLE_NAME_FORMATS.AND],
  });
  const coupleField = ensured.fieldsSchema.find(
    (field) => field.eventDetailsRole === EVENT_PERSON_NAME_ROLES.COUPLE
  );
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
  const inlineDefaults = buildEventPersonNameDefaults({
    fieldsSchema: ensured.fieldsSchema,
    defaults: {
      [coupleField.key]: "Sofia y Mateo",
      [primaryKey]: "Sofia",
      [secondaryKey]: "Mateo",
    },
    names: {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    },
    coupleValueByFieldKey: {
      [coupleField.key]: "Sofia con Mateo",
    },
  });
  const defaults = buildEventPersonNameDefaults({
    fieldsSchema: ensured.fieldsSchema,
    defaults: inlineDefaults,
    names: {
      primaryName: "Sofi",
      secondaryName: "Mateo",
    },
  });

  assert.equal(coupleField.eventDetailsFormat, EVENT_COUPLE_NAME_FORMATS.AND);
  assert.equal(
    resolveEventCoupleNamesConnector({
      field: coupleField,
      value: defaults[coupleField.key],
      names: {
        primaryName: "Sofi",
        secondaryName: "Mateo",
      },
    }),
    "con"
  );
  assert.equal(defaults[coupleField.key], "Sofi con Mateo");
});

test("resolves names from source defaults or combined fallback", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
    coupleFormats: [EVENT_COUPLE_NAME_FORMATS.AND],
  });
  const fieldsSchema = ensured.fieldsSchema;
  const coupleKey = getEventPersonNameFieldKey(
    EVENT_PERSON_NAME_ROLES.COUPLE,
    EVENT_COUPLE_NAME_FORMATS.AND
  );

  assert.deepEqual(
    resolveEventPersonNamesFromAuthoring({
      fieldsSchema,
      defaults: {
        [coupleKey]: "Sofia y Mateo",
      },
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
});

test("resolves person names from visible linked text targets when defaults are empty", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
  });
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
  const fieldsSchema = ensured.fieldsSchema.map((field) => {
    if (field.key === primaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "primary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    if (field.key === secondaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "secondary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    return field;
  });

  assert.deepEqual(
    resolveEventPersonNamesFromAuthoring({
      fieldsSchema,
      defaults: {},
      objetos: [
        {
          id: "primary-name-text",
          tipo: "texto",
          texto: "Sofia",
        },
        {
          id: "secondary-name-text",
          tipo: "texto",
          texto: "Mateo",
        },
      ],
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
});

test("resolves person names from structured values before stale linked views", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
  });
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
  const fieldsSchema = ensured.fieldsSchema.map((field) => {
    if (field.key === primaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "primary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    if (field.key === secondaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "secondary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    return field;
  });

  assert.deepEqual(
    resolveEventPersonNamesFromAuthoring({
      fieldsSchema,
      defaults: {
        [primaryKey]: "Sofia",
        [secondaryKey]: "Mateo",
      },
      objetos: [
        {
          id: "primary-name-text",
          tipo: "texto",
          texto: "Ana",
        },
        {
          id: "secondary-name-text",
          tipo: "texto",
          texto: "Tomas",
        },
      ],
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
});

test("splits visible linked couple names when defaults are empty", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
    coupleFormats: [EVENT_COUPLE_NAME_FORMATS.AMPERSAND],
  });
  const coupleKey = getEventPersonNameFieldKey(
    EVENT_PERSON_NAME_ROLES.COUPLE,
    EVENT_COUPLE_NAME_FORMATS.AMPERSAND
  );
  const fieldsSchema = ensured.fieldsSchema.map((field) =>
    field.key === coupleKey
      ? {
          ...field,
          applyTargets: [
            {
              scope: "objeto",
              id: "couple-names-text",
              path: "texto",
              mode: "set",
            },
          ],
        }
      : field
  );

  assert.deepEqual(
    resolveEventPersonNamesFromAuthoring({
      fieldsSchema,
      defaults: {},
      objetos: [
        {
          id: "couple-names-text",
          tipo: "texto",
          texto: "Sofia & Mateo",
        },
      ],
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
});

test("resolves person names state from a fresh event snapshot before a stale bridge", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
  });
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
  const fieldsSchema = ensured.fieldsSchema.map((field) => {
    if (field.key === primaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "primary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    if (field.key === secondaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "secondary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    return field;
  });

  assert.deepEqual(
    resolveEventPersonNamesState({
      fieldsSchema,
      defaults: {},
      objetos: [],
    }),
    {
      primaryName: "",
      secondaryName: "",
    }
  );
  assert.deepEqual(
    resolveEventPersonNamesState({
      fieldsSchema,
      defaults: {},
      objetos: [
        {
          id: "primary-name-text",
          tipo: "texto",
          texto: "Sofia",
        },
        {
          id: "secondary-name-text",
          tipo: "texto",
          texto: "Mateo",
        },
      ],
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
});

test("resolves person names state from defaults when no linked text target is valid", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
  });
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);

  assert.deepEqual(
    resolveEventPersonNamesState({
      fieldsSchema: ensured.fieldsSchema,
      defaults: {
        [primaryKey]: "Sofia",
        [secondaryKey]: "Mateo",
      },
      objetos: [],
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
});

test("treats missing or invalid person names event payloads as non-authoritative", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
  });

  assert.equal(resolveEventPersonNamesState(), null);
  assert.equal(resolveEventPersonNamesState({}), null);
  assert.equal(resolveEventPersonNamesState({ fieldsSchema: [] }), null);
  assert.equal(
    resolveEventPersonNamesState({ fieldsSchema: ensured.fieldsSchema }),
    null
  );
});

test("keeps bridge fallback available when an event has no person names payload", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
  });
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
  const fallbackSnapshot = {
    fieldsSchema: ensured.fieldsSchema,
    defaults: {
      [primaryKey]: "Sofia",
      [secondaryKey]: "Mateo",
    },
    objetos: [],
  };

  const eventPayloadState = resolveEventPersonNamesState();
  const fallbackState = eventPayloadState || resolveEventPersonNamesState(fallbackSnapshot);

  assert.deepEqual(fallbackState, {
    primaryName: "Sofia",
    secondaryName: "Mateo",
  });
});

test("resolves person names state from linked couple names", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
    coupleFormats: [EVENT_COUPLE_NAME_FORMATS.LINEBREAK],
  });
  const coupleKey = getEventPersonNameFieldKey(
    EVENT_PERSON_NAME_ROLES.COUPLE,
    EVENT_COUPLE_NAME_FORMATS.LINEBREAK
  );
  const fieldsSchema = ensured.fieldsSchema.map((field) =>
    field.key === coupleKey
      ? {
          ...field,
          applyTargets: [
            {
              scope: "objeto",
              id: "couple-names-text",
              path: "texto",
              mode: "set",
            },
          ],
        }
      : field
  );

  assert.deepEqual(
    resolveEventPersonNamesState({
      fieldsSchema,
      defaults: {},
      objetos: [
        {
          id: "couple-names-text",
          tipo: "texto",
          texto: "Sofia\nMateo",
        },
      ],
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
});

test("resolves subsequent person names state updates from linked text targets", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
  });
  const primaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.PRIMARY);
  const secondaryKey = getEventPersonNameFieldKey(EVENT_PERSON_NAME_ROLES.SECONDARY);
  const fieldsSchema = ensured.fieldsSchema.map((field) => {
    if (field.key === primaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "primary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    if (field.key === secondaryKey) {
      return {
        ...field,
        applyTargets: [
          {
            scope: "objeto",
            id: "secondary-name-text",
            path: "texto",
            mode: "set",
          },
        ],
      };
    }
    return field;
  });

  assert.deepEqual(
    resolveEventPersonNamesState({
      fieldsSchema,
      defaults: {},
      objetos: [
        {
          id: "primary-name-text",
          tipo: "texto",
          texto: "Sofia",
        },
        {
          id: "secondary-name-text",
          tipo: "texto",
          texto: "Mateo",
        },
      ],
    }),
    {
      primaryName: "Sofia",
      secondaryName: "Mateo",
    }
  );
  assert.deepEqual(
    resolveEventPersonNamesState({
      fieldsSchema,
      defaults: {},
      objetos: [
        {
          id: "primary-name-text",
          tipo: "texto",
          texto: "Ana",
        },
        {
          id: "secondary-name-text",
          tipo: "texto",
          texto: "Tomas",
        },
      ],
    }),
    {
      primaryName: "Ana",
      secondaryName: "Tomas",
    }
  );
});

test("linked couple field patches text with computed names", () => {
  const ensured = ensureEventPersonNameFields({
    fieldsSchema: [],
    includeBaseFields: true,
    coupleFormats: [EVENT_COUPLE_NAME_FORMATS.AND],
  });
  const coupleKey = getEventPersonNameFieldKey(
    EVENT_PERSON_NAME_ROLES.COUPLE,
    EVENT_COUPLE_NAME_FORMATS.AND
  );
  const field = {
    ...ensured.fieldsSchema.find((entry) => entry.key === coupleKey),
    applyTargets: [
      {
        scope: "objeto",
        id: "names-text",
        path: "texto",
        mode: "set",
      },
    ],
  };
  const value = formatEventCoupleNames({
    primaryName: "Sofia",
    secondaryName: "Mateo",
    format: EVENT_COUPLE_NAME_FORMATS.AND,
  });

  const patches = buildTemplateAuthoringTargetPatches({
    field,
    value,
    objetos: [
      {
        id: "names-text",
        tipo: "texto",
        texto: "Anterior",
        x: 100,
        y: 100,
        fontSize: 24,
      },
    ],
  });

  assert.deepEqual(
    patches.map((entry) => [entry.objectId, entry.patch.texto]),
    [["names-text", "Sofia y Mateo"]]
  );
});
