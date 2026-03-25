import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRsvpConfig as normalizeClientRsvpConfig } from "./config.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

function requireBuiltModule(relativePath) {
  const absolutePath = join(__dirname, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Missing built module '${relativePath}'. Run 'npm run build' inside functions before running this test.`
    );
  }
  return require(absolutePath);
}

const {
  normalizeRsvpConfig: normalizeServerRsvpConfig,
} = requireBuiltModule("../../../functions/lib/rsvp/config.js");

function toComparable(value) {
  return JSON.parse(JSON.stringify(value));
}

const REPRESENTATIVE_CASES = [
  {
    name: "legacy modal aliases and sheetUrl",
    input: {
      title: "  Confirmar asistencia ya  ",
      subtitle: "  Completa el formulario para avisarnos.  ",
      buttonText: "  Enviar RSVP  ",
      primaryColor: "#12AaFF",
      sheetUrl: " https://example.com/hooks/rsvp ",
      presetId: "minimal",
      limits: {
        maxQuestions: 30,
        maxCustomQuestions: 5,
      },
      questions: [
        {
          id: "attendance",
          active: true,
          order: 1,
          required: true,
          options: [
            { id: "yes", label: " Si, voy " },
            { id: "no", label: " No puedo " },
          ],
        },
        {
          id: "custom_1",
          type: "long_text",
          label: "  Alergias o comentarios  ",
          active: true,
          order: 7,
        },
        {
          id: "unknown_question",
          label: "Se ignora",
          active: true,
          order: 0,
        },
      ],
    },
  },
  {
    name: "explicitly disabled config with enforced limits",
    input: {
      enabled: false,
      presetId: "wedding_complete",
      modal: {
        title: "  Fiesta  ",
        subtitle: "  Contanos si venis  ",
        submitLabel: "  Confirmar  ",
        primaryColor: "invalid-color",
      },
      sheetUrl: " https://sheet.example.com/rsvp ",
      limits: {
        maxQuestions: 2,
        maxCustomQuestions: 1,
      },
      questions: [
        {
          id: "custom_1",
          type: "long_text",
          label: "  Comentarios  ",
          active: true,
          required: true,
          order: 0,
        },
        {
          id: "custom_2",
          type: "short_text",
          label: "  Cancion sugerida  ",
          active: true,
          order: 1,
        },
        {
          id: "plus_one",
          active: true,
          order: 2,
        },
        {
          id: "full_name",
          active: true,
          required: true,
          order: 3,
        },
      ],
    },
  },
  {
    name: "stored config without enabled flag",
    input: {
      presetId: "basic",
      sheetUrl: " https://example.com/rsvp-sheet ",
      modal: {
        title: "  Hola  ",
      },
      questions: [
        {
          id: "full_name",
          active: true,
          required: true,
          order: 0,
        },
        {
          id: "attendance",
          active: true,
          required: true,
          order: 1,
        },
        {
          id: "party_size",
          active: false,
          order: 2,
        },
      ],
    },
  },
];

test("client and server RSVP normalization stay in parity for representative configs", () => {
  REPRESENTATIVE_CASES.forEach(({ name, input }) => {
    const clientNormalized = toComparable(normalizeClientRsvpConfig(input));
    const serverNormalized = toComparable(normalizeServerRsvpConfig(input));

    assert.deepEqual(clientNormalized, serverNormalized, name);
  });
});

test("editor-side RSVP normalization preserves missing enabled as active for stored configs", () => {
  const normalized = normalizeClientRsvpConfig(
    {
      sheetUrl: " https://example.com/editor-sheet ",
      title: "  Confirmar  ",
    },
    { forceEnabled: false }
  );

  assert.equal(normalized.enabled, true);
  assert.equal(normalized.sheetUrl, "https://example.com/editor-sheet");
  assert.equal(normalized.modal.title, "Confirmar");
});

test("editor-side RSVP normalization preserves explicit disabled configs", () => {
  const normalized = normalizeClientRsvpConfig(
    {
      enabled: false,
      sheetUrl: " https://example.com/editor-sheet ",
    },
    { forceEnabled: false }
  );

  assert.equal(normalized.enabled, false);
  assert.equal(normalized.sheetUrl, "https://example.com/editor-sheet");
});

test("editor-side RSVP normalization keeps nullish configs disabled", () => {
  const normalized = normalizeClientRsvpConfig(null, { forceEnabled: false });

  assert.equal(normalized.enabled, false);
  assert.equal("sheetUrl" in normalized, false);
});
