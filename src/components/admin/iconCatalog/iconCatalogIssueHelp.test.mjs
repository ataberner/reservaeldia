import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getIconCatalogIssueHelp } from "./iconCatalogMappers.js";

function icon(overrides = {}) {
  return {
    id: "icon-1",
    status: "active",
    validationStatus: "passed",
    validation: {
      status: "passed",
      errors: [],
      warnings: [],
    },
    archivedReason: "",
    duplicateOf: "",
    ...overrides,
  };
}

test("healthy and manually archived icons do not show issue help", () => {
  assert.equal(getIconCatalogIssueHelp(icon()), null);
  assert.equal(
    getIconCatalogIssueHelp(icon({ status: "archived", validationStatus: "passed" })),
    null
  );
});

test("warning help explains the user-visible effect and a corrective action", () => {
  const help = getIconCatalogIssueHelp(icon({
    validationStatus: "warning",
    validation: {
      status: "warning",
      errors: [],
      warnings: [
        { code: "ICON_SVG_FIXED_COLOR", severity: "warning" },
        { code: "ICON_SVG_NON_SQUARE_VIEWBOX", severity: "warning" },
      ],
    },
  }));

  assert.equal(help?.tone, "warning");
  assert.equal(help?.title, "Advertencia");
  assert.match(help?.entries[0]?.problem || "", /colores originales/i);
  assert.match(help?.entries[0]?.solution || "", /editor/i);
  assert.match(help?.entries[1]?.problem || "", /proporcion rectangular/i);
});

test("rejected, duplicate and processing states explain why activation is blocked", () => {
  const rejected = getIconCatalogIssueHelp(icon({
    status: "archived",
    validationStatus: "rejected",
    archivedReason: "validation-rejected",
    validation: {
      status: "rejected",
      warnings: [],
      errors: [{ code: "ICON_SVG_MISSING_VIEWBOX", severity: "error" }],
    },
  }));
  assert.equal(rejected?.tone, "error");
  assert.equal(rejected?.title, "No se puede activar");
  assert.match(rejected?.entries[0]?.solution || "", /viewBox/i);

  const duplicate = getIconCatalogIssueHelp(icon({
    status: "archived",
    archivedReason: "duplicate-content",
    duplicateOf: "original-7",
  }));
  assert.equal(duplicate?.tone, "error");
  assert.match(duplicate?.entries[0]?.solution || "", /original-7/);

  const processing = getIconCatalogIssueHelp(icon({ status: "processing" }));
  assert.equal(processing?.tone, "processing");
  assert.match(processing?.entries[0]?.solution || "", /Rev/);
});

test("unknown backend issues keep the explanation non-technical", () => {
  const help = getIconCatalogIssueHelp(icon({
    validationStatus: "rejected",
    validation: {
      status: "rejected",
      warnings: [],
      errors: [{ code: "FUTURE_TECHNICAL_CODE", message: "internal parser x19" }],
    },
  }));

  const copy = `${help?.entries[0]?.problem} ${help?.entries[0]?.solution}`;
  assert.doesNotMatch(copy, /FUTURE_TECHNICAL_CODE|parser x19/);
  assert.match(copy, /informe no guardo|Presiona Rev/i);
});

test("legacy warning strings are translated into an explicit cause and fix", () => {
  const help = getIconCatalogIssueHelp(icon({
    validationStatus: "warning",
    validation: {
      status: "warning",
      errors: [],
      warnings: ["El SVG tenia width/height fijos; el backend los retiro."],
    },
  }));

  const copy = `${help?.entries[0]?.problem} ${help?.entries[0]?.solution}`;
  assert.match(copy, /tamaño fijo/i);
  assert.match(copy, /no hace falta corregir/i);
  assert.doesNotMatch(copy, /revision encontro una observacion/i);
});

test("warning reports without issue entries use their concrete validation checks", () => {
  const help = getIconCatalogIssueHelp(icon({
    validationStatus: "warning",
    validation: {
      status: "warning",
      errors: [],
      warnings: [],
      checks: {
        isSquare: false,
        hasFixedDimensions: false,
        hasPath: true,
        shapeNodeCount: 1,
        colorMode: "currentColor",
      },
    },
  }));

  assert.match(help?.entries[0]?.problem || "", /proporcion rectangular/i);
  assert.match(help?.entries[0]?.solution || "", /area de dibujo cuadrada/i);
});

test("truly incomplete warning reports say what is missing and how to refresh it", () => {
  const help = getIconCatalogIssueHelp(icon({
    validationStatus: "warning",
    validation: {
      status: "warning",
      errors: [],
      warnings: [],
    },
  }));

  const copy = `${help?.entries[0]?.problem} ${help?.entries[0]?.solution}`;
  assert.match(copy, /informe no guardo el motivo/i);
  assert.match(copy, /Presiona Rev/i);
  assert.doesNotMatch(copy, /revision encontro una observacion/i);
});

test("card portals the information tooltip outside the clipped catalog scroller", () => {
  const source = readFileSync(new URL("./IconCatalogCard.jsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("./IconCatalogAdminPage.jsx", import.meta.url), "utf8");
  assert.match(source, /<Info aria-hidden="true"/);
  assert.match(source, /aria-describedby=\{tooltipId\}/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /role="tooltip"/);
  assert.match(source, /createPortal\(/);
  assert.match(source, /className=\{`fixed z-\[100\]/);
  assert.match(source, /onMouseEnter=\{showTooltip\}/);
  assert.match(source, /onFocus=\{showTooltip\}/);
  assert.match(pageSource, /overflow-y-auto/);
  assert.doesNotMatch(source, /group-hover:visible|group-focus-within:visible/);
  assert.match(source, /motion-reduce:transition-none/);
});
