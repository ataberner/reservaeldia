import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDynamicFieldScrollTarget,
} from "./dynamicFieldTargets.js";

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

