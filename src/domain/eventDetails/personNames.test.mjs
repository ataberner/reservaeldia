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
  resolveEventPersonNamesFromAuthoring,
  splitEventCoupleNamesText,
} from "./personNames.js";
import {
  buildTemplateAuthoringTargetPatches,
} from "../templates/authoring/targetApplication.js";

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
