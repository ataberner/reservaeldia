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
