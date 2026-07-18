import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogFromTemplate,
  normalizeTemplateDocument,
} from "./contract.js";

test("full template normalization preserves editor protected-section markers", () => {
  const normalized = normalizeTemplateDocument(
    {
      id: "template-1",
      nombre: "Template",
      secciones: [
        {
          id: "final",
          orden: 1,
          altura: 180,
          bloqueada: true,
          bloqueoMotivo: "system-final-section",
        },
      ],
    },
    "template-1"
  );

  assert.equal(normalized.secciones[0].bloqueada, true);
  assert.equal(normalized.secciones[0].bloqueoMotivo, "system-final-section");
});

test("template catalog normalization does not expose editor section lock metadata", () => {
  const catalog = buildCatalogFromTemplate({
    id: "template-1",
    nombre: "Template",
    secciones: [
      {
        id: "final",
        orden: 1,
        altura: 180,
        bloqueada: true,
        bloqueoMotivo: "admin-section-lock",
      },
    ],
  });

  assert.equal("secciones" in catalog, false);
});

test("template normalization preserves date text format presets", () => {
  const normalized = normalizeTemplateDocument(
    {
      id: "template-1",
      nombre: "Template",
      fieldsSchema: [
        {
          key: "event_date",
          label: "Fecha",
          type: "date",
          dateTextFormatPreset: "event_date_slash_short_year_es_ar",
          applyTargets: [
            {
              scope: "objeto",
              id: "date-short",
              path: "texto",
              mode: "set",
              transform: {
                kind: "date_to_text",
                preset: "event_date_slash_short_year_es_ar",
              },
            },
            {
              scope: "objeto",
              id: "date-long",
              path: "texto",
              mode: "set",
              transform: {
                kind: "date_to_text",
                preset: "event_date_long_es_ar",
              },
            },
          ],
        },
      ],
    },
    "template-1"
  );

  const field = normalized.fieldsSchema[0];
  assert.equal(field.dateTextFormatPreset, "event_date_slash_short_year_es_ar");
  assert.deepEqual(
    field.applyTargets.map((target) => target.transform?.preset),
    ["event_date_slash_short_year_es_ar", "event_date_long_es_ar"]
  );
});
