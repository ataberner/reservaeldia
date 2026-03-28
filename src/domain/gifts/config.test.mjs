import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeGiftConfig as normalizeClientGiftConfig } from "./config.js";

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
  normalizeGiftConfig: normalizeServerGiftConfig,
} = requireBuiltModule("../../../functions/lib/gifts/config.js");

function toComparable(value) {
  return JSON.parse(JSON.stringify(value));
}

const REPRESENTATIVE_CASES = [
  {
    name: "legacy-like visibility values and external list url",
    input: {
      introText: "  Si desean hacernos un regalo, aqui van los datos.  ",
      bank: {
        alias: "  pareja.regalo  ",
        cbu: " 0001234500001234500012 ",
      },
      visibility: {
        alias: "true",
        cbu: 1,
        giftListLink: "yes",
      },
      giftListUrl: " regalos.example.com/lista ",
    },
  },
  {
    name: "explicitly disabled config with invalid gift list url",
    input: {
      enabled: false,
      introText: "  Regalos deshabilitados  ",
      bank: {
        holder: " Ana y Manuel ",
        alias: " alias.fixture ",
      },
      visibility: {
        holder: true,
        alias: true,
        giftListLink: true,
      },
      giftListUrl: " ftp://example.com/no-valido ",
    },
  },
  {
    name: "stored config without enabled flag keeps sanitized values",
    input: {
      bank: {
        bank: " Banco Demo ",
        cuit: " 20-12345678-9 ",
      },
      visibility: {
        bank: true,
        cuit: true,
      },
      giftListUrl: " https://example.com/regalos ",
    },
  },
];

test("client and server gifts normalization stay in parity for representative configs", () => {
  REPRESENTATIVE_CASES.forEach(({ name, input }) => {
    const clientNormalized = toComparable(normalizeClientGiftConfig(input));
    const serverNormalized = toComparable(normalizeServerGiftConfig(input));

    assert.deepEqual(clientNormalized, serverNormalized, name);
  });
});

test("editor-side gifts normalization preserves explicit disabled configs", () => {
  const normalized = normalizeClientGiftConfig(
    {
      enabled: false,
      giftListUrl: " https://example.com/regalos ",
    },
    { forceEnabled: false }
  );

  assert.equal(normalized.enabled, false);
  assert.equal(normalized.giftListUrl, "https://example.com/regalos");
});

test("editor-side gifts normalization keeps nullish configs disabled", () => {
  const normalized = normalizeClientGiftConfig(null, { forceEnabled: false });

  assert.equal(normalized.enabled, false);
  assert.equal(normalized.giftListUrl, "");
});
