import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const { generarHTMLDesdeObjetos } = requireBuiltModule("lib/utils/generarHTMLDesdeObjetos.js");
const { generarHTMLDesdeSecciones } = requireBuiltModule("lib/utils/generarHTMLDesdeSecciones.js");

const FIXED_SECTION = [{ id: "section-1", orden: 1, altoModo: "fijo", altura: 600 }];

test("generates explicit countdown contract markers for v1 and v2 objects", () => {
  const legacyHtml = generarHTMLDesdeObjetos(
    [
      {
        id: "count-legacy",
        tipo: "countdown",
        seccionId: "section-1",
        fechaISO: "2026-05-10T20:00:00.000Z",
        width: 280,
        height: 96,
        color: "#111111",
      },
    ],
    FIXED_SECTION
  );

  assert.match(legacyHtml, /data-countdown-contract="v1"/);
  assert.match(legacyHtml, /data-countdown-target-source="fechaISO"/);
  assert.doesNotMatch(legacyHtml, /data-countdown-v2="1"/);

  const modernHtml = generarHTMLDesdeObjetos(
    [
      {
        id: "count-modern",
        tipo: "countdown",
        seccionId: "section-1",
        countdownSchemaVersion: 2,
        fechaObjetivo: "2026-05-10T20:00:00.000Z",
        width: 320,
        height: 120,
        frameSvgUrl: "https://cdn.example.com/frame.svg",
        visibleUnits: ["days", "hours", "minutes", "seconds"],
      },
    ],
    FIXED_SECTION
  );

  assert.match(modernHtml, /data-countdown-contract="v2"/);
  assert.match(modernHtml, /data-countdown-v2="1"/);
  assert.match(modernHtml, /data-countdown-target-source="fechaObjetivo"/);
});

test("injects runtime branching based on explicit countdown contracts", () => {
  const html = generarHTMLDesdeSecciones(
    FIXED_SECTION,
    [
      {
        id: "count-legacy",
        tipo: "countdown",
        seccionId: "section-1",
        fechaISO: "2026-05-10T20:00:00.000Z",
        width: 280,
        height: 96,
      },
      {
        id: "count-modern",
        tipo: "countdown",
        seccionId: "section-1",
        countdownSchemaVersion: 2,
        fechaObjetivo: "2026-05-10T20:00:00.000Z",
        width: 320,
        height: 120,
        visibleUnits: ["days", "hours", "minutes", "seconds"],
      },
    ],
    null,
    {}
  );

  assert.match(html, /function resolveCountdownContract\(root\)/);
  assert.match(html, /data-countdown-contract="v1"/);
  assert.match(html, /data-countdown-contract="v2"/);
  assert.match(html, /if \(resolveCountdownContract\(root\) === "v2"\)/);
});
